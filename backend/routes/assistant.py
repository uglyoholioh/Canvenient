"""Assistant endpoints: quick-capture parsing, grounded chat, daily brief.

The fresh `/assistant/*` namespace replaces the legacy `/ai/*` surface
functionality-wise; the legacy routes stay mounted and untouched until a
separate cleanup pass removes them.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Query, status
from fastapi.exceptions import HTTPException
from pydantic import BaseModel, Field

from ai.assistant import AI_ATTACHMENT_TYPES, build_brief, chat_turn, parse_task_text
from ai.provider import AIUnavailable
from dependencies import CurrentUser

logger = logging.getLogger("canvenient.assistant")

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class ParsedTask(BaseModel):
    title: str
    due_at: Optional[str] = None
    priority: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    estimated_minutes: Optional[int] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class Attachment(BaseModel):
    type: str = Field(..., description=f"One of: {', '.join(sorted(AI_ATTACHMENT_TYPES))}")
    id: int = Field(..., description="Canvas/DB id of the resource to attach")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., max_length=40)
    attachment: Optional[Attachment] = None


class AssistantResource(BaseModel):
    type: str
    id: Optional[int] = None
    label: str


class AssistantAction(BaseModel):
    kind: str
    title: str
    due_at: Optional[str] = None
    priority: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    resources: list[AssistantResource]
    actions: list[AssistantAction]


def _unavailable(err: AIUnavailable) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(err))


@router.post("/parse", response_model=ParsedTask)
async def parse_text(payload: ParseRequest, current_user: CurrentUser):
    try:
        return await parse_task_text(current_user, payload.text)
    except AIUnavailable as err:
        raise _unavailable(err) from err


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, current_user: CurrentUser):
    messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    attachment = payload.attachment.model_dump() if payload.attachment else None
    try:
        return await chat_turn(current_user, messages, attachment)
    except AIUnavailable as err:
        raise _unavailable(err) from err


@router.get("/brief")
async def brief(
    current_user: CurrentUser,
    refresh: bool = Query(False),
) -> dict[str, Any]:
    # The brief degrades gracefully without AI, so no 503 path here.
    return await build_brief(current_user, force=refresh)
