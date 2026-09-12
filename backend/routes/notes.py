from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db
from dependencies import CurrentUser

router = APIRouter(prefix="/notes", tags=["Notes"])


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str
    folder_id: Optional[int] = None
    class_id: Optional[int] = None
    class_occurrence_date: Optional[date] = None
    is_recurring: bool = False


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder_id: Optional[int] = None
    is_pinned: Optional[bool] = None


@router.get("", response_model=list[dict[str, Any]])
async def get_notes(current_user: CurrentUser):
    query = """
        SELECT n.*, cnl.occurrence_date AS class_occurrence_date,
               cnl.class_summary AS class_summary,
               cnl.class_occurrence_key AS class_occurrence_key
        FROM notes n
        LEFT JOIN class_note_links cnl ON cnl.note_id = n.id AND cnl.user_id = n.user_id
        WHERE n.user_id = :user_id
        ORDER BY n.updated_at DESC
    """
    records = await db.fetch_all(query, {"user_id": current_user.id})
    out = []
    for r in records:
        d = dict(r)
        d["is_recurring"] = bool("|recurring|" in (d.get("class_occurrence_key") or ""))
        out.append(d)
    return out


@router.post("", response_model=dict[str, Any])
async def create_note(data: NoteCreate, current_user: CurrentUser):
    linked_class = None
    if data.class_id is not None or data.class_occurrence_date is not None:
        if data.class_id is None or data.class_occurrence_date is None:
            raise HTTPException(status_code=422, detail="Choose both a class and its occurrence date.")
        linked_class = await db.fetch_one(
            query="""
                SELECT id, module_code, lesson_type, class_no, start_time, class_date
                FROM classes WHERE id = :class_id AND user_id = :user_id
            """,
            values={"class_id": data.class_id, "user_id": current_user.id},
        )
        if not linked_class:
            raise HTTPException(status_code=404, detail="Class not found")
        if (
            linked_class["class_date"] is not None
            and str(linked_class["class_date"]) != data.class_occurrence_date.isoformat()
        ):
            raise HTTPException(status_code=400, detail="That class does not occur on the selected date.")
    query = """
        INSERT INTO notes (user_id, title, content, folder_id)
        VALUES (:user_id, :title, :content, :folder_id)
        RETURNING *
    """
    values = {
        "user_id": current_user.id,
        "title": data.title.strip(),
        "content": data.content.strip(),
        "folder_id": data.folder_id,
    }
    record = await db.fetch_one(query, values)
    result = dict(record)
    if linked_class is not None:
        date_part = "recurring" if data.is_recurring else data.class_occurrence_date.isoformat()
        class_key = "|".join(
            (
                str(linked_class["module_code"] or "").strip().upper(),
                date_part,
                str(linked_class["start_time"] or ""),
                str(linked_class["lesson_type"] or "").strip().lower(),
                str(linked_class["class_no"] or "").strip().upper(),
            )
        )
        details = str(linked_class["lesson_type"] or "Class").strip()
        if linked_class["class_no"]:
            details = f"{details} [{linked_class['class_no']}]"
        summary = f"{linked_class['module_code']} {details}"
        await db.execute(
            query="""
                INSERT INTO class_note_links (note_id, user_id, class_occurrence_key, occurrence_date, class_summary)
                VALUES (:note_id, :user_id, :class_occurrence_key, :occurrence_date, :class_summary)
            """,
            values={
                "note_id": result["id"],
                "user_id": current_user.id,
                "class_occurrence_key": class_key,
                "occurrence_date": data.class_occurrence_date,
                "class_summary": summary,
            },
        )
        result["class_occurrence_date"] = data.class_occurrence_date
        result["class_summary"] = summary
        result["is_recurring"] = data.is_recurring
    return result


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
    if hasattr(data, "folder_id") and data.folder_id is not None:
        # Note: If we want to unset folder_id, we'd need a special sentinel, but for now we just allow setting
        updates.append("folder_id = :folder_id")
        values["folder_id"] = data.folder_id
    if hasattr(data, "is_pinned") and data.is_pinned is not None:
        updates.append("is_pinned = :is_pinned")
        values["is_pinned"] = data.is_pinned

    query = f"""
        UPDATE notes 
        SET {", ".join(updates)}
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
