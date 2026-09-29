import time
import copy
from typing import List, Optional, Dict, Any
from app.models.schemas import EmailItem, CategoryEnum, PriorityEnum, EmailSummary, ActionItem, AttachmentInfo
from app.config import settings

try:
    from supabase import create_client, Client
except ImportError:
    create_client, Client = None, None

# In-memory realistic dataset with robust CRUD operations and Supabase Cloud Sync
class Database:
    def __init__(self):
        self.emails: Dict[str, EmailItem] = {}
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

    def clear_fake_emails_for_user(self, email: str):
        clean_email = (email or "").strip().lower()
        to_delete = [
            eid for eid, em in self.emails.items()
            if (em.recipient_email.lower() == clean_email or em.sender_email.lower() == clean_email)
            and eid.startswith("em-usr-")
        ]
        for eid in to_delete:
            del self.emails[eid]

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
        user_email: Optional[str] = None
    ) -> List[EmailItem]:
        clean_user = (user_email or "").strip().lower()

        results = []
        for email in self.emails.values():
            if clean_user:
                recip = (getattr(email, 'recipient_email', '') or '').lower()
                sendr = (getattr(email, 'sender_email', '') or '').lower()
                if recip != clean_user and sendr != clean_user:
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

        results.sort(key=lambda x: x.timestamp, reverse=True)
        return results

    def get_email_by_id(self, email_id: str) -> Optional[EmailItem]:
        email = self.emails.get(email_id)
        if email:
            return copy.deepcopy(email)
        return None

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

    def update_email(self, email_id: str, updates: Dict[str, Any]) -> Optional[EmailItem]:
        if email_id not in self.emails:
            return None
        email_dict = self.emails[email_id].model_dump()
        email_dict.update(updates)
        updated_email = EmailItem(**email_dict)
        self.emails[email_id] = updated_email
        self._sync_email_to_supabase(updated_email)
        return copy.deepcopy(updated_email)

    def delete_email(self, email_id: str) -> bool:
        if email_id in self.emails:
            if self.emails[email_id].folder == "trash":
                del self.emails[email_id]
            else:
                self.emails[email_id].folder = "trash"
                self.emails[email_id].is_trash = True
            return True
        return False

    def get_analytics(self) -> Dict[str, Any]:
        all_emails = list(self.emails.values())
        total = len(all_emails)
        unread = sum(1 for e in all_emails if not e.is_read and e.folder == "inbox")
        spam_count = sum(1 for e in all_emails if e.is_spam or e.category == CategoryEnum.SPAM)
        urgent = sum(1 for e in all_emails if e.priority == PriorityEnum.HIGH and e.folder == "inbox")
        
        # Calculate estimated time saved (5 mins per summarized email)
        time_saved = round(total * 5.2 / 60, 1)

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

        # Daily sync volume simulation
        daily_volume = [
            {"day": "Mon", "received": 24, "summarized": 24, "urgent": 5},
            {"day": "Tue", "received": 38, "summarized": 38, "urgent": 8},
            {"day": "Wed", "received": 42, "summarized": 42, "urgent": 11},
            {"day": "Thu", "received": 35, "summarized": 35, "urgent": 6},
            {"day": "Fri", "received": 48, "summarized": 48, "urgent": 14},
            {"day": "Sat", "received": 12, "summarized": 12, "urgent": 1},
            {"day": "Sun", "received": 8, "summarized": 8, "urgent": 0}
        ]

        top_senders = [
            {"name": "Sarah Jenkins (VP Eng)", "email": "sarah.jenkins@techcorp.io", "count": 14, "urgent_ratio": "85%"},
            {"name": "David Miller (Product)", "email": "david.miller@techcorp.io", "count": 9, "urgent_ratio": "40%"},
            {"name": "Emily Zhao (Legal)", "email": "emily.zhao@lexislegal.com", "count": 6, "urgent_ratio": "66%"},
            {"name": "Stripe Billing", "email": "invoices@stripe.com", "count": 4, "urgent_ratio": "0%"},
            {"name": "GitHub Notifications", "email": "notifications@github.com", "count": 18, "urgent_ratio": "5%"}
        ]

        return {
            "total_emails": total,
            "unread_count": unread,
            "spam_blocked": spam_count,
            "urgent_count": urgent,
            "time_saved_hours": time_saved,
            "avg_response_time_minutes": 14,
            "category_distribution": category_counts,
            "priority_distribution": priority_counts,
            "daily_volume": daily_volume,
            "top_senders": top_senders
        }

# Global singleton database instance
db = Database()
