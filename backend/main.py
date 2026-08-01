from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import auth
import users
import groups
import tasks
import ai
import websocket

app = FastAPI(title="TaskFlow Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrations for the modular backend routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(tasks.router)
app.include_router(ai.router)
app.include_router(websocket.router)

# Mount the static site directory
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")