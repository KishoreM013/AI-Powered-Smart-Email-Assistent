import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from google_auth_oauthlib.flow import Flow
from app.config import settings
from app.auth.jwt import create_access_token, get_current_user_token
from app.database.connection import get_database

logger = logging.getLogger("smart_email_assistant")
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Flow scopes for Gmail access
SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
]

class DemoLoginRequest(BaseModel):
    email: str = "demo.user@gmail.com"
    name: str = "Demo Admin"

@router.get("/login-url")
def get_login_url(email: Optional[str] = None):
    """Generates the Google OAuth authorization redirect URL."""
    if settings.is_demo:
        return {"url": f"{settings.FRONTEND_URL}/login?mode=demo"}
        
    try:
        client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
            }
        }
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            autogenerate_code_verifier=False
        )
        kwargs = {
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent"
        }
        if email:
            kwargs["login_hint"] = email
            
        auth_url, state = flow.authorization_url(**kwargs)
        return {"url": auth_url, "state": state, "is_live_configured": True}
    except Exception as e:
        logger.error(f"Error generating OAuth URL: {e}")
        return {"url": f"{settings.FRONTEND_URL}/login?mode=demo", "error": str(e), "is_live_configured": False}

@router.get("/callback")
async def oauth_callback(code: str):
    """Exchanges Google auth authorization code for tokens and creates a session."""
    db = get_database()
    
    if settings.is_demo:
        # Simply return demo user credentials
        token = create_access_token({"email": "demo.user@gmail.com", "name": "Demo Admin"})
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth-success?token={token}")

    try:
        client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
            }
        }
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            autogenerate_code_verifier=False
        )
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Get user info using google identity token or profile endpoint
        # For simplicity, we decode or read using standard request
        import httpx
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        headers = {"Authorization": f"Bearer {credentials.token}"}
        async with httpx.AsyncClient() as client:
            response = await client.get(userinfo_url, headers=headers)
            user_info = response.json()
            
        email = user_info.get("email")
        name = user_info.get("name", email.split('@')[0])
        picture = user_info.get("picture")
        
        # Structure credentials dict for Gmail API usage
        creds_dict = {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes
        }
        
        # Save or update User in MongoDB
        await db["users"].update_one(
            {"email": email},
            {
                "$set": {
                    "name": name,
                    "picture": picture,
                    "google_id": user_info.get("sub"),
                    "last_login": datetime.now(timezone.utc),
                    "gmail_credentials": creds_dict
                },
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc),
                    "settings": {
                        "theme": "light",
                        "language": "en",
                        "notifications_enabled": True,
                        "critical_contacts": ["boss@company.com"]
                    }
                }
            },
            upsert=True
        )
        
        # Increment total users in admin analytics
        await db["analytics"].update_one(
            {"_id": "api_usage"},
            {"$inc": {"total_users": 1}},
            upsert=True
        )

        # Generate JWT session token
        jwt_token = create_access_token({"email": email, "name": name})
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth-success?token={jwt_token}")
        
    except Exception as e:
        logger.error(f"OAuth Callback validation failed: {e}")
        # Redirect to login page with error flag
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=auth_failed")

@router.post("/demo")
@router.post("/demo-login")
async def demo_login(req: DemoLoginRequest = DemoLoginRequest()):
    """Instantly authenticate user with mock JWT in Demo Mode."""
    db = get_database()
    
    # Store demo user preferences
    picture = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
    user_settings = {
        "theme": "light",
        "language": "en",
        "notifications_enabled": True,
        "critical_contacts": ["boss@company.com", "manager@company.com", "hr@company.com"]
    }
    
    await db["users"].update_one(
        {"email": req.email},
        {
            "$set": {
                "name": req.name,
                "picture": picture,
                "last_login": datetime.now(timezone.utc)
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc),
                "settings": user_settings
            }
        },
        upsert=True
    )
    
    token = create_access_token({"email": req.email, "name": req.name, "is_demo": True})
    user_obj = {
        "email": req.email,
        "name": req.name,
        "picture": picture,
        "settings": user_settings
    }
    return {"token": token, "access_token": token, "email": req.email, "name": req.name, "user": user_obj}

class GoogleLoginRequest(BaseModel):
    email: str = "user@gmail.com"
    name: Optional[str] = "Gmail User"
    avatar: Optional[str] = None
    is_demo: bool = False

@router.post("/google-login")
async def google_login(req: GoogleLoginRequest):
    """Seamless Google Sign-In backend endpoint."""
    db = get_database()
    name = req.name or req.email.split('@')[0].capitalize()
    picture = req.avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={name}"
    user_settings = {
        "theme": "light",
        "language": "en",
        "notifications_enabled": True,
        "critical_contacts": ["boss@company.com"]
    }
    
    await db["users"].update_one(
        {"email": req.email},
        {
            "$set": {
                "name": name,
                "picture": picture,
                "last_login": datetime.now(timezone.utc)
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc),
                "settings": user_settings
            }
        },
        upsert=True
    )
    
    token = create_access_token({"email": req.email, "name": name})
    user_obj = {
        "email": req.email,
        "name": name,
        "picture": picture,
        "settings": user_settings
    }
    return {"token": token, "access_token": token, "email": req.email, "name": name, "user": user_obj}

@router.get("/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user_token)):
    """Fetch profile info of authenticated user."""
    db = get_database()
    user_record = await db["users"].find_one({"email": current_user["email"]})
    if not user_record:
        # create basic profile if missing
        user_record = {
            "email": current_user["email"],
            "name": current_user.get("name", "User"),
            "picture": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
            "settings": {"theme": "dark", "language": "en", "notifications_enabled": True, "critical_contacts": []}
        }
    
    # Remove credentials from client response
    if "gmail_credentials" in user_record:
        del user_record["gmail_credentials"]
        
    return user_record
