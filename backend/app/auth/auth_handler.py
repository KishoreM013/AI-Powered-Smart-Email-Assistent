import time
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.models.schemas import UserProfile

security = HTTPBearer(auto_error=False)

DEMO_USER = UserProfile(
    id="usr-user-01",
    email="user@gmail.com",
    name="User Account",
    avatar="https://api.dicebear.com/7.x/bottts/svg?seed=UserAccount",
    is_demo=False,
    connected_gmail=True
)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

def create_token_for_user(user: UserProfile, expires_delta: Optional[timedelta] = None) -> str:
    return create_access_token(
        data={
            "sub": user.id,
            "email": user.email,
            "name": user.name,
            "avatar": user.avatar,
            "is_demo": user.is_demo,
            "connected_gmail": user.connected_gmail
        },
        expires_delta=expires_delta
    )

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> UserProfile:
    """Resolve the caller, or reject the request.

    Fails closed. It used to fall back to DEMO_USER when the token was
    missing or invalid, so an unauthenticated request was served as a shared
    demo account instead of being refused.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return UserProfile(
        id=payload.get("sub", DEMO_USER.id),
        email=payload.get("email", DEMO_USER.email),
        name=payload.get("name", DEMO_USER.name),
        avatar=payload.get("avatar", DEMO_USER.avatar),
        is_demo=payload.get("is_demo", False),
        connected_gmail=payload.get("connected_gmail", True)
    )

async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[UserProfile]:
    if not credentials:
        return None
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        return None
    return UserProfile(
        id=payload.get("sub", "usr-user-01"),
        email=payload.get("email", "user@gmail.com"),
        name=payload.get("name", "User"),
        avatar=payload.get("avatar", "https://api.dicebear.com/7.x/bottts/svg?seed=User"),
        is_demo=payload.get("is_demo", False),
        connected_gmail=payload.get("connected_gmail", True)
    )
