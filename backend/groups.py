import http.client
import json
import random
import string
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from database import get_db, Base
from models import DBGroup, DBUser, DBTask
from auth import get_current_user
from sqlalchemy import Column, Integer, String, ForeignKey

router = APIRouter(prefix="/api/groups", tags=["groups"])

# Relational database mapping table for group memberships
class DBGroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="member") # owner (admin), member

# =========================================================================
# SCHEMAS FOR INCOMING PAYLOADS & RESPONSES
# =========================================================================
class GroupCreateSchema(BaseModel):
    name: str

class MemberAddSchema(BaseModel):
    username: str

class WebhookUpdateSchema(BaseModel):
    webhook_url: str

class GroupTaskCreateSchema(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    assigned_username: Optional[str] = None
    start_day: Optional[int] = 1
    end_day: Optional[int] = 3

class ReassignSchema(BaseModel):
    username: str

class GroupResponseSchema(BaseModel):
    id: int
    name: str
    invite_code: str
    owner_id: int
    webhook_url: Optional[str] = None
    class Config:
        from_attributes = True

# =========================================================================
# ASYNCHRONOUS OUTGOING WEBHOOK SYSTEM (DISCORD INTEGRATION)
# =========================================================================
def post_discord_webhook(url: str, content: str):
    """
    Asynchronously posts a structured JSON payload to the configured Discord channel.
    Uses standard library http.client to keep dependencies lightweight.
    """
    try:
        if not url.startswith("https://discord.com/api/webhooks/"):
            return
        domain = "discord.com"
        path = url.split("discord.com")[1]
        
        connection = http.client.HTTPSConnection(domain)
        headers = {"Content-Type": "application/json"}
        payload = json.dumps({"content": content})
        connection.request("POST", path, payload, headers)
        connection.getresponse()
        connection.close()
    except Exception as e:
        print("Discord Webhook delivery failed:", e)

def trigger_group_notification(db: Session, group_id: int, message: str, bg_tasks: BackgroundTasks):
    """
    Helper function to enqueue a Discord notification if the group has a webhook URL set.
    """
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if group and group.webhook_url:
        bg_tasks.add_task(post_discord_webhook, group.webhook_url, f"📢 **TaskFlow Workspace Alert:** {message}")

# =========================================================================
# API ENDPOINT DEFINITIONS
# =========================================================================

# Create Group
@router.post("", response_model=GroupResponseSchema)
def create_group(payload: GroupCreateSchema, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    group = DBGroup(name=payload.name, invite_code=code, owner_id=current_user.id)
    db.add(group)
    db.commit()
    db.refresh(group)
    
    # Automatically add creator as owner (admin)
    member = DBGroupMember(group_id=group.id, user_id=current_user.id, role="owner")
    db.add(member)
    db.commit()
    return group

# Delete Entire Group Workspace (Admin only)
@router.delete("/{group_id}")
def delete_group(group_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group creator (admin) can delete this workspace")
    
    db.delete(group)
    db.commit()
    return {"status": "Group deleted successfully"}

# List Groups User belongs to
@router.get("", response_model=List[GroupResponseSchema])
def list_my_groups(current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(DBGroup).join(DBGroupMember, DBGroupMember.group_id == DBGroup.id).filter(DBGroupMember.user_id == current_user.id).all()

# Save / Update Discord Webhook (Admin only)
@router.put("/{group_id}/webhook")
def update_group_webhook(group_id: int, payload: WebhookUpdateSchema, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group admin can modify webhook integrations")
    
    group.webhook_url = payload.webhook_url.strip() if payload.webhook_url.strip() else None
    db.commit()
    return {"status": "Webhook updated successfully"}

# Invite Teammate by Username (Like Instagram)
@router.post("/{group_id}/add-member")
def add_member_by_username(group_id: int, payload: MemberAddSchema, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    admin_check = db.query(DBGroupMember).filter(
        DBGroupMember.group_id == group_id, 
        DBGroupMember.user_id == current_user.id,
        DBGroupMember.role == "owner"
    ).first()
    if not admin_check:
        raise HTTPException(status_code=403, detail="Only the group admin can add members")
        
    target_user = db.query(DBUser).filter(DBUser.username == payload.username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Username not found")
        
    exists = db.query(DBGroupMember).filter(DBGroupMember.group_id == group_id, DBGroupMember.user_id == target_user.id).first()
    if exists:
        raise HTTPException(status_code=400, detail="User is already in this group")
        
    new_member = DBGroupMember(group_id=group_id, user_id=target_user.id, role="member")
    db.add(new_member)
    db.commit()
    return {"message": f"Successfully added {payload.username}"}

# Remove Member (Admin only)
@router.delete("/{group_id}/members/{user_id}")
def remove_member(group_id: int, user_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group admin can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="The owner cannot be removed from the group")
        
    membership = db.query(DBGroupMember).filter(DBGroupMember.group_id == group_id, DBGroupMember.user_id == user_id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User is not a member of this group")
    
    db.delete(membership)
    db.commit()
    return {"status": "Member removed successfully"}

# Get Group Members List
@router.get("/{group_id}/members")
def get_group_members(group_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(DBUser).join(DBGroupMember, DBGroupMember.user_id == DBUser.id).filter(DBGroupMember.group_id == group_id).all()

# Create and Assign Task inside Group (Triggers Outgoing Discord Webhooks)
@router.post("/{group_id}/tasks")
def create_group_task(group_id: int, payload: GroupTaskCreateSchema, background_tasks: BackgroundTasks, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = db.query(DBGroupMember).filter(DBGroupMember.group_id == group_id, DBGroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this group")
        
    assignee_id = current_user.id
    assignee_name = current_user.username
    
    if payload.assigned_username:
        user = db.query(DBUser).filter(DBUser.username == payload.assigned_username).first()
        if user:
            assignee_id = user.id
            assignee_name = user.username

    task = DBTask(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        status="pending",
        owner_id=assignee_id,
        group_id=group_id,
        start_day=payload.start_day,
        end_day=payload.end_day
    )
    db.add(task)
    db.commit()
    
    # Enqueue Outgoing Webhook Notification
    trigger_group_notification(
        db, 
        group_id, 
        f"New task **'{payload.title}'** created and assigned to **@{assignee_name}** for **Day {payload.start_day} to Day {payload.end_day}**!", 
        background_tasks
    )
    return {"status": "Task created"}

# Delete Group Task (Admin only)
@router.delete("/{group_id}/tasks/{task_id}")
def delete_group_task(group_id: int, task_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the admin can delete group tasks")
        
    task = db.query(DBTask).filter(DBTask.id == task_id, DBTask.group_id == group_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    db.delete(task)
    db.commit()
    return {"status": "Task deleted"}

# Reassign Group Task (Admin only)
@router.put("/{group_id}/tasks/{task_id}/reassign")
def reassign_group_task(group_id: int, task_id: int, payload: ReassignSchema, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(DBGroup).filter(DBGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the admin can reassign group tasks")
        
    task = db.query(DBTask).filter(DBTask.id == task_id, DBTask.group_id == group_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    new_user = db.query(DBUser).filter(DBUser.username == payload.username).first()
    if not new_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    task.owner_id = new_user.id
    db.commit()
    return {"status": f"Reassigned to @{payload.username}"}

# Get Group Tasks
@router.get("/{group_id}/tasks")
def get_group_tasks(group_id: int, current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(DBTask).filter(DBTask.group_id == group_id).all()

# Get Group Burn-down Performance Metrics
@router.get("/{group_id}/burndown")
def get_burndown_data(group_id: int, db: Session = Depends(get_db)):
    tasks = db.query(DBTask).filter(DBTask.group_id == group_id).all()
    total = len(tasks)
    completed = len([t for t in tasks if t.status == "completed"])
    
    return {
        "labels": ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Today"],
        "ideal_burn": [total, total*0.8, total*0.6, total*0.4, total*0.2, total*0.1, 0],
        "actual_burn": [total, total, total-min(completed, 1), max(0, total-completed), max(0, total-completed), max(0, total-completed), max(0, total-completed)]
    }