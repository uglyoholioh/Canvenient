import asyncio
from fastapi import APIRouter
import os
import httpx
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from datetime import date
from database import db
from dependencies import CurrentUser
from routes.canvas import list_canvas_announcements
import json
import traceback
from pydantic import BaseModel


MODEL_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
#use Gemini flash 2.0 free tier for now

async def call_ai(
    contents: List[Dict[str, Any]],
    system_instruction: Optional[str] = None,
    response_mime_type: Optional[str] = None
) -> Dict[str, Any]:
    api_key = os.getenv("MODEL_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail = "API key not configured"
        )
    headers = {"Content-Type": "application/json"}
    params = {"key": api_key}
    payload = {"contents": contents}

    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
    
    if response_mime_type:
        payload["generationConfig"] = {
            "responseMimeType": response_mime_type
        }

    async with httpx.AsyncClient(timeout = 30.0) as client:
        try:
            response = await client.post(MODEL_BASE_URL, headers=headers, params=params, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code = status.HTTP_503_SERVICE_UNAVAILABLE,
                detail = f"Failed to connect to AI service: {e.response.text}"
            )
        except Exception as e:
            raise HTTPException(
                status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail = f"Failed to communicate with LLM: {str(e)}"
            )

    
router = APIRouter(prefix = "/ai", tags = ["ai"])

@router.post("/brief")
async def generate_brief(current_user: CurrentUser):
    try:
        #fetching uncompleted tasks
        tasks_query = """
            SELECT title, description, status, priority_manual, 
                   COALESCE(due_at_override, source_due_at) AS due_date,
                   source_type
            FROM tasks
            WHERE user_id = :user_id AND status != 'done'
            ORDER BY due_date ASC NULLS LAST
        """

        #fetch classes for next 7 days
        classes_query = """
            SELECT module_code, module_name, lesson_type, start_time, end_time, venue, class_date
            FROM classes
            WHERE user_id = :user_id 
              AND class_date >= CURRENT_DATE 
              AND class_date <= CURRENT_DATE + INTERVAL '7 days'
            ORDER BY class_date ASC, start_time ASC
        """

        # fetch exams for next 7 days
        exams_query = """
            SELECT module_code, module_name, start_at, end_at
            FROM exams
            WHERE user_id = :user_id
              AND start_at >= NOW()
              AND start_at <= NOW() + INTERVAL '7 days'
            ORDER BY start_at ASC
        """

        # fetch events for next 7 days
        events_query = """
            SELECT title, start_at, end_at, venue
            FROM events
            WHERE user_id = :user_id
              AND start_at >= NOW()
              AND start_at <= NOW() + INTERVAL '7 days'
            ORDER BY start_at ASC
        """

        # db queries
        tasks, classes, exams, events, announcements = await asyncio.gather(
            db.fetch_all(query=tasks_query, values={"user_id": current_user.id}),
            db.fetch_all(query=classes_query, values={"user_id": current_user.id}),
            db.fetch_all(query=exams_query, values={"user_id": current_user.id}),
            db.fetch_all(query=events_query, values={"user_id": current_user.id}),
            list_canvas_announcements(current_user)
        )

        # formatting for API call
        serialized_tasks = []
        for t in tasks:
            serialized_tasks.append({
                "title": t["title"],
                "description": t["description"] or "",
                "priority": t["priority_manual"],
                "due_date": t["due_date"].isoformat() if t["due_date"] else None,
                "source": t["source_type"]
            })

        serialized_schedule = []
        for c in classes:
            serialized_schedule.append({
                "type": f"Class ({c['lesson_type']})",
                "title": f"{c['module_code']} - {c['module_name']}",
                "time": f"{c['class_date']} from {c['start_time']} to {c['end_time']}",
                "venue": c["venue"] or "No venue specified"
            })
        for ex in exams:
            serialized_schedule.append({
                "type": "Exam",
                "title": f"{ex['module_code']} - {ex['module_name']}",
                "time": ex["start_at"].isoformat(),
                "venue": "Check exam details"
            })
        for ev in events:
            serialized_schedule.append({
                "type": "Event",
                "title": ev["title"],
                "time": ev["start_at"].isoformat(),
                "venue": ev["venue"] or "No venue specified"
            })

        serialized_announcements = []
        for ann in announcements:
            serialized_announcements.append({
                "course": ann.get("course_code"),
                "title": ann.get("title"),
                "author": ann.get("author"),
                "date": ann.get("posted_at"),
                "content": ann.get("body") or ""
            })


        #Combined context data
        context = {
            "tasks": serialized_tasks,
            "schedule": serialized_schedule,
            "announcements": serialized_announcements,
            "current_date": date.today().isoformat()
        }

        # System instructions outlining the response schema
        system_instruction = (
            "You are an academic planner assistant for a university student. "
            "Analyze the student's current tasks and upcoming schedule to generate a structured briefing. "
            "Do not use emojis in your response. Keep the tone professional, direct, and realistic. "
            "You must return a JSON object with the following schema:\n"
            "{\n"
            "  \"summary\": \"A short 2-3 sentence overview of their day or week ahead, focusing on critical deadlines or busy days.\",\n"
            "  \"suggestions\": [\n"
            "    {\n"
            "      \"type\": \"task\",\n"
            "      \"title\": \"A concise, actionable task title suggesting a step they should take (e.g., Prepare CS2103 lecture notes).\",\n"
            "      \"description\": \"A brief description explaining why this is suggested.\",\n"
            "      \"priority\": \"high\", \"medium\", or \"low\"\n"
            "    },\n"
            "    {\n"
            "      \"type\": \"schedule\",\n"
            "      \"message\": \"A scheduling observation (e.g., You have a 3-hour gap between classes tomorrow; good for study.)\"\n"
            "    }\n"
            "  ]\n"
            "}\n"
            "Respond ONLY with this raw JSON object. Do not include markdown wraps like ```json ... ```."
        )

        prompt_text = f"Student Context:\n{context}"

        contents = [
            {"parts": [{"text": prompt_text}]}
        ]

        response_data = await call_ai(
            contents=contents,
            system_instruction=system_instruction,
            response_mime_type="application/json"
        )

        try:
            raw_text = response_data["candidates"][0]["content"]["parts"][0]["text"]
            structured_brief = json.loads(raw_text)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not parse structured LLM response: {str(e)}"
            )

        return {
            "brief": structured_brief,
            "context_snapshot": context
        }
    except Exception as e:
        print("DIAGNOSTIC ERROR TRACE:")
        traceback.print_exc()
        raise e


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    context_snapshot: Dict[str, Any]


@router.post("/chat")
async def chat_with_ai(current_user: CurrentUser, body: ChatRequest):
    try:
        system_instruction = (
            "You are an academic planner assistant for a university student. "
            "You have access to the student's context (tasks, schedule, announcements). "
            "Answer questions about their schedule, help prioritize tasks, suggest study plans, "
            "or clarify their briefing. Keep responses concise and professional. "
            "Do not use emojis. Respond in plain text."
        )

        context_text = f"Student Context:\n{json.dumps(body.context_snapshot, indent=2)}"

        formatted_contents = [
            {"parts": [{"text": context_text}]},
            *[{"parts": [{"text": f"{m['role']}: {m['content']}"}]} for m in body.messages],
        ]

        response_data = await call_ai(
            contents=formatted_contents,
            system_instruction=system_instruction,
        )

        reply = response_data["candidates"][0]["content"]["parts"][0]["text"]

        return {"reply": reply}
    except Exception as e:
        print("CHAT ERROR TRACE:")
        traceback.print_exc()
        raise e
