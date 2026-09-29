import logging
from datetime import datetime, timezone
import re
import time
import random
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.models.schemas import (
    StyleProfile,
    Person,
    MeetingDetails,
    AnalyzeRequest,
    EmailItem, GenerateReplyRequest, GenerateReplyResponse,
    ComposeEmailRequest, EmailSummary, ActionItem
)
from app.database.db import db
from app.services.gemini_service import gemini_service
from app.services.style_learner import StyleLearner
from app.services.gmail_service import gmail_service
from app.auth.auth_handler import get_current_user, UserProfile

logger = logging.getLogger("smart_email_assistant")

router = APIRouter(prefix="/api/emails", tags=["Emails"])

# ================================================================ analyse any
# Registered above the /{email_id} routes: static paths must be matched before
# the parameterised ones or FastAPI will treat "analyze" as an email id.
@router.post("/analyze", response_model=EmailItem)
async def analyze_pasted_email(
    payload: AnalyzeRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """Analyse an email the user pasted, then optionally store it.

    The message does not have to come from a connected mailbox, which is the
    point: forwarded threads, text copied out of a screenshot and mail from a
    provider you have not linked all work.
    """
    body = (payload.body or "").strip()
    subject = (payload.subject or "").strip()
    if not body and not subject:
        raise HTTPException(status_code=400, detail="Provide the email body or subject.")

    sender_email = (payload.sender_email or "").strip().lower()
    sender_name = (payload.sender_name or "").strip() or (
        sender_email.split("@")[0] if sender_email else "Unknown sender"
    )

    from app.services.gemini import analyze_email_ai, analyze_phishing_ai
    analysis = await analyze_email_ai(subject=subject, body=body, sender=sender_name)
    phishing = await analyze_phishing_ai(subject=subject, body=body, sender=sender_email)

    reply_text = None
    if payload.generate_reply:
        tone = payload.tone or analysis.get("tone") or "Professional"
        reply_text = await generate_reply_for(
            user_email=current_user.email,
            subject=subject,
            body=body,
            sender_name=sender_name,
            tone=tone,
            personalize=payload.personalize,
        )

    meeting = analysis.get("meeting")
    is_spam = phishing.get("status") == "Phishing" or analysis["category"] == "Spam"

    item = EmailItem(
        id=f"em-pasted-{int(time.time() * 1000)}",
        user_email=current_user.email,
        sender_name=sender_name,
        sender_email=sender_email,
        recipient_email=current_user.email,
        subject=subject or "(no subject)",
        snippet=body[:160],
        body=body,
        category=analysis["category"],
        priority=analysis["priority"],
        date=time.strftime("%d %b, %H:%M"),
        timestamp=time.time(),
        is_read=False,
        is_starred=analysis["priority"] == "High",
        is_spam=is_spam,
        folder="spam" if is_spam else "inbox",
        summary=EmailSummary(
            one_liner=analysis["one_liner"],
            bullet_points=analysis["bullet_points"],
            urgency_reason=analysis.get("urgency_reason"),
            sentiment=analysis["sentiment"],
            tone=analysis["tone"],
            key_deadlines=analysis["deadlines"],
            dates=analysis["dates"],
            people=[Person(**x) for x in analysis["people"]],
            meeting=MeetingDetails(**meeting) if meeting else None,
            keywords=analysis["keywords"],
            requires_reply=analysis["requires_reply"],
            importance_score=analysis["importance_score"],
        ),
        action_items=[
            ActionItem(task=a["task"], due_date=a.get("due_date"))
            for a in analysis["action_items"]
        ],
        reply_draft=reply_text,
    )
    if payload.save:
        db.add_email(item)
    return item


@router.get("/history", response_model=List[EmailItem])
def get_history(current_user: UserProfile = Depends(get_current_user)):
    """Everything this account has analysed, newest first."""
    items = db.get_emails(folder="all", user_email=current_user.email)
    return sorted(items, key=lambda e: e.timestamp or 0, reverse=True)


@router.delete("/history/{email_id}")
def delete_history_entry(email_id: str, current_user: UserProfile = Depends(get_current_user)):
    """Remove one analysed email permanently, not to the trash."""
    owned = db.get_email_by_id(email_id, current_user.email)
    if not owned or owned.user_email != current_user.email:
        raise HTTPException(status_code=404, detail="Not found")
    if not db.purge_email(email_id, current_user.email):
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "success"}


