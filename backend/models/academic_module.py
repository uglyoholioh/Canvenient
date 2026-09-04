from typing import Literal

from pydantic import BaseModel, Field


class AcademicModuleOut(BaseModel):
    id: int
    module_code: str
    name: str
    source_type: Literal["canvas"]
    source_course_id: str | None = None
    external_url: str | None = None
    color: str | None = None
    is_selected: bool = True


class AcademicModuleSelectionUpdate(BaseModel):
    module_ids: list[int] = Field(default_factory=list)
