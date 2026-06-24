from pydantic import BaseModel, Field

class InviteCreate(BaseModel):
    g_id: int
    
class InviteOut(BaseModel):
    code: str
    g_id: int
