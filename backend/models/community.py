from pydantic import BaseModel, Field

class CommunityCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length = 160)
    description: str = Field(default="", max_length = 4000)

class CommunityUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

class CommunityOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str