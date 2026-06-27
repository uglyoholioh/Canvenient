from datetime import datetime
from pydantic import BaseModel

class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    is_read: bool
    created_at: datetime
