from datetime import datetime, time, date
from pydantic import BaseModel
from models.event import EventOut


class ClassOut(BaseModel):
    id: int
    module_code: str
    module_name: str
    lesson_type: str
    class_no: str | None = None
    day_of_week: int
    start_time: time
    end_time: time
    venue: str | None = None
    class_date: date


class ExamOut(BaseModel):
    id: int
    module_code: str
    module_name: str
    start_at: datetime
    end_at: datetime


class ScheduleOut(BaseModel):
    classes: list[ClassOut]
    exams: list[ExamOut]
    events: list[EventOut]