# =============================================================== style profile
@router.get("/style-profile", response_model=StyleProfile)
def get_style_profile(current_user: UserProfile = Depends(get_current_user)):
    """What the app has learned about how this account writes.

    Reads the same store the reply generator reads, so what the UI shows and
    what the draft actually imitates cannot disagree. It used to call a
    get_storage() that does not exist and swallow the ImportError, so this
    endpoint always answered "nothing learned" even with a full corpus.

    An empty corpus is reported as ready=False, not as an invented style.
    """
    learner = StyleLearner(db, current_user.email)
    return learner.build_profile()

def _parse_date(value: Optional[str]) -> Optional[float]:
    """Accept ISO-8601, a few common layouts, or epoch seconds.

    Returns None for anything unusable rather than raising, so a malformed
    date in the query string does not become a 500.
    """
    if value in (None, ""):
        return None
    text = str(value).strip()
    try:
        return float(text)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
    return None

# ============================================================ style profile
@router.post("/replies/record")
def record_reply(payload: dict, current_user: UserProfile = Depends(get_current_user)):
    """Record a reply the user actually sent, so style can learn from it.

    Only delivered mail counts. A draft the user never sent is not evidence of
    how they write.
    """
    body = str(payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body is required")
    db.add_sent_reply(
        user_email=current_user.email,
        recipient=str(payload.get("to") or payload.get("recipient") or ""),
        subject=str(payload.get("subject") or ""),
        body=body,
        sent=bool(payload.get("sent", True)),
    )
    return {
        "status": "success",
        "reply_count": db.sent_reply_count(current_user.email),
    }



def _reply_subject(subject: str) -> str:
    """Re: exactly once, whatever the original subject looked like."""
    text = (subject or "").strip()
    return text if text.lower().startswith("re:") else f"Re: {text}"


async def generate_reply_for(user_email: str, subject: str, body: str,
                             sender_name: str, tone: str = "Professional",
                             personalize: bool = False,
                             language: str = "en") -> str:
    """Draft a reply, optionally shaped by the account owner's own style.

    Style is opt-in per request and silently skipped when there is not enough
    sent mail to learn from, rather than faking a personalisation it cannot
    support.
    """
    style_block = ""
    if personalize:
        try:
            learner = StyleLearner(db, user_email)
            profile = learner.build_profile()
            if profile.ready:
                style_block = learner.guidance(
                    profile, learner.representative_examples(limit=3)
                )
        except Exception as exc:  # never let learning break a reply
            logger.warning("Style personalisation unavailable: %s", exc)
            style_block = ""

    from app.services.gemini import generate_smart_reply_ai
    return await generate_smart_reply_ai(
        subject=subject, body=body, sender=sender_name,
        tone=tone, language=language, style_block=style_block,
    )


@router.get("/counts")
async def get_email_counts(current_user: UserProfile = Depends(get_current_user)):
    """Return aggregated mailbox counts for sidebar badges and quick stats."""
    all_emails = db.get_emails(folder="all", user_email=current_user.email)
    if not all_emails:
        await gmail_service.sync_inbox(user_email=current_user.email, user_name=current_user.name)
        all_emails = db.get_emails(folder="all", user_email=current_user.email)

    return {
        "all": len(all_emails),
        "inbox": sum(1 for e in all_emails if e.folder == "inbox"),
        "unread": sum(1 for e in all_emails if not e.is_read and e.folder == "inbox"),
        "starred": sum(1 for e in all_emails if e.is_starred),
        "sent": sum(1 for e in all_emails if e.folder == "sent"),
        "spam": sum(1 for e in all_emails if e.folder == "spam" or (hasattr(e.category, 'value') and e.category.value == "Spam") or str(e.category) == "Spam"),
        "trash": sum(1 for e in all_emails if e.folder == "trash"),
        "urgent": sum(1 for e in all_emails if (hasattr(e.priority, 'value') and e.priority.value == "High" or str(e.priority) == "High") and e.folder == "inbox")
    }

@router.get("", response_model=List[EmailItem])
async def list_emails(
    folder: str = Query("inbox"),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    starred_only: bool = Query(False),
    has_attachments: Optional[bool] = Query(None),
    tone: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, description="ISO date or epoch seconds, inclusive"),
    to_date: Optional[str] = Query(None, description="ISO date or epoch seconds, inclusive"),
    requires_reply: Optional[bool] = Query(None),
    current_user: UserProfile = Depends(get_current_user)
):
    all_user_emails = db.get_emails(folder="all", user_email=current_user.email)
    if not all_user_emails:
        await gmail_service.sync_inbox(user_email=current_user.email, user_name=current_user.name)

    emails = db.get_emails(
        folder=folder,
        category=category,
        priority=priority,
        search=search,
        unread_only=unread_only,
        starred_only=starred_only,
        has_attachments=has_attachments,
          tone=tone,
          from_date=_parse_date(from_date),
          to_date=_parse_date(to_date),
          requires_reply=requires_reply,
        user_email=current_user.email
    )
    return emails


