from pydantic import BaseModel, Field


class TelegramLinkOut(BaseModel):
    linked: bool
    bot_username: str | None = None


class TelegramClaim(BaseModel):
    code: str = Field(..., min_length=4, max_length=20)


class TelegramWebhookUpdate(BaseModel):
    update_id: int
    message: dict | None = None
