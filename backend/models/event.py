from datetime import datetime
from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    venue: str | None = Field(default=None, max_length=255)
    start_at: datetime
    end_at: datetime | None = None
    is_all_day: bool = False
    c_id: int | None = None
    g_id: int | None = None
    module_code: str | None = Field(default=None, max_length=40)


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    venue: str | None = Field(default=None, max_length=255)
    start_at: datetime | None = None
    end_at: datetime | None = None
    is_all_day: bool | None = None
    c_id: int | None = None
    g_id: int | None = None
    module_code: str | None = Field(default=None, max_length=40)


class EventOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    venue: str | None = None
    start_at: datetime
    end_at: datetime | None = None
    is_all_day: bool
    c_id: int | None = None
    g_id: int | None = None
    module_code: str | None = None
    created_at: datetime
    updated_at: datetime