@router.get("/{email_id}", response_model=EmailItem)
def get_email(email_id: str, current_user: UserProfile = Depends(get_current_user)):
    """Fetch details of a specific email."""
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    # Mark as read on open
    if not email.is_read:
        db.update_email(email_id, current_user.email, {"is_read": True})
        email.is_read = True
    return email

from app.services.imap_service import imap_service

@router.post("/sync")
async def sync_emails(current_user: UserProfile = Depends(get_current_user)):
    """Trigger email sync pipeline and AI categorization."""
    creds = db.get_user_credentials(current_user.email)
    if creds and creds.get("type") == "imap" and creds.get("imap_pass"):
        return await imap_service.fetch_real_emails_via_imap(
            user_email=current_user.email,
            app_password=creds["imap_pass"]
        )
    gmail_creds = db.get_user_credentials(current_user.email)
    if not gmail_creds:
        # No stored credentials is not a successful sync of an empty mailbox.
        # Say so, rather than reporting success for nothing.
        return {
            "status": "disconnected",
            "message": "No mailbox is connected. Sign in with Google or add an IMAP password.",
            "emails_synced": 0,
        }
    return await gmail_service.sync_inbox(
        user_email=current_user.email, user_name=current_user.name
    )

@router.post("/sync-imap")
async def sync_imap_emails(app_password: str, current_user: UserProfile = Depends(get_current_user)):
    """Directly fetch real emails from Gmail IMAP using App Password."""
    return await imap_service.fetch_real_emails_via_imap(
        user_email=current_user.email,
        app_password=app_password
    )

@router.post("/{email_id}/toggle-read", response_model=EmailItem)
def toggle_read(email_id: str, current_user: UserProfile = Depends(get_current_user)):
    """Toggle read/unread status."""
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    updated = db.update_email(email_id, current_user.email, {"is_read": not email.is_read})
    return updated

@router.post("/{email_id}/toggle-star", response_model=EmailItem)
def toggle_star(email_id: str, current_user: UserProfile = Depends(get_current_user)):
    """Toggle starred status."""
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    updated = db.update_email(email_id, current_user.email, {"is_starred": not email.is_starred})
    return updated

@router.delete("/{email_id}")
def delete_email(email_id: str, current_user: UserProfile = Depends(get_current_user)):
    """Move email to trash or permanently remove if already in trash."""
    success = db.delete_email(email_id, current_user.email)
    if not success:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"status": "success", "message": "Email deleted successfully"}

