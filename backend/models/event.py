from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: str | None = Field(default="", max_length=4000)
    venue: str | None = Field(default=None, max_length=255)
    start_at: datetime
    end_at: datetime | None = None
    is_all_day: bool = False
    c_id: int | None = None
    g_id: int | None = None
    module_code: str | None = Field(default=None, max_length=40)
    event_type: str | None = Field(default=None, max_length=40)

    @field_validator("description", mode="before")
    @classmethod
    def convert_null_to_empty_string(cls, v):
        if v is None:
            return ""
        return v


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
    event_type: str | None = Field(default=None, max_length=40)

    @field_validator("description", mode="before")
    @classmethod
    def convert_null_to_empty_string(cls, v):
        if v is None:
            return ""
        return v


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
    event_type: str | None = None
    is_attending: bool = False
    rsvp_count: int = 0
    total_members: int = 0
    created_at: datetime
    updated_at: datetime

    @field_validator("description", mode="before")
    @classmethod
    def convert_null_to_empty_string(cls, v):
        if v is None:
            return ""
        return v



class EventAttendanceUpdate(BaseModel):
    is_attending: bool


class EventAttendanceOut(BaseModel):
    e_id: int
    user_id: int
    is_attending: bool


class AttendanceSummaryRow(BaseModel):
    user_id: int
    name: str
    email: str
    is_attending: bool
    attended: bool | None = None

    class Config:
        from_attributes = True


class MarkActualAttendancePayload(BaseModel):
    user_id: int
    attended: bool | None
