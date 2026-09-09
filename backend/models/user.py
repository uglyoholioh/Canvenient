from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserSummary(BaseModel):
    """Internal auth principal; carries the Canvas token for server-side API calls."""

    id: int
    email: EmailStr
    name: str = ""
    canvas_token: str = ""
    theme: str = "default"


class UserPublic(BaseModel):
    """Client-safe profile shape; never includes the raw Canvas token."""

    id: int
    email: EmailStr
    name: str = ""
    theme: str = "default"
    canvas_connected: bool = False
    canvas_token_hint: str = ""


class ProfileUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    # None keeps the stored token, "" disconnects, a value replaces it.
    canvas_token: str | None = Field(default=None)
    theme: str = Field(default="default")


class UserOut(UserPublic):
    pass
