import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm="HS256")
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        decoded = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return decoded
    except jwt.PyJWTError:
        return None

async def get_current_user_token(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    if not token:
        # If in demo mode and no token, return a mock user identity
        if settings.is_demo:
            return {"email": "demo.user@gmail.com", "name": "Demo Admin", "is_demo": True}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(token)
    if payload is None:
        if settings.is_demo:
            return {"email": "demo.user@gmail.com", "name": "Demo Admin", "is_demo": True}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload
