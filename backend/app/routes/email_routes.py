import logging
import re
import time
import random
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.models.schemas import (
    EmailItem, GenerateReplyRequest, GenerateReplyResponse,
    ComposeEmailRequest, EmailSummary, ActionItem
)
from app.database.db import db
from app.services.gemini_service import gemini_service
from app.services.gmail_service import gmail_service
from app.auth.auth_handler import get_current_user, UserProfile

logger = logging.getLogger("smart_email_assistant")

router = APIRouter(prefix="/api/emails", tags=["Emails"])

# ================================================================ analyse any
# Registered above the /{email_id} routes: static paths must be matched before
# the parameterised ones or FastAPI will treat "analyze" as an email id.
@router.post("/analyze", response_model=EmailItem)
async def analyze_pasted_email(
    payload: dict,
    current_user: UserProfile = Depends(get_current_user),
):
    """Analyse an email the user pasted, then optionally store it.

    The message does not have to come from a connected mailbox, which is the
    point: forwarded threads and text copied out of a screenshot both work.
    """
    body = str(payload.get("body") or "").strip()
    subject = str(payload.get("subject") or "").strip()
    if not body and not subject:
        raise HTTPException(status_code=400, detail="Provide the email body or subject.")

    sender_email = str(payload.get("sender_email") or "").strip()
    sender_name = str(payload.get("sender_name") or "").strip() or (
        sender_email.split("@")[0] if sender_email else "Unknown sender"
    )

    from app.services.gemini import analyze_email_ai
    analysis = await analyze_email_ai(subject=subject, body=body, sender=sender_name)

    item = EmailItem(
        id=f"em-pasted-{int(time.time() * 1000)}",
        user_email=current_user.email,
        sender_name=sender_name,
        sender_email=sender_email,
        recipient_email=current_user.email,
        subject=subject or "(no subject)",
        snippet=body[:160],
        body=body,
        category=analysis.get("category", "Work"),
        priority=analysis.get("priority", "Medium"),
        date=time.strftime("%d %b, %H:%M"),
        timestamp=time.time(),
        is_read=False,
        is_starred=analysis.get("priority") == "High",
        summary=EmailSummary(
            one_liner=analysis.get("one_liner", subject),
            bullet_points=analysis.get("bullet_points", []),
            sentiment=analysis.get("sentiment", "Neutral"),
            key_deadlines=analysis.get("deadlines", []),
        ),
        action_items=[
            ActionItem(task=a.get("task", ""), due_date=a.get("due_date"))
            for a in analysis.get("action_items", []) if a.get("task")
        ],
        folder="inbox",
    )
    if payload.get("save", True):
        db.add_email(item)
    return item


# =================================================================== history
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
    if not db.delete_email(email_id, current_user.email):
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "success"}


# =============================================================== style profile
@router.get("/style-profile")
def get_style_profile(current_user: UserProfile = Depends(get_current_user)):
    """What the app has learned about how this account writes.

    Returns an honest empty profile when there is nothing to learn from yet,
    rather than inventing a style.
    """
    try:
        from app.services.style_learner import StyleLearner
        from app.database.storage import get_storage
        return StyleLearner(get_storage(), current_user.email).build_profile().model_dump()
    except Exception as exc:
        logger.info("Style profile unavailable: %s", exc)
        return {"reply_count": 0, "ready": False, "common_phrases": [],
                "average_words": 0.0, "formality": 0.0, "language": "en",
                "uses_emoji": False, "uses_bullets": False,
                "average_sentence_length": 0.0, "greeting": None, "sign_off": None}

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
    tone: str = "Professional",
    language: str = "en",
    current_user: UserProfile = Depends(get_current_user),
):
    """Draft a reply for an existing thread.

    ``tone`` is optional; the client sends the detected tone of the incoming
    message so a reply matches the register it received.
    """
    email = db.get_email_by_id(email_id, current_user.email)
    if not email or email.user_email != current_user.email:
        raise HTTPException(status_code=404, detail="Not found")
    from app.services.gemini import generate_smart_reply_ai
    body = await generate_smart_reply_ai(
        subject=email.subject, body=email.body, sender=email.sender_name,
        tone=tone or "Professional", language=language,
    )
    return {"reply_body": body, "reply_text": body, "tone": tone, "language": language}


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
