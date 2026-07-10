from typing import Literal

from pydantic import BaseModel


class AcademicModuleOut(BaseModel):
    id: int
    module_code: str
    name: str
    source_type: Literal["canvas"]
    source_course_id: str | None = None
    external_url: str | None = None
