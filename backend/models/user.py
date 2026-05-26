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


class UserOut(UserSummary):
    pass
