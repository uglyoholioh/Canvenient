from pydantic import BaseModel

from models.user import UserSummary


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSummary
