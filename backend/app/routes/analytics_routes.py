from fastapi import APIRouter, Depends
from app.models.schemas import AnalyticsSummary
from app.database.db import db
from app.auth.auth_handler import get_current_user, UserProfile

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary(current_user: UserProfile = Depends(get_current_user)):
    """Retrieve full inbox metrics, category distributions, priority breakdowns, and volume trends."""
    return db.get_analytics()
