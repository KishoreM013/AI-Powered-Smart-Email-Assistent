import copy
import logging
import time
import uuid
from datetime import datetime, timezone
from collections import Counter
from typing import List, Optional, Dict, Any
logger = logging.getLogger("smart_email_assistant")

from app.models.schemas import EmailItem, CategoryEnum, PriorityEnum
from app.config import settings

try:
    from supabase import create_client, Client
except ImportError:
    create_client, Client = None, None

# In-memory realistic dataset with robust CRUD operations and Supabase Cloud Sync
def _norm(email: Optional[str]) -> str:
    return (email or "").strip().lower()


class Database:
    def __init__(self):
        self.emails: Dict[str, EmailItem] = {}
        # Sent replies, the corpus for personalised drafting.
        self.sent_replies: Dict[str, List[Dict[str, Any]]] = {}
        self.user_credentials: Dict[str, Dict[str, Any]] = {}
        self.settings: Dict[str, Any] = {
            "demo_mode": False,
            "gemini_api_key": "",
            "auto_reply_enabled": True,
            "default_reply_tone": "Professional",
            "connected_gmail": False,
            "sync_interval_mins": 15
        }
        self.supabase: Optional[Any] = None
        self._init_supabase()
        self.seed_initial_data()

    def set_user_credentials(self, email: str, creds: Dict[str, Any]):
        clean_email = (email or "").strip().lower()
        if clean_email and creds:
            self.user_credentials[clean_email] = creds

    def get_user_credentials(self, email: str) -> Optional[Dict[str, Any]]:
        clean_email = (email or "").strip().lower()
        return self.user_credentials.get(clean_email)

    def clear_fake_emails_for_user(self, email: str) -> int:
        """Drop the synthetic demo set once real mail arrives, and report how many.

        Scoped by owner, not by sender/recipient, so it cannot remove somebody
        else's real message.
        """
        clean_email = _norm(email)
        if not clean_email:
            return 0
        to_delete = [
            eid for eid, em in self.emails.items()
            if _norm(em.user_email) == clean_email and eid.startswith("em-usr-")
        ]
        for eid in to_delete:
            del self.emails[eid]
        return len(to_delete)

    def _init_supabase(self):
        """Initialize Supabase Cloud Client if credentials are provided."""
        base_url = settings.supabase_base_url
        key = settings.SUPABASE_KEY
        if base_url and key and create_client:
            try:
                self.supabase = create_client(base_url, key)
                print(f"[Supabase] Connected to Supabase Cloud Database at {base_url}")
            except Exception as e:
                print(f"[Supabase] Notice: Cloud client init: {e}")

    def seed_initial_data(self):
        """No hardcoded mock emails for production real-time usage."""
        pass

    def get_emails(
        self,
        folder: str = "inbox",
        category: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        unread_only: bool = False,
        starred_only: bool = False,
        has_attachments: Optional[bool] = None,
        user_email: Optional[str] = None,
        tone: Optional[str] = None,
        from_date: Optional[float] = None,
        to_date: Optional[float] = None,
        requires_reply: Optional[bool] = None
    ) -> List[EmailItem]:
        clean_user = _norm(user_email)
        if not clean_user:
            # No owner means no authorised caller. Return nothing rather
            # than the whole mailbox.
            return []

        results = []
        for email in self.emails.values():
            # Scope on the owner field. Matching on sender/recipient was
            # wrong: it hid messages synced from a shared mailbox or an
            # alias, and ownership is not the same thing.
            if _norm(getattr(email, "user_email", "")) != clean_user:
                continue

            if folder and folder.lower() != "all":
                f_lower = folder.lower()
                if f_lower == "important":
                    p_val = email.priority.value if hasattr(email.priority, 'value') else str(email.priority)
                    c_val = email.category.value if hasattr(email.category, 'value') else str(email.category)
                    if not (p_val.lower() == "high" or c_val.lower() == "important" or email.is_starred):
                        continue
                elif f_lower == "starred":
                    if not email.is_starred:
                        continue
                elif f_lower == "unread":
                    if email.is_read:
                        continue
                elif email.folder.lower() != f_lower:
                    continue
            if category and email.category.value.lower() != category.lower():
                continue
            if priority and email.priority.value.lower() != priority.lower():
                continue
            if unread_only and email.is_read:
                continue
            if starred_only and not email.is_starred:
                continue
            if has_attachments is not None and email.has_attachments != has_attachments:
                continue
            if search:
                q = search.lower().strip()
                search_hit = (
                    q in email.subject.lower() or
                    q in email.body.lower() or
                    q in email.sender_name.lower() or
                    q in email.sender_email.lower() or
                    (email.summary and q in email.summary.one_liner.lower()) or
                    any(q in item.task.lower() for item in email.action_items)
                )
                if not search_hit:
                    continue
            results.append(copy.deepcopy(email))

        if tone:
            wanted = tone.strip().title()
            results = [e for e in results
                       if (e.summary.tone if e.summary else "Neutral") == wanted]
        if requires_reply is not None:
            results = [e for e in results
                       if bool(e.summary and e.summary.requires_reply) == requires_reply]

        # Date range is applied here rather than in SQL because the store is an
        # in-memory dict; a timestamp of 0 means "no date", so it is excluded
        # from a bounded range instead of appearing in every one.
        def _in_range(item) -> bool:
            ts = float(item.timestamp or 0)
            if from_date is not None and (ts == 0 or ts < from_date):
                return False
            if to_date is not None and (ts == 0 or ts > to_date):
                return False
            return True

        if from_date is not None or to_date is not None:
            results = [e for e in results if _in_range(e)]

        results.sort(key=lambda x: x.timestamp, reverse=True)
        return results

    def _owned(self, email_id: str, user_email: str) -> Optional[EmailItem]:
        """Fetch a message only if it belongs to ``user_email``.

        Every read path goes through here. Callers pass the authenticated
        account, so one user can never reach another's mail by guessing an id.
        A mismatch returns None, which the routes surface as 404 rather than
        403 -- the caller should not learn that the id exists at all.
        """
        email = self.emails.get(email_id)
        if not email:
            return None
        if _norm(email.user_email) != _norm(user_email):
            logger.warning(
                "Refused cross-account access to %s by %s", email_id, user_email
            )
            return None
        return copy.deepcopy(email)

    def get_email_by_id(self, email_id: str, user_email: str = "") -> Optional[EmailItem]:
        return self._owned(email_id, user_email)

    def _sync_email_to_supabase(self, email: EmailItem):
        if self.supabase:
            try:
                payload = {
                    "id": email.id,
                    "sender_name": email.sender_name,
                    "sender_email": email.sender_email,
                    "recipient_email": email.recipient_email,
                    "subject": email.subject,
                    "body": email.body,
                    "category": email.category.value if hasattr(email.category, 'value') else str(email.category),
                    "priority": email.priority.value if hasattr(email.priority, 'value') else str(email.priority),
                    "is_read": email.is_read,
                    "is_starred": email.is_starred,
                    "folder": email.folder
                }
                self.supabase.table("emails").upsert(payload).execute()
            except Exception:
                pass

    def add_email(self, email: EmailItem) -> EmailItem:
        self.emails[email.id] = copy.deepcopy(email)
        self._sync_email_to_supabase(email)
        return email

    def update_email(
        self, email_id: str, user_email: str, updates: Dict[str, Any]
    ) -> Optional[EmailItem]:
        if not self._owned(email_id, user_email):
            return None
        email_dict = self.emails[email_id].model_dump()
        # Ownership is not reassignable: otherwise an update could hand a
        # message to another account, or take one away from its owner.
        updates = {k: v for k, v in updates.items() if k != "user_email"}
        email_dict.update(updates)
        updated_email = EmailItem(**email_dict)
        self.emails[email_id] = updated_email
        self._sync_email_to_supabase(updated_email)
        return copy.deepcopy(updated_email)

    def purge_email(self, email_id: str, user_email: str) -> bool:
        """Remove a message permanently, bypassing the trash.

        Distinct from delete_email, which is the reversible transition to
        trash. Removing something from history has to actually remove it,
        otherwise it reappears in the history listing.
        """
        if not self._owned(email_id, user_email):
            return False
        return self.emails.pop(email_id, None) is not None

    def delete_email(self, email_id: str, user_email: str = "") -> bool:
        if not self._owned(email_id, user_email):
            return False
        if email_id in self.emails:
            if self.emails[email_id].folder == "trash":
                del self.emails[email_id]
            else:
                self.emails[email_id].folder = "trash"
                self.emails[email_id].is_trash = True
            return True
        return False

    # --------------------------------- outgoing mail, the style corpus
    def add_sent_reply(self, user_email: str, recipient: str, subject: str,
                       body: str, sent: bool = True) -> Optional[Dict[str, Any]]:
        """Record a reply the user actually sent.

        This is the only input to style learning. It is deliberately fed by
        messages that were delivered, not drafts: a draft the user never sent
        is not evidence of how they write.
        """
        owner = _norm(user_email)
        text = (body or "").strip()
        if not owner or not text:
            return None
        record = {
            "id": f"rep-{uuid.uuid4().hex[:12]}",
            "user_email": owner,
            "to": (recipient or "").strip(),
            "subject": (subject or "").strip(),
            "body": text,
            "sent": bool(sent),
            "created_at": time.time(),
        }
        self.sent_replies.setdefault(owner, []).insert(0, record)
        # Keep the corpus bounded; older samples add little.
        del self.sent_replies[owner][200:]
        return record

    def list_sent_replies(self, user_email: str, limit: int = 100) -> List[Dict[str, Any]]:
        return list(self.sent_replies.get(_norm(user_email), [])[:limit])

    def sent_reply_count(self, user_email: str) -> int:
        return len(self.sent_replies.get(_norm(user_email), []))

    def add_emails(self, emails: List[EmailItem]) -> int:
        """Store several messages, skipping any without an owner.

        An unowned message has no authorisation context, so storing it would
        create something nobody can ever read.
        """
        stored = 0
        for email in emails:
            if not _norm(getattr(email, "user_email", "")):
                logger.warning("Refusing to store %s: no owner", email.id)
                continue
            self.add_email(email)
            stored += 1
        return stored

    def replace_user_emails(self, user_email: str, emails: List[EmailItem]) -> int:
        """Make a fresh sync authoritative for server folders.

        Locally composed mail is kept: sent messages, drafts and anything the
        user trashed were produced here, not fetched, and a sync must not
        delete them.
        """
        target = _norm(user_email)
        keep = {"sent", "drafts", "trash"}
        for key, existing in list(self.emails.items()):
            if _norm(existing.user_email) != target:
                continue
            if (existing.folder or "").lower() in keep:
                continue
            del self.emails[key]
        return self.add_emails([e for e in emails if _norm(e.user_email) == target])

    def clear_user(self, user_email: str) -> int:
        """Remove every message belonging to one account.

        Used by "forget me" on sign-out and by the test suite for isolation.
        Scoped deliberately: it must never be callable without an owner.
        """
        target = _norm(user_email)
        if not target:
            return 0
        self.sent_replies.pop(target, None)
        # Credentials too. This is the "forget me" primitive, and an OAuth
        # refresh token left behind outlives the session that created it.
        self.user_credentials.pop(target, None)
        doomed = [
            k for k, e in self.emails.items() if _norm(e.user_email) == target
        ]
        for k in doomed:
            del self.emails[k]
        return len(doomed)

    def get_analytics(self, user_email: str = "") -> Dict[str, Any]:
        # Scoped: the dashboard must never count or summarise another
        # account's mail. An empty mailbox returns zeroes, not invented figures.
        if not _norm(user_email):
            return _empty_analytics()
        all_emails = [
            e for e in self.emails.values()
            if _norm(e.user_email) == _norm(user_email)
        ]
        total = len(all_emails)
        unread = sum(1 for e in all_emails if not e.is_read and e.folder == "inbox")
        spam_count = sum(1 for e in all_emails if e.is_spam or e.category == CategoryEnum.SPAM)
        urgent = sum(1 for e in all_emails if e.priority == PriorityEnum.HIGH and e.folder == "inbox")
        
        # Only messages that were actually summarised count. The per-message
        # figure is an explicit estimate rather than a measurement.
        summarised = sum(
            1 for e in all_emails
            if e.summary and (e.summary.one_liner or e.summary.bullet_points)
        )
        time_saved = round(summarised * 2 / 60, 1)

        category_counts: Dict[str, int] = {}
        for c in CategoryEnum:
            count = sum(1 for e in all_emails if e.category == c)
            if count > 0:
                category_counts[c.value] = count

        priority_counts: Dict[str, int] = {
            "High": sum(1 for e in all_emails if e.priority == PriorityEnum.HIGH),
            "Medium": sum(1 for e in all_emails if e.priority == PriorityEnum.MEDIUM),
            "Low": sum(1 for e in all_emails if e.priority == PriorityEnum.LOW)
        }

        # Daily volume, computed from real timestamps.
        buckets: Dict[str, Dict[str, int]] = {}
        for e in all_emails:
            if not e.timestamp:
                continue
            try:
                day = datetime.fromtimestamp(
                    e.timestamp, tz=timezone.utc
                ).strftime("%Y-%m-%d")
            except (OverflowError, OSError, ValueError):
                continue
            b = buckets.setdefault(day, {"received": 0, "summarized": 0, "urgent": 0})
            b["received"] += 1
            if e.summary and (e.summary.one_liner or e.summary.bullet_points):
                b["summarized"] += 1
            if e.priority == PriorityEnum.HIGH:
                b["urgent"] += 1

        daily_volume = [
            {"day": datetime.strptime(d, "%Y-%m-%d").strftime("%d %b"), **buckets[d]}
            for d in sorted(buckets)[-14:]
        ]

        # Top senders, from this account's own mail only.
        sender_counts: Counter = Counter(
            (e.sender_name or e.sender_email) for e in all_emails
        )
        sender_emails = {
            (e.sender_name or e.sender_email): e.sender_email for e in all_emails
        }
        urgent_by_sender = Counter(
            (e.sender_name or e.sender_email)
            for e in all_emails
            if e.priority == PriorityEnum.HIGH
        )
        top_senders = [
            {
                "name": name,
                "email": sender_emails.get(name, ""),
                "count": count,
                "urgent_ratio": f"{round(urgent_by_sender.get(name, 0) / count * 100)}%",
            }
            for name, count in sender_counts.most_common(8)
        ]

        return {
            "total_emails": total,
            "unread_count": unread,
            "spam_blocked": spam_count,
            "urgent_count": urgent,
            "important_count": sum(
                1 for e in all_emails
                if e.priority == PriorityEnum.HIGH or e.is_starred
            ),
            "open_action_items": sum(
                1 for e in all_emails for a in e.action_items if not a.completed
            ),
            "time_saved_hours": time_saved,
            "avg_response_time_minutes": 0,
            "category_distribution": category_counts,
            "priority_distribution": priority_counts,
            "daily_volume": daily_volume,
            "top_senders": top_senders,
        }


def _empty_analytics() -> Dict[str, Any]:
    """Zeroes, not invented figures. An empty mailbox must look empty."""
    return {
        "total_emails": 0, "unread_count": 0, "spam_blocked": 0,
        "urgent_count": 0, "important_count": 0, "open_action_items": 0,
        "time_saved_hours": 0.0, "avg_response_time_minutes": 0,
        "category_distribution": {}, "priority_distribution": {},
        "daily_volume": [], "top_senders": [],
    }


# Global singleton database instance
db = Database()
