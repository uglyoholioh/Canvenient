# pyrefly: ignore [missing-import]

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class TaskBase(BaseModel):
    title: str = Field(...,min_length = 1, max_length = 255)
    description: Optional[str] = ""
    status: Optional[str] = "todo"
    due_at_override: Optional[datetime] = None  
    module_id: Optional[int] = None
    category_id: Optional[int] = None
    priority_manual: Optional[str] = "medium"
    estimated_minutes: Optional[int] = None


class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length = 1, max_length = 255)
    description: Optional[str] = None
    status: Optional[str] = None
    due_at_override: Optional[datetime] = None  
    module_id: Optional[int] = None
    category_id: Optional[int] = None
    priority_manual: Optional[str] = None
    estimated_minutes: Optional[int] = None

class TaskOut(TaskBase):
    id: int
    user_id: int
    source_type: str
    source_id: Optional[str] = None
    source_due_at: Optional[datetime] = None
    external_url: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)    