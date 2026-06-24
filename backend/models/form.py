from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any

class FormCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    form_type: str = Field(default="survey", max_length=50)
    fields: list[dict[str, Any]] = Field(default_factory=list)
    closes_at: datetime | None = None
    c_id: int | None = None
    g_id: int | None = None

class FormUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    form_type: str | None = Field(default=None, max_length=50)
    fields: list[dict[str, Any]] | None = None
    closes_at: datetime | None = None

class FormOut(BaseModel):
    id: int
    user_id: int
    c_id: int | None = None
    g_id: int | None = None
    title: str
    description: str
    form_type: str
    fields: list[dict[str, Any]]
    closes_at: datetime | None = None
    created_at: datetime

class FormResponseCreate(BaseModel):
    response_data: dict[str, Any]

class FormResponseOut(BaseModel):
    id: int
    form_id: int
    user_id: int
    response_data: dict[str, Any]
    submitted_at: datetime
