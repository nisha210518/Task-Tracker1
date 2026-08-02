import os
import json
import asyncio
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from database import SessionLocal
from models import DBTask, DBUser
from pywebpush import webpush, WebPushException

import auth
import users
import groups
import tasks
import ai
import websocket

# Pre-generated VAPID Keys for secure Web Push encryption [2]
VAPID_PUBLIC_KEY = "BD74Z9_1Z_8P2R_1Z_8P2R_1Z_8P2R_1Z_8P2" 
VAPID_PRIVATE_KEY = "your-private-key-will-be-handled-or-generated"
VAPID_CLAIMS = {"sub": "mailto:admin@taskflow.com"}

app = FastAPI(title="TaskFlow Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(tasks.router)
app.include_router(ai.router)
app.include_router(websocket.router)

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

# =========================================================================
# WEB PUSH SENDER UTILITY
# =========================================================================
def send_web_push_notification(subscription_json_str: str, task_title: str):
    try:
        subscription_info = json.loads(subscription_json_str)
        # Standard VAPID keys for secure encryption
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({
                "title": "TaskFlow Alarm Active!",
                "body": f"Time to start: {task_title}"
            }),
            vapid_private_key=os.getenv("VAPID_PRIVATE_KEY", "your-private-key"),
            vapid_claims=VAPID_CLAIMS
        )
        print(f"Web Push successfully sent for task: {task_title}")
    except WebPushException as ex:
        print("Web Push Exception occurred:", ex)
    except Exception as e:
        print("Failed to dispatch web push:", e)

# =========================================================================
# 24/7 BACKGROUND ALARM MONITORING ENGINE
# =========================================================================
async def monitor_alarms_loop():
    while True:
        await asyncio.sleep(60) # Run check once every 60 seconds
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            # Query active tasks whose alarm deadlines have passed
            due_tasks = db.query(DBTask).filter(
                DBTask.status != "completed",
                DBTask.due_date <= now
            ).all()
            
            for task in due_tasks:
                owner = db.query(DBUser).filter(DBUser.id == task.owner_id).first()
                if owner and owner.push_subscription:
                    # Dispatch push notification directly to the phone [2]
                    send_web_push_notification(owner.push_subscription, task.title)
        except Exception as e:
            print("Error in background alarm worker:", e)
        finally:
            db.close()

# Start the background worker loop on server boot
@app.on_event("startup")
async def on_startup():
    asyncio.create_task(monitor_alarms_loop())