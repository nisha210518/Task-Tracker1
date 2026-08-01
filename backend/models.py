from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from database import Base

class DBUser(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True} # Safe hot-reloading
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    reputation_score = Column(Integer, default=100)

class DBGroup(Base):
    __tablename__ = "groups"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    invite_code = Column(String, unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    
    # ADD THIS COLUMN:
    webhook_url = Column(String, nullable=True)

class DBTask(Base):
    __tablename__ = "tasks"
    __table_args__ = {'extend_existing': True} # Safe hot-reloading
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    priority = Column(String, default="medium")
    status = Column(String, default="pending")
    due_date = Column(DateTime, nullable=True)
    rollover_count = Column(Integer, default=0)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)
    
    # Timeline ranges for Gantt charts
    start_day = Column(Integer, default=1)
    end_day = Column(Integer, default=3)
    
    # Recurrence rules for daily routine scheduling
    is_recurring = Column(Boolean, default=False)
    recurrence_interval = Column(String(20), default="once") # 'once', 'daily'
    
    # Custom notification properties
    alert_type = Column(String(20), default="alarm") # 'alarm', 'notification'