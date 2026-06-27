from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    c_id: int
    name: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GroupOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str
    c_id: int | None


class GroupMemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True