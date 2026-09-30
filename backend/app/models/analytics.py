from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional, List, Dict

class DailySummary(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_email: str
    date: datetime
    summary_text: str
    key_takeaways: List[str]
    tasks_extracted: List[str]

class APIUsageCounter(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    date: str # "YYYY-MM-DD"
    gemini_calls: int = 0
    gmail_calls: int = 0
    ocr_calls: int = 0

class SpamLog(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_email: str
    email_id: str
    sender_email: str
    subject: str
    spam_score: float
    matched_keywords: List[str]
    action_taken: str # "deleted", "moved_to_spam", "archived"
    logged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
