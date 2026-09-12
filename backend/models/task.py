from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TaskStatus = Literal["todo", "in_progress", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
TaskSourceType = Literal["manual", "canvas"]
ClassRelation = Literal["due_before", "bring_to", "follow_up_after"]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=20000)
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
    class_id: int | None = None
    class_occurrence_date: date | None = None
    class_relation: ClassRelation = "due_before"
    is_recurring: bool = False
    class_recurring: bool = False
    group_id: int | None = None
    assignee_id: int | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Task title cannot be empty.")
        return title

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, value: str | None) -> str:
        if value is None:
            return ""
        if not isinstance(value, str):
            value = str(value)
        return value[:20000]


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=20000)
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
    group_id: int | None = None
    assignee_id: int | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value

        title = value.strip()
        if not title:
            raise ValueError("Task title cannot be empty.")
        return title

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            value = str(value)
        return value[:20000]


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
    module_color: str | None = None
    class_occurrence_date: date | None = None
    class_summary: str | None = None
    class_relation: ClassRelation | None = None
    is_recurring: bool | None = None
    class_recurring: bool | None = None
    category_id: int | None = None
    category_name: str | None = None
    category_color: str | None = None
    group_id: int | None = None
    group_name: str | None = None
    assignee_id: int | None = None
    assignee_name: str | None = None
    assignee_email: str | None = None
    creator_id: int | None = None
    creator_name: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
