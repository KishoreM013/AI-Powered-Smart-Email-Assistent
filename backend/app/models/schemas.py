from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class PriorityEnum(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class CategoryEnum(str, Enum):
    WORK = "Work"
    PERSONAL = "Personal"
    PROMOTIONS = "Promotions"
    FINANCE = "Finance"
    UPDATES = "Updates"
    NEWSLETTER = "Newsletter"
    # Added so scheduling mail is distinguishable from general work mail, and
    # so a thread can be flagged important in its own right.
    IMPORTANT = "Important"
    MEETING = "Meeting"
    INVITATION = "Invitation"
    SPAM = "Spam"
    OTHER = "Other"


class ToneEnum(str, Enum):
    """Register of the sender, distinct from sentiment (polarity)."""
    PROFESSIONAL = "Professional"
    FORMAL = "Formal"
    FRIENDLY = "Friendly"
    ANGRY = "Angry"
    URGENT = "Urgent"
    NEUTRAL = "Neutral"

class AttachmentInfo(BaseModel):
    id: str
    filename: str
    size: str
    content_type: str
    url: Optional[str] = None
    extracted_text: Optional[str] = None

class ActionItem(BaseModel):
    task: str
    due_date: Optional[str] = None
    completed: bool = False
    is_meeting: bool = False
    meeting_time: Optional[str] = None

class Person(BaseModel):
    """A named person mentioned in the message."""
    name: str
    role: Optional[str] = None
    email: Optional[str] = None


class MeetingDetails(BaseModel):
    """Structured schedule information pulled out of the body."""
    is_meeting: bool = False
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    platform: Optional[str] = None
    attendees: List[str] = Field(default_factory=list)


class EmailSummary(BaseModel):
    bullet_points: List[str] = Field(default_factory=list)
    one_liner: str = ""
    urgency_reason: Optional[str] = None
    # Emotional register, i.e. polarity.
    sentiment: str = "Neutral"  # Positive, Neutral, Urgent, Frustrated
    # How the sender is speaking. Distinct from sentiment: a stern but polite
    # CEO is tone=Professional, sentiment=Frustrated.
    tone: str = "Neutral"  # Professional, Formal, Friendly, Angry, Urgent, Neutral
    key_deadlines: List[str] = Field(default_factory=list)
    # Any other date mentioned, as opposed to an implied deadline.
    dates: List[str] = Field(default_factory=list)
    # Named people, excluding the account owner.
    people: List[Person] = Field(default_factory=list)
    meeting: Optional[MeetingDetails] = None
    keywords: List[str] = Field(default_factory=list)
    # True when the sender is waiting on an answer.
    requires_reply: bool = False
    # 0.0 to 1.0, how much this matters to the recipient.
    importance_score: float = 0.0

class EmailItem(BaseModel):
    id: str
    # Owning account. Every read and write path is scoped by this field, so it
    # must always be set by the route or the sync layer rather than trusted
    # from a request body. Without it there is nothing to authorise against.
    user_email: str = ""
    sender_name: str
    sender_email: str
    recipient_email: str = "user@example.com"
    subject: str
    snippet: str
    body: str
    category: CategoryEnum = CategoryEnum.WORK
    priority: PriorityEnum = PriorityEnum.MEDIUM
    date: str
    timestamp: float
    is_read: bool = False
    is_starred: bool = False
    is_spam: bool = False
    is_trash: bool = False
    has_attachments: bool = False
    attachments: List[AttachmentInfo] = Field(default_factory=list)
    summary: Optional[EmailSummary] = None
    action_items: List[ActionItem] = Field(default_factory=list)
    reply_draft: Optional[str] = None
    folder: str = "inbox" # inbox, sent, drafts, spam, trash, archive

class GenerateReplyRequest(BaseModel):
    email_id: Optional[str] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    tone: str = "Professional" # Professional, Friendly, Direct, Polite Decline, Urgent Action
    custom_instructions: Optional[str] = None

class GenerateReplyResponse(BaseModel):
    reply_text: str
    tone: str
    suggested_subject: str

class OCRScanRequest(BaseModel):
    email_id: Optional[str] = None
    attachment_id: Optional[str] = None
    raw_text: Optional[str] = None

class OCRScanResponse(BaseModel):
    filename: str
    extracted_text: str
    document_type: str # Invoice, Contract, Receipt, Report, General
    summary: str
    key_entities: Dict[str, Any] = Field(default_factory=dict) # e.g. amount, due_date, vendor, invoice_no

class ComposeEmailRequest(BaseModel):
    recipient: str
    subject: str
    body: str
    # The message this replies to. Used to thread the reply and to set
    # In-Reply-To. Validated against the caller's own mail by the route.
    in_reply_to: Optional[str] = None
    category: Optional[CategoryEnum] = CategoryEnum.WORK
    priority: Optional[PriorityEnum] = PriorityEnum.MEDIUM
    attachments: Optional[List[Dict[str, Any]]] = None

class FilterParams(BaseModel):
    folder: Optional[str] = "inbox"
    category: Optional[str] = None
    priority: Optional[str] = None
    search: Optional[str] = None
    unread_only: Optional[bool] = False
    starred_only: Optional[bool] = False
    has_attachments: Optional[bool] = None

class AnalyticsSummary(BaseModel):
    total_emails: int
    unread_count: int
    spam_blocked: int
    urgent_count: int
    time_saved_hours: float
    avg_response_time_minutes: int
    category_distribution: Dict[str, int]
    priority_distribution: Dict[str, int]
    daily_volume: List[Dict[str, Any]]
    top_senders: List[Dict[str, Any]]

class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    avatar: str
    is_demo: bool = True
    connected_gmail: bool = False

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile

class GoogleLoginRequest(BaseModel):
    code: Optional[str] = None
    id_token: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    avatar: Optional[str] = None
    is_demo: Optional[bool] = False

class AuthConfigResponse(BaseModel):
    google_client_id: Optional[str] = ""
    google_redirect_uri: str = ""
    is_live_configured: bool = False
    demo_mode: bool = True

class IMAPLoginRequest(BaseModel):
    email: str
    app_password: str

class SettingsUpdateRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    demo_mode: Optional[bool] = None
    auto_reply_enabled: Optional[bool] = None
    default_reply_tone: Optional[str] = None


class StyleProfile(BaseModel):
    """What the app has learned about how an account writes.

    Deliberately descriptive rather than a mock: an empty corpus yields
    ready=False, and the caller is expected to say so.
    """
    reply_count: int = 0
    average_words: float = 0.0
    average_sentence_length: float = 0.0
    # 0 casual .. 1 formal
    formality: float = 0.5
    greeting: Optional[str] = None
    sign_off: Optional[str] = None
    uses_emoji: bool = False
    uses_bullets: bool = False
    common_phrases: List[str] = Field(default_factory=list)
    language: str = "en"
    # True once there is enough sent mail to be worth imitating.
    ready: bool = False


class AnalyzeRequest(BaseModel):
    """An arbitrary email supplied by the user, not necessarily from a mailbox."""
    subject: str = ""
    body: str
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    save: bool = True
    generate_reply: bool = False
    tone: Optional[str] = None
    personalize: bool = False
