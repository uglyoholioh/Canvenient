from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AcademicModuleCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=160)
    source_type: Literal["manual", "canvas"] = "manual"
    source_course_id: str | None = Field(default=None, max_length=100)
    external_url: str | None = Field(default=None, max_length=500)

    @field_validator("code", "name")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be empty.")
        return cleaned


class AcademicModuleUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    source_type: Literal["manual", "canvas"] | None = None
    source_course_id: str | None = Field(default=None, max_length=100)
    external_url: str | None = Field(default=None, max_length=500)

    @field_validator("code", "name")
    @classmethod
    def validate_text(cls, value: str | None) -> str | None:
        if value is None:
            return value

        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be empty.")
        return cleaned


class AcademicModuleOut(BaseModel):
    id: int
    code: str
    name: str
    source_type: Literal["manual", "canvas"]
    source_course_id: str | None = None
    external_url: str | None = None
