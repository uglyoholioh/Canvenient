from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserSummary(BaseModel):
    id: int
    email: EmailStr
    name: str = ""
    canvas_token: str = ""


class ProfileUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    canvas_token: str = Field(default="")


class UserOut(UserSummary):
    pass
