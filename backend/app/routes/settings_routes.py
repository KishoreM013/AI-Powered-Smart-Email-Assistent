from fastapi import APIRouter, Depends
from typing import Dict, Any
from app.models.schemas import SettingsUpdateRequest
from app.database.db import db
from app.services.gemini_service import gemini_service
from app.auth.auth_handler import get_current_user, UserProfile

router = APIRouter(prefix="/api/settings", tags=["Settings"])

@router.get("")
def get_settings(current_user: UserProfile = Depends(get_current_user)):
    """Get current application preferences and API keys status."""
    return db.settings

@router.post("")
def update_settings(req: SettingsUpdateRequest, current_user: UserProfile = Depends(get_current_user)):
    """Update application settings."""
    if req.gemini_api_key is not None:
        db.settings["gemini_api_key"] = req.gemini_api_key
        gemini_service.update_api_key(req.gemini_api_key)
    if req.demo_mode is not None:
        db.settings["demo_mode"] = req.demo_mode
    if req.auto_reply_enabled is not None:
        db.settings["auto_reply_enabled"] = req.auto_reply_enabled
    if req.default_reply_tone is not None:
        db.settings["default_reply_tone"] = req.default_reply_tone

    return {"status": "success", "settings": db.settings}
