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
    # Timetables imported before exact occurrence dates were introduced only
    # stored day_of_week. Keep those rows readable while the frontend uses the
    # weekday as a compatibility fallback.
    class_date: date | None = None
    module_color: str | None = None
    attend_in_person: bool = True
    linked_task_count: int = 0
    linked_note_count: int = 0
    linked_file_count: int = 0


class ExamOut(BaseModel):
    id: int
    module_code: str
    module_name: str
    start_at: datetime
    end_at: datetime
    module_color: str | None = None


class ScheduleOut(BaseModel):
    classes: list[ClassOut]
    exams: list[ExamOut]
    events: list[EventOut]
