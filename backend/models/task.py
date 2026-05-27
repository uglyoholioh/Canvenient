from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TaskStatus = Literal["todo", "in_progress", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
TaskSourceType = Literal["manual", "canvas"]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    module_id: int | None = None
    category_id: int | None = None
    status: TaskStatus = "todo"
    priority_manual: TaskPriority = "medium"
    estimated_minutes: int | None = Field(default=None, ge=0)
    source_type: TaskSourceType = "manual"
    source_id: str | None = Field(default=None, max_length=120)
    source_due_at: datetime | None = None
    due_at_override: datetime | None = None
    external_url: str | None = Field(default=None, max_length=500)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Task title cannot be empty.")
        return title


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    module_id: int | None = None
    category_id: int | None = None
    status: TaskStatus | None = None
    priority_manual: TaskPriority | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    source_type: TaskSourceType | None = None
    source_id: str | None = Field(default=None, max_length=120)
    source_due_at: datetime | None = None
    due_at_override: datetime | None = None
    external_url: str | None = Field(default=None, max_length=500)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value

        title = value.strip()
        if not title:
            raise ValueError("Task title cannot be empty.")
        return title


class TaskOut(BaseModel):
    id: int
    title: str
    description: str
    status: TaskStatus
    priority_manual: TaskPriority
    recommended_priority: TaskPriority
    estimated_minutes: int | None = None
    source_type: TaskSourceType
    source_id: str | None = None
    source_due_at: datetime | None = None
    due_at_override: datetime | None = None
    effective_due_at: datetime | None = None
    external_url: str | None = None
    module_id: int | None = None
    module_code: str | None = None
    module_name: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    category_color: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