@router.post("/{email_id}/action-items/{task_idx}/toggle", response_model=EmailItem)
def toggle_action_item(email_id: str, task_idx: int, current_user: UserProfile = Depends(get_current_user)):
    """Mark an action item task as completed or pending."""
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if 0 <= task_idx < len(email.action_items):
        email.action_items[task_idx].completed = not email.action_items[task_idx].completed
        db.update_email(email_id, current_user.email, {"action_items": [i.model_dump() for i in email.action_items]})
    return email

@router.post("/generate-reply", response_model=GenerateReplyResponse)
async def generate_reply(req: GenerateReplyRequest, current_user: UserProfile = Depends(get_current_user)):
    """Generate smart AI email reply with selected tone."""
    subject = req.email_subject or ""
    body = req.email_body or ""
    sender_name = "Sender"
    
    if req.email_id:
        email = db.get_email_by_id(req.email_id, current_user.email)
        if email:
            subject = subject or email.subject
            body = body or email.body
            sender_name = email.sender_name

    res = await gemini_service.generate_smart_reply(
        subject=subject,
        body=body,
        sender_name=sender_name,
        tone=req.tone,
        custom_instructions=req.custom_instructions,
        user_name=current_user.name
    )
    return GenerateReplyResponse(**res)

@router.post("/summarize")
async def summarize_email_text(subject: str, body: str, sender: str = "Unknown", current_user: UserProfile = Depends(get_current_user)):
    """Summarize any email text payload using AI."""
    return await gemini_service.analyze_and_summarize_email(subject, body, sender)

@router.post("/compose", response_model=EmailItem)
async def compose_email(req: ComposeEmailRequest, current_user: UserProfile = Depends(get_current_user)):
    """Send / save composed outgoing email."""
    # Validate before spending an AI call on a message that cannot be sent.
    recipient = (req.recipient or "").strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", recipient):
        raise HTTPException(status_code=400, detail="A valid recipient is required.")
    if not (req.subject or "").strip() or not (req.body or "").strip():
        raise HTTPException(status_code=400, detail="Subject and body are required.")
    if req.in_reply_to:
        parent = db.get_email_by_id(req.in_reply_to, current_user.email)
        if not parent:
            raise HTTPException(status_code=404, detail="Original message not found")

    subject = (req.subject or "").strip()
    body = (req.body or "").strip()

    now = time.time()
    new_id = f"em-sent-{random.randint(1000, 9999)}"
    
    # Analyze outgoing email with AI
    analysis = await gemini_service.analyze_and_summarize_email(req.subject, req.body, current_user.name)
    
    email = EmailItem(
user_email=current_user.email,
             id=new_id,
        sender_name=f"{current_user.name} (You)",
        sender_email=current_user.email,
        recipient_email=recipient,
        subject=req.subject,
        snippet=req.body[:120] + "...",
        body=req.body,
        category=req.category or analysis.get("category", "Work"),
        priority=req.priority or analysis.get("priority", "Medium"),
        date="Just now",
        timestamp=now,
        is_read=True,
        is_starred=False,
        has_attachments=bool(req.attachments),
        attachments=[],
        summary=EmailSummary(
            bullet_points=analysis.get("bullet_points", [req.subject]),
            one_liner=analysis.get("one_liner", req.subject),
            urgency_reason=analysis.get("urgency_reason"),
            sentiment=analysis.get("sentiment", "Neutral"),
            key_deadlines=analysis.get("deadlines", [])
        ),
        action_items=[],
        folder="drafts"
    )
    db.add_email(email)

    # Only claim "sent" if the message actually left. An undeliverable reply
    # is filed as a draft and the reason is returned, so the UI can say so
    # rather than reporting a phantom success.
    delivery = await gmail_service.send_message(
        user_email=current_user.email,
        to=recipient,
        subject=subject,
        body=body,
        in_reply_to=req.in_reply_to,
    )
    if delivery.get("delivered"):
        email = db.update_email(
            email.id, current_user.email, {"folder": "sent"}
        ) or email
    else:
        email.snippet = f"[Not delivered: {delivery.get('reason')}] {email.snippet}"
        email = db.update_email(
            email.id, current_user.email, {"snippet": email.snippet}
        ) or email
    
    # If sent to self or current user, also add an inbox copy for instant local receipt testing
    recip = (req.recipient or "").strip().lower()
    user_email_clean = (current_user.email or "").strip().lower()
    if recip == user_email_clean or "self" in recip or "me@" in recip or user_email_clean in recip:
        import copy
        inbox_copy = copy.deepcopy(email)
        inbox_copy.id = f"em-inbox-{random.randint(1000, 9999)}"
        inbox_copy.folder = "inbox"
        inbox_copy.is_read = False
        db.add_email(inbox_copy)

    return email

# ----------------------------------------------------------- phishing check
@router.get("/{email_id}/phishing-check")
async def phishing_check(
    email_id: str,
    language: str = "en",
    current_user: UserProfile = Depends(get_current_user),
):
    """Assess one message for phishing.

    The UI calls this for every message it opens, so a failure here is
    reported rather than raised: a phishing verdict is an enhancement, and it
    must not be able to break the reading pane.
    """
    email = db.get_email_by_id(email_id, current_user.email)
    if not email or email.user_email != current_user.email:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        from app.services.gemini import analyze_phishing_ai
        return await analyze_phishing_ai(
            subject=email.subject, body=email.body,
            sender=email.sender_email, language=language,
        )
    except Exception as exc:
        logger.warning("Phishing check failed for %s: %s", email_id, exc)
        return {"status": "Unknown", "reason": "Could not assess this message."}


# --------------------------------------------------------- smart reply draft
@router.get("/{email_id}/suggest-reply")
async def suggest_reply(
    email_id: str,
    tone: Optional[str] = None,
    language: str = "en",
    personalize: bool = False,
    current_user: UserProfile = Depends(get_current_user),
):
    """Draft a reply for an existing thread.

    ``tone`` is optional: when it is not supplied the draft mirrors the
    register of the incoming message rather than defaulting to Professional.
    """
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Not found")

    chosen = tone or (email.summary.tone if email.summary and email.summary.tone else "Professional")
    text = await generate_reply_for(
        user_email=current_user.email,
        subject=email.subject,
        body=email.body,
        sender_name=email.sender_name,
        tone=chosen,
        personalize=personalize,
        language=language,
    )
    personalised = False
    notes: List[str] = []
    if personalize:
        learner = StyleLearner(db, current_user.email)
        profile = learner.build_profile()
        personalised = bool(profile.ready)
        notes = learner.style_notes(profile)
    return {
        "reply_body": text,
        "reply_text": text,
        "subject": _reply_subject(email.subject),
        "tone": chosen,
        "language": language,
        "personalized": personalised,
        "style_notes": notes,
    }


@router.post("/{email_id}/restore", response_model=EmailItem)
async def restore_email(email_id: str, current_user: UserProfile = Depends(get_current_user)):
    """Return a trashed or spam message to the inbox."""
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Not found")
    restored = db.update_email(
        email_id, current_user.email,
        {"folder": "inbox", "is_trash": False, "is_spam": False},
    )
    if not restored:
        raise HTTPException(status_code=404, detail="Not found")
    return restored


@router.post("/{email_id}/move", response_model=EmailItem)
async def move_email(
    email_id: str,
    folder: str = Query("inbox"),
    current_user: UserProfile = Depends(get_current_user),
):
    """Move a message between folders. Virtual folders are not destinations."""
    target = (folder or "").strip().lower()
    if target not in {"inbox", "sent", "drafts", "spam", "trash", "archive"}:
        raise HTTPException(status_code=400, detail="Not a real folder")
    email = db.get_email_by_id(email_id, current_user.email)
    if not email:
        raise HTTPException(status_code=404, detail="Not found")
    moved = db.update_email(
        email_id, current_user.email,
        {"folder": target, "is_trash": target == "trash", "is_spam": target == "spam"},
    )
    if not moved:
        raise HTTPException(status_code=404, detail="Not found")
    return moved
