# pyrefly: ignore [missing-import]

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class SuggestedItem(BaseModel):
    type: str = Field(description="Must be either 'task' or 'schedule'")
    title: Optional[str] = Field(None, description="Actionable title if type is task, or a summary message if type is schedule")
    description: Optional[str] = Field(None, description="Extra context explaining why this is suggested")
    priority: Optional[str] = Field(None, description="Optional priority: 'high', 'medium', or 'low'. Only required if type is task")

class AiBriefResponse(BaseModel):
    summary: str = Field(description="A short 2-3 sentence overview of the student's week ahead.")
    suggestions: List[SuggestedItem] = Field(description="A list of tasks or schedule observations.")

class MessageItem(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    messages: List[MessageItem] = Field(description = "History of chat messages in this session")
    context_snapshot: Dict[str, Any] = Field(description = "Snapshot of user tasks and schedule data")
    