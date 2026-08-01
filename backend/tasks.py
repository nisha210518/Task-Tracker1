import os
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from database import get_db
from models import DBTask, DBUser
from auth import get_current_user
from websocket import manager

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreateSchema(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[datetime] = None
    is_recurring: Optional[bool] = False
    recurrence_interval: Optional[str] = "once"
    
    # ADD THIS FIELD:
    alert_type: Optional[str] = "alarm"

class TaskResponseSchema(BaseModel):
    id: int
    title: str
    description: Optional[str]
    priority: str
    status: str
    due_date: Optional[datetime]
    rollover_count: int
    start_day: Optional[int] = 1
    end_day: Optional[int] = 3
    is_recurring: bool
    recurrence_interval: str
    
    # ADD THIS FIELD:
    alert_type: str
    class Config:
        from_attributes = True

# 1. GET /api/tasks -> List Tasks
@router.get("", response_model=List[TaskResponseSchema])
@router.get("/", response_model=List[TaskResponseSchema])
def list_tasks(current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(DBTask).filter(DBTask.owner_id == current_user.id).all()

# 2. POST /api/tasks -> Create Task
@router.post("", response_model=TaskResponseSchema)
@router.post("/", response_model=TaskResponseSchema)
def create_task(payload: TaskCreateSchema, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    due = payload.due_date if payload.due_date else datetime.utcnow() + timedelta(days=1)
    task = DBTask(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=due,
        owner_id=current_user.id,
        start_day=1,
        end_day=3,
        is_recurring=payload.is_recurring,
        recurrence_interval=payload.recurrence_interval,
        
        # SAVE THE ALERT STYLE:
        alert_type=payload.alert_type
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

# 3. POST /api/tasks/{task_id}/complete -> Complete Task
@router.post("/{task_id}/complete")
@router.put("/{task_id}/complete")
async def complete_task(task_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(DBTask).filter(DBTask.id == task_id, DBTask.owner_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Award XP and Level up
    current_user.xp += 10
    if current_user.xp >= current_user.level * 100:
        current_user.xp = current_user.xp - (current_user.level * 100)
        current_user.level += 1
    
    current_user.reputation_score = min(150, current_user.reputation_score + 2)

    # RECURRING TASK AUTO-SCHEDULER LOGIC:
    if task.is_recurring and task.recurrence_interval == "daily":
        # Shift deadline forward by exactly 1 day and keep status as pending
        task.due_date = task.due_date + timedelta(days=1)
        task.rollover_count = 0 # Reset rollover counts for the new day
    else:
        task.status = "completed"
        
    db.commit()
    
    await manager.broadcast({"event": "TASK_COMPLETED", "user": current_user.username, "task": task.title})
    return {"message": "Completed", "xp": current_user.xp, "level": current_user.level}

# 4. DELETE /api/tasks/{task_id} -> Delete Task
@router.delete("/{task_id}")
def delete_task(task_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(DBTask).filter(DBTask.id == task_id, DBTask.owner_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}

# 5. POST /api/tasks/rollover -> Smart Rollover Engine Trigger
@router.post("/rollover")
async def trigger_rollover(current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    overdue_tasks = db.query(DBTask).filter(
        DBTask.owner_id == current_user.id,
        DBTask.status != "completed",
        DBTask.due_date < now
    ).all()
    
    total_overdue = len(overdue_tasks)
    escalations = 0
    burnout_archives = 0
    priorities = ["low", "medium", "high", "critical"]
    
    for task in overdue_tasks:
        task.rollover_count += 1
        
        # Burnout logic: too many overdue tasks pushes items to 'Burnout Backlog'
        if total_overdue > 4 or task.rollover_count >= 3:
            task.status = "overdue"
            task.due_date = None
            current_user.reputation_score = max(0, current_user.reputation_score - 3)
            burnout_archives += 1
        else:
            task.due_date = now + timedelta(days=1)
            current_user.reputation_score = max(0, current_user.reputation_score - 1)
            try:
                idx = priorities.index(task.priority.lower())
                if idx < len(priorities) - 1:
                    task.priority = priorities[idx + 1]
                    escalations += 1
            except ValueError:
                task.priority = "critical"
                
    db.commit()
    
    report = {
        "event": "ROLLOVER_COMPLETE",
        "processed": total_overdue,
        "escalations": escalations,
        "burnout_archives": burnout_archives
    }
    await manager.broadcast(report)
    return report

# 6. GET /api/tasks/ai-coaching -> Generate AI Productivity Tip
@router.get("/ai-coaching")
def get_ai_coaching(current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Fetch user analytics
    tasks = db.query(DBTask).filter(DBTask.owner_id == current_user.id).all()
    completed = [t for t in tasks if t.status == "completed"]
    overdue = [t for t in tasks if t.status == "overdue"]
    pending = [t for t in tasks if t.status == "pending"]
    
    # Determine the highest priority pending task
    urgent_task = None
    priorities = ["critical", "high", "medium", "low"]
    for p in priorities:
        match = [t for t in pending if t.priority == p]
        if match:
            urgent_task = match[0]
            break
            
    # Default high-quality fallback tip (if no OpenAI API key is configured)
    coaching_tip = f"Hi @{current_user.username}! Welcome to your dashboard. Create a daily task to organize your workspace schedule!"
    
    if len(tasks) > 0:
        if len(overdue) > 2:
            coaching_tip = f"🚨 @{current_user.username}, you currently have {len(overdue)} overdue tasks. We highly recommend running your Nightly Rollover to clear your dashboard and reduce burnout pressure."
        elif urgent_task:
            coaching_tip = f"⚡ Focused Advice: Your most critical item is '{urgent_task.title}'. Allocate 30 minutes right now to make progress on it!"
        elif len(completed) > len(pending):
            coaching_tip = f"🏆 Incredible work, @{current_user.username}! You've completed {len(completed)} tasks. Keep up the high momentum today!"
        else:
            coaching_tip = f"📅 Keep it steady, @{current_user.username}! You have {len(pending)} pending tasks. Tackle them one by one."
            
    # If the user has configured an OpenAI key, override the fallback with dynamic AI coaching
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            import http.client
            connection = http.client.HTTPSConnection("api.openai.com")
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
            body = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are a professional, short, 1-sentence productivity coach. Generate a motivational, hyper-focused piece of advice based on the user's task statistics."},
                    {"role": "user", "content": f"User: @{current_user.username}. Completed tasks: {len(completed)}. Overdue tasks: {len(overdue)}. Pending tasks: {len(pending)}. Most urgent task: '{urgent_task.title if urgent_task else 'None'}'."}
                ]
            }
            connection.request("POST", "/v1/chat/completions", json.dumps(body), headers)
            res = connection.getresponse()
            data = json.loads(res.read().decode())
            coaching_tip = data["choices"][0]["message"]["content"]
        except Exception:
            pass # Gracefully default back to local rule-engine
            
    return {"coaching_tip": coaching_tip}