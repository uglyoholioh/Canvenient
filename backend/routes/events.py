from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.event import EventCreate, EventOut, EventUpdate, EventAttendanceUpdate, EventAttendanceOut

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
            SELECT DISTINCT e.*
            FROM events e
            LEFT JOIN g_members gm ON gm.g_id = e.g_id
            LEFT JOIN groups g ON g.c_id = e.c_id
            LEFT JOIN g_members gm_comm ON gm_comm.g_id = g.id
            WHERE e.user_id = :user_id
               OR gm.user_id = :user_id
               OR gm_comm.user_id = :user_id
            ORDER BY e.start_at ASC
        """,
        values={"user_id": current_user.id},
    )
    return [build_event(row) for row in rows]


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(payload: EventCreate, current_user: CurrentUser):
    if payload.g_id is not None:
        member = await db.fetch_one(
            query="""
                SELECT role FROM g_members 
                WHERE g_id = :g_id AND user_id = :user_id
            """,
            values={"g_id": payload.g_id, "user_id": current_user.id}
        )
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this group."
            )
        if member["role"] != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only group admins can create events for this group."
            )
    elif payload.c_id is not None:
        comm = await db.fetch_one(
            query="""
                SELECT user_id FROM communities WHERE id = :c_id
            """,
            values={"c_id": payload.c_id}
        )
        if not comm or comm["user_id"] != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the community creator can create events for this community."
            )

    async with db.transaction():
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
        
        member_ids = []
        if payload.g_id is not None:
            records = await db.fetch_all(
                query="""
                    SELECT user_id FROM g_members 
                    WHERE g_id = :g_id AND user_id != :creator_id
                """,
                values={"g_id": payload.g_id, "creator_id": current_user.id}
            )
            member_ids = [r["user_id"] for r in records]
        elif payload.c_id is not None:
            records = await db.fetch_all(
                query="""
                    SELECT DISTINCT gm.user_id 
                    FROM g_members gm
                    JOIN groups g ON gm.g_id = g.id
                    WHERE g.c_id = :c_id AND gm.user_id != :creator_id
                """,
                values={"c_id": payload.c_id, "creator_id": current_user.id}
            )
            member_ids = [r["user_id"] for r in records]
            
        for m_id in member_ids:
            await db.execute(
                query="""
                    INSERT INTO notifications (user_id, title, description)
                    VALUES (:user_id, :title, :description)
                """,
                values={
                    "user_id": m_id,
                    "title": f"New Event: {payload.title}",
                    "description": f"An event has been scheduled at {payload.venue or 'No venue specified'}."
                }
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


@router.get("/{event_id}/attendance", response_model=EventAttendanceOut)
async def get_attendance(event_id: int, current_user: CurrentUser):
    row = await db.fetch_one(
        query="""
            SELECT e_id, user_id, is_attending 
            FROM event_attendance
            WHERE e_id = :event_id AND user_id = :user_id
        """,
        values={"event_id": event_id, "user_id": current_user.id}
    )
    if not row:
        return EventAttendanceOut(e_id=event_id, user_id=current_user.id, is_attending=False)
    return EventAttendanceOut.model_validate(dict(row))


@router.post("/{event_id}/attendance", response_model=EventAttendanceOut)
async def update_attendance(event_id: int, payload: EventAttendanceUpdate, current_user: CurrentUser):
    row = await db.fetch_one(
        query="""
            INSERT INTO event_attendance (user_id, e_id, is_attending)
            VALUES (:user_id, :event_id, :is_attending)
            ON CONFLICT (user_id, e_id)
            DO UPDATE SET is_attending = EXCLUDED.is_attending
            RETURNING e_id, user_id, is_attending
        """,
        values={
            "user_id": current_user.id,
            "event_id": event_id,
            "is_attending": payload.is_attending
        }
    )
    return EventAttendanceOut.model_validate(dict(row))

