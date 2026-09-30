from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class PriorityEnum(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class CategoryEnum(str, Enum):
    WORK = "Work"
    FINANCE = "Finance"
    PERSONAL = "Personal"
    PROMOTIONS = "Promotions"
    UPDATES = "Updates"
    NEWSLETTER = "Newsletter"
    SPAM = "Spam"

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

class EmailSummary(BaseModel):
    bullet_points: List[str] = Field(default_factory=list)
    one_liner: str = ""
    urgency_reason: Optional[str] = None
    sentiment: str = "Neutral" # Positive, Neutral, Urgent, Frustrated
    key_deadlines: List[str] = Field(default_factory=list)

class EmailItem(BaseModel):
    id: str
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
