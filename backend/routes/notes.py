from fastapi import APIRouter, HTTPException
from typing import Any, Optional
from pydantic import BaseModel
from database import db
from dependencies import CurrentUser
from datetime import datetime

router = APIRouter(prefix="/notes", tags=["Notes"])

class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str
    folder_id: Optional[int] = None

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder_id: Optional[int] = None

@router.get("", response_model=list[dict[str, Any]])
async def get_notes(current_user: CurrentUser):
    query = "SELECT * FROM notes WHERE user_id = :user_id ORDER BY updated_at DESC"
    records = await db.fetch_all(query, {"user_id": current_user.id})
    return [dict(r) for r in records]

@router.post("", response_model=dict[str, Any])
async def create_note(data: NoteCreate, current_user: CurrentUser):
    query = """
        INSERT INTO notes (user_id, title, content, folder_id)
        VALUES (:user_id, :title, :content, :folder_id)
        RETURNING *
    """
    values = {
        "user_id": current_user.id, 
        "title": data.title.strip(),
        "content": data.content.strip(),
        "folder_id": data.folder_id
    }
    record = await db.fetch_one(query, values)
    return dict(record)

@router.patch("/{note_id}", response_model=dict[str, Any])
async def update_note(note_id: int, data: NoteUpdate, current_user: CurrentUser):
    # Verify ownership
    check_query = "SELECT id FROM notes WHERE id = :id AND user_id = :user_id"
    existing = await db.fetch_one(check_query, {"id": note_id, "user_id": current_user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Note not found")

    updates = ["updated_at = CURRENT_TIMESTAMP"]
    values = {"id": note_id, "user_id": current_user.id}
    
    if data.title is not None:
        updates.append("title = :title")
        values["title"] = data.title.strip()
    if data.content is not None:
        updates.append("content = :content")
        values["content"] = data.content.strip()
    if hasattr(data, 'folder_id') and data.folder_id is not None:
        # Note: If we want to unset folder_id, we'd need a special sentinel, but for now we just allow setting
        updates.append("folder_id = :folder_id")
        values["folder_id"] = data.folder_id

    query = f"""
        UPDATE notes 
        SET {', '.join(updates)}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
    """
    record = await db.fetch_one(query, values)
    return dict(record)

@router.delete("/{note_id}")
async def delete_note(note_id: int, current_user: CurrentUser):
    query = "DELETE FROM notes WHERE id = :id AND user_id = :user_id RETURNING id"
    deleted = await db.fetch_one(query, {"id": note_id, "user_id": current_user.id})
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}
