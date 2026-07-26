from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.event import (
    EventCreate, EventOut, EventUpdate, EventAttendanceUpdate, EventAttendanceOut,
    AttendanceSummaryRow, MarkActualAttendancePayload
)

router = APIRouter(prefix="/events", tags=["events"])


def build_event(record) -> EventOut:
    rec_dict = dict(record)
    return EventOut(
        id=rec_dict["id"],
        user_id=rec_dict["user_id"],
        title=rec_dict["title"],
        description=rec_dict["description"],
        venue=rec_dict["venue"],
        start_at=rec_dict["start_at"],
        end_at=rec_dict["end_at"],
        is_all_day=rec_dict["is_all_day"],
        c_id=rec_dict["c_id"],
        g_id=rec_dict["g_id"],
        module_code=rec_dict["module_code"],
        event_type=rec_dict.get("event_type"),
        is_attending=rec_dict.get("is_attending", False),
        rsvp_count=rec_dict.get("rsvp_count", 0) or 0,
        total_members=rec_dict.get("total_members", 0) or 0,
        created_at=rec_dict["created_at"],
        updated_at=rec_dict["updated_at"],
    )


@router.get("", response_model=list[EventOut])
async def list_events(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT DISTINCT e.*,
                   CASE WHEN ea.is_attending IS NOT NULL THEN ea.is_attending
                        WHEN e.user_id = :user_id THEN TRUE
                        ELSE FALSE
                   END AS is_attending,
                   (SELECT COUNT(*) FROM event_attendance ea2
                    WHERE ea2.e_id = e.id AND ea2.is_attending = TRUE) AS rsvp_count,
                   COALESCE((SELECT COUNT(*) FROM g_members gm_c
                    WHERE gm_c.g_id = e.g_id), 0) AS total_members
            FROM events e
            LEFT JOIN g_members gm ON gm.g_id = e.g_id
            LEFT JOIN groups g ON g.c_id = e.c_id
            LEFT JOIN g_members gm_comm ON gm_comm.g_id = g.id
            LEFT JOIN event_attendance ea ON ea.e_id = e.id AND ea.user_id = :user_id
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
            query="SELECT user_id FROM communities WHERE id = :c_id",
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
                    venue, start_at, end_at, is_all_day, event_type
                )
                VALUES (
                    :user_id, :c_id, :g_id, :module_code, :title, :description,
                    :venue, :start_at, :end_at, :is_all_day, :event_type
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
                "event_type": payload.event_type,
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

        rec_dict = dict(row)
        rec_dict["rsvp_count"] = 0
        rec_dict["total_members"] = 0
        return build_event(rec_dict)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(event_id: int, payload: EventUpdate, current_user: CurrentUser):
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
    description_val = updates.get("description") if "description" in updates else existing["description"]
    if description_val is None:
        description_val = ""

    existing_dict = dict(existing)
    merged = {
        "title": updates.get("title", existing_dict["title"]),
        "description": description_val,
        "venue": updates.get("venue", existing_dict["venue"]),
        "start_at": updates.get("start_at", existing_dict["start_at"]),
        "end_at": updates.get("end_at", existing_dict["end_at"]),
        "is_all_day": updates.get("is_all_day", existing_dict["is_all_day"]),
        "c_id": updates.get("c_id", existing_dict["c_id"]),
        "g_id": updates.get("g_id", existing_dict["g_id"]),
        "module_code": updates.get("module_code", existing_dict["module_code"]),
        "event_type": updates.get("event_type", existing_dict.get("event_type")),
    }

    await db.execute(
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
                event_type = :event_type,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :event_id AND user_id = :user_id
        """,
        values={
            "event_id": event_id,
            "user_id": current_user.id,
            **merged,
        },
    )
    row = await db.fetch_one(
        query="SELECT * FROM events WHERE id = :event_id",
        values={"event_id": event_id},
    )
    rec_dict = dict(row)
    rec_dict["rsvp_count"] = 0
    rec_dict["total_members"] = 0
    return build_event(rec_dict)


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


@router.get("/{event_id}/attendance-summary", response_model=list[AttendanceSummaryRow])
async def get_attendance_summary(event_id: int, current_user: CurrentUser):
    event = await db.fetch_one(
        query="SELECT g_id FROM events WHERE id = :eid",
        values={"eid": event_id}
    )
    if not event or not event["g_id"]:
        raise HTTPException(status_code=404, detail="Event not found or not a group event.")

    member_check = await db.fetch_one(
        query="SELECT role FROM g_members WHERE g_id = :g_id AND user_id = :uid",
        values={"g_id": event["g_id"], "uid": current_user.id}
    )
    if not member_check or member_check["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only group admins can view attendance.")

    rows = await db.fetch_all(
        query="""
            SELECT gm.user_id,
                   COALESCE(us.name, '') AS name,
                   u.email,
                   COALESCE(ea.is_attending, FALSE) AS is_attending,
                   ea.attended
            FROM g_members gm
            JOIN users u ON u.id = gm.user_id
            LEFT JOIN user_settings us ON us.user_id = gm.user_id
            LEFT JOIN event_attendance ea ON ea.e_id = :eid AND ea.user_id = gm.user_id
            WHERE gm.g_id = :g_id
            ORDER BY gm.role DESC, u.email ASC
        """,
        values={"eid": event_id, "g_id": event["g_id"]}
    )
    return [AttendanceSummaryRow.model_validate(dict(row)) for row in rows]


@router.post("/{event_id}/attendance-mark")
async def mark_actual_attendance(event_id: int, payload: MarkActualAttendancePayload, current_user: CurrentUser):
    event = await db.fetch_one(
        query="SELECT g_id FROM events WHERE id = :eid",
        values={"eid": event_id}
    )
    if not event or not event["g_id"]:
        raise HTTPException(status_code=404, detail="Event not found or not a group event.")

    member_check = await db.fetch_one(
        query="SELECT role FROM g_members WHERE g_id = :g_id AND user_id = :uid",
        values={"g_id": event["g_id"], "uid": current_user.id}
    )
    if not member_check or member_check["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only group admins can mark attendance.")

    await db.execute(
        query="""
            INSERT INTO event_attendance (user_id, e_id, is_attending, attended)
            VALUES (:uid, :eid, FALSE, :attended)
            ON CONFLICT (user_id, e_id) DO UPDATE SET attended = EXCLUDED.attended
        """,
        values={"uid": payload.user_id, "eid": event_id, "attended": payload.attended}
    )
    return {"ok": True}
