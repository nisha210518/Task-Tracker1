import http.client
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from models import DBUser

router = APIRouter(prefix="/api/ai", tags=["ai"])

class AIDecomposeSchema(BaseModel):
    goal: str

@router.post("/decompose")
def decompose_milestone(payload: AIDecomposeSchema, current_user: DBUser = Depends(get_current_user)):
    goal_text = payload.goal.strip()
    if not goal_text:
        raise HTTPException(status_code=400, detail="Milestone text cannot be empty")
        
    api_key = os.getenv("OPENAI_API_KEY")
    
    # Fallback simulation if an API key is not configured in local environment variables
    if not api_key:
        return {
            "source": "TaskFlow Local Engine Mock",
            "subtasks": [
                {"title": f"Initial research: {goal_text}", "description": "Identify core requirements.", "priority": "high"},
                {"title": f"Draft execution prototype: {goal_text}", "description": "Construct standard workflow.", "priority": "medium"},
                {"title": f"Review and test: {goal_text}", "description": "Ensure final outputs are clean.", "priority": "low"}
            ]
        }
    
    try:
        connection = http.client.HTTPSConnection("api.openai.com")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        body = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Decompose the user's high-level goal into structured tasks. "
                        "Return your response strictly in JSON format as a list of objects under 'subtasks'. "
                        "Each object must have 'title', 'description', and 'priority' (low, medium, high)."
                    )
                },
                {"role": "user", "content": f"Decompose: {goal_text}"}
            ],
            "response_format": {"type": "json_object"}
        }
        connection.request("POST", "/v1/chat/completions", json.dumps(body), headers)
        response = connection.getresponse()
        data = json.loads(response.read().decode())
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to retrieve AI decomposition details.")