import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from app.auth.jwt import get_current_user_token
from app.database.connection import get_database

logger = logging.getLogger("smart_email_assistant")
router = APIRouter(prefix="/api/settings", tags=["settings"])

class SettingsUpdateRequest(BaseModel):
    theme: str
    language: str
    notifications_enabled: bool
    critical_contacts: List[str]

class ProfileUpdateRequest(BaseModel):
    name: str
    picture: str

@router.get("")
async def get_user_settings(current_user: dict = Depends(get_current_user_token)):
    db = get_database()
    user_email = current_user["email"]
    
    user = await db["users"].find_one({"email": user_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    return user.get("settings", {
        "theme": "dark",
        "language": "en",
        "notifications_enabled": True,
        "critical_contacts": ["boss@company.com", "manager@company.com", "hr@company.com"]
    })

@router.put("")
async def update_user_settings(req: SettingsUpdateRequest, current_user: dict = Depends(get_current_user_token)):
    db = get_database()
    user_email = current_user["email"]
    
    await db["users"].update_one(
        {"email": user_email},
        {
            "$set": {
                "settings.theme": req.theme,
                "settings.language": req.language,
                "settings.notifications_enabled": req.notifications_enabled,
                "settings.critical_contacts": req.critical_contacts
            }
        }
    )
    return {"status": "success", "message": "Settings updated successfully."}

@router.put("/profile")
async def update_user_profile(req: ProfileUpdateRequest, current_user: dict = Depends(get_current_user_token)):
    db = get_database()
    user_email = current_user["email"]
    
    await db["users"].update_one(
        {"email": user_email},
        {
            "$set": {
                "name": req.name,
                "picture": req.picture
            }
        }
    )
    return {"status": "success", "message": "Profile updated successfully."}
