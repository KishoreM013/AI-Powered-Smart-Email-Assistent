from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

class AttachmentInfo(BaseModel):
    filename: str
    content_type: str
    size: int
    id: str
    text_content: Optional[str] = None # OCR extracted text
    summary: Optional[str] = None # AI attachment summary

class AISummary(BaseModel):
    short_summary: str
    key_points: List[str]
    action_required: bool
    deadlines: List[str] = Field(default_factory=list)
    meetings: List[str] = Field(default_factory=list)

class EmailItem(BaseModel):
    id: str = Field(..., alias="_id") # gmail message id
    thread_id: str
    user_email: str
    sender_name: str
    sender_email: str
    subject: str
    date: datetime
    body_snippet: str
    body_full: str
    is_read: bool = False
    
    # Priority
    priority: str = "Low" # "High", "Medium", "Low"
    priority_reason: Optional[str] = None
    
    # Sentiment
    sentiment: str = "Neutral" # "Positive", "Negative", "Neutral", "Urgent", "Happy", "Angry", "Complaint"
    
    # Category
    category: str = "Updates" # "Work", "College", "Personal", "Finance", "Shopping", "Social", "Promotions", "Important", "Spam"
    category_score: float = 1.0
    
    # Attachment details
    attachments: List[AttachmentInfo] = Field(default_factory=list)
    
    # AI Summary
    ai_analysis: Optional[AISummary] = None
    
    # Replies
    replies_count: int = 0
    is_replied: bool = False

class ScheduledReply(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email_id: str
    recipient: str
    subject: str
    reply_body: str
    tone: str # "Professional", "Friendly", "Formal", "Short", "Detailed"
    send_at: datetime
    status: str = "Pending" # "Pending", "Sent", "Failed"
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
