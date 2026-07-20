from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SessionStatus = Literal["active", "completed", "cancelled"]


class StudySessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    planned_minutes: int = Field(..., ge=1, le=480)
    task_id: int | None = None
    module_id: int | None = None
    category_id: int | None = None


class StudySessionFinish(BaseModel):
    actual_seconds: int = Field(..., ge=0, le=28800)
    pause_count: int = Field(default=0, ge=0, le=1000)


class StudySessionOut(BaseModel):
    id: int
    title: str
    planned_minutes: int
    actual_seconds: int
    pause_count: int
    status: SessionStatus
    task_id: int | None = None
    task_title: str | None = None
    module_id: int | None = None
    module_code: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    created_at: datetime


class StudySummary(BaseModel):
    today_seconds: int
    week_seconds: int
    completed_sessions: int
    average_seconds: int
    current_streak: int
    by_module: list[dict]


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    name: str
    total_seconds: int
    completed_sessions: int
    is_current_user: bool
