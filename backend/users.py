from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import DBUser, DBTask
from auth import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/api/users", tags=["users"])

class UserProfileResponse(BaseModel):
    id: int # ADD THIS LINE TO PREVENT THE BROWSER FROM RECEIVING 'UNDEFINED' USER IDs [2.5]
    username: str
    email: str
    xp: int
    level: int
    reputation_score: int
    class Config:
        from_attributes = True

@router.get("/me", response_model=UserProfileResponse)
def get_profile(current_user: DBUser = Depends(get_current_user)):
    return current_user

@router.get("/me/analytics")
def get_user_analytics(current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    # Calculate user productivity stats
    total_tasks = db.query(DBTask).filter(DBTask.owner_id == current_user.id).count()
    completed_tasks = db.query(DBTask).filter(
        DBTask.owner_id == current_user.id, 
        DBTask.status == "completed"
    ).count()
    overdue_tasks = db.query(DBTask).filter(
        DBTask.owner_id == current_user.id, 
        DBTask.status == "overdue"
    ).count()
    
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "overdue_tasks": overdue_tasks,
        "completion_rate": round(completion_rate, 1)
    }
    
# Add Pydantic validation schema at the top
class SubscriptionSchema(BaseModel):
    subscription_json: str

# Save / Update Web Push Subscription for the current user
@router.post("/subscribe")
def save_push_subscription(payload: SubscriptionSchema, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.push_subscription = payload.subscription_json
    db.commit()
    return {"status": "Subscribed successfully to Web Push Notifications"}