from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.event import EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])


def build_event(record) -> EventOut:
    return EventOut(
        id=record["id"],
        user_id=record["user_id"],
        title=record["title"],
        description=record["description"],
        venue=record["venue"],
        start_at=record["start_at"],
        end_at=record["end_at"],
        is_all_day=record["is_all_day"],
        c_id=record["c_id"],
        g_id=record["g_id"],
        module_code=record["module_code"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


@router.get("", response_model=list[EventOut])
async def list_events(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT * FROM events
            WHERE user_id = :user_id
            ORDER BY start_at ASC
        """,
        values={"user_id": current_user.id},
    )
    return [build_event(row) for row in rows]


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(payload: EventCreate, current_user: CurrentUser):
    row = await db.fetch_one(
        query="""
            INSERT INTO events (
                user_id, c_id, g_id, module_code, title, description,
                venue, start_at, end_at, is_all_day
            )
            VALUES (
                :user_id, :c_id, :g_id, :module_code, :title, :description,
                :venue, :start_at, :end_at, :is_all_day
            )
            RETURNING *
        """,
        values={
            "user_id": current_user.id,
            "c_id": payload.c_id,
            "g_id": payload.g_id,
            "module_code": payload.module_code,
            "title": payload.title,
            "description": payload.description,
            "venue": payload.venue,
            "start_at": payload.start_at,
            "end_at": payload.end_at,
            "is_all_day": payload.is_all_day,
        },
    )
    return build_event(row)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int, payload: EventUpdate, current_user: CurrentUser
):
    existing = await db.fetch_one(
        query="""
            SELECT * FROM events
            WHERE id = :event_id AND user_id = :user_id
        """,
        values={"event_id": event_id, "user_id": current_user.id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Event not found.")

    updates = payload.model_dump(exclude_unset=True)
    merged = {
        "title": updates.get("title", existing["title"]),
        "description": updates.get("description", existing["description"]),
        "venue": updates.get("venue", existing["venue"]),
        "start_at": updates.get("start_at", existing["start_at"]),
        "end_at": updates.get("end_at", existing["end_at"]),
        "is_all_day": updates.get("is_all_day", existing["is_all_day"]),
        "c_id": updates.get("c_id", existing["c_id"]),
        "g_id": updates.get("g_id", existing["g_id"]),
        "module_code": updates.get("module_code", existing["module_code"]),
    }

    row = await db.fetch_one(
        query="""
            UPDATE events
            SET
                title = :title,
                description = :description,
                venue = :venue,
                start_at = :start_at,
                end_at = :end_at,
                is_all_day = :is_all_day,
                c_id = :c_id,
                g_id = :g_id,
                module_code = :module_code,
                updated_at = NOW()
            WHERE id = :event_id AND user_id = :user_id
            RETURNING *
        """,
        values={
            "event_id": event_id,
            "user_id": current_user.id,
            **merged,
        },
    )
    return build_event(row)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: int, current_user: CurrentUser):
    existing = await db.fetch_one(
        query="""
            SELECT id FROM events
            WHERE id = :event_id AND user_id = :user_id
        """,
        values={"event_id": event_id, "user_id": current_user.id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Event not found.")

    await db.execute(
        query="DELETE FROM events WHERE id = :event_id AND user_id = :user_id",
        values={"event_id": event_id, "user_id": current_user.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
