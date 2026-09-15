"""Focus sessions — completed timer runs from the tray timer, in-app timer,
and iOS. Deliberately a fresh system: there is no server-side "active"
session. Clients own running state and only report completed sessions, so
offline runs queue locally and replay safely via client_id."""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from database import db
from dependencies import CurrentUser

router = APIRouter(prefix="/focus", tags=["focus"])

ALLOWED_SOURCES = {"mac_tray", "ios", "manual", "break"}


class FocusSessionIn(BaseModel):
    started_at: datetime
    ended_at: datetime
    planned_minutes: int = Field(ge=1, le=480)
    actual_seconds: int = Field(ge=0)
    source: str = "manual"
    module_id: int | None = None
    task_id: int | None = None
    is_break: bool = False
    client_id: str | None = Field(default=None, max_length=64)


async def ensure_owned_task(task_id: int | None, user_id: int):
    if task_id is None:
        return
    row = await db.fetch_one(
        query="SELECT id FROM tasks WHERE id = :id AND user_id = :user_id",
        values={"id": task_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found.")


async def ensure_owned_module(module_id: int | None, user_id: int):
    if module_id is None:
        return
    row = await db.fetch_one(
        query="SELECT id FROM academic_modules WHERE id = :id AND user_id = :user_id",
        values={"id": module_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Module not found.")


def build_session(row) -> dict:
    session = dict(row)
    # SQLite returns booleans as 0/1; clients get real JSON booleans.
    session["is_break"] = bool(session.get("is_break"))
    return session


def week_start(now: datetime) -> datetime:
    """Monday 00:00 local of the current week — same semantics as
    sql_dialect.week_start_expr, computed in Python so the query stays a
    plain literal with named binds."""
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


@router.post("/sessions")
async def create_focus_session(payload: FocusSessionIn, current_user: CurrentUser, response: Response):
    if payload.source not in ALLOWED_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=f"source must be one of: {', '.join(sorted(ALLOWED_SOURCES))}",
        )
    if payload.ended_at < payload.started_at:
        raise HTTPException(status_code=422, detail="ended_at cannot be before started_at.")
    await ensure_owned_task(payload.task_id, current_user.id)
    await ensure_owned_module(payload.module_id, current_user.id)

    # Replay: a client_id already stored for this user returns the existing
    # row instead of duplicating it, so offline queues can flush safely.
    if payload.client_id:
        existing = await db.fetch_one(
            query="SELECT * FROM focus_sessions WHERE user_id = :user_id AND client_id = :client_id",
            values={"user_id": current_user.id, "client_id": payload.client_id},
        )
        if existing:
            response.status_code = status.HTTP_200_OK
            return build_session(existing)

    client_id = payload.client_id or str(uuid.uuid4())
    row = await db.fetch_one(
        query="""
            INSERT INTO focus_sessions (
                user_id, started_at, ended_at, planned_minutes, actual_seconds,
                source, client_id, module_id, task_id, is_break
            ) VALUES (
                :user_id, :started_at, :ended_at, :planned_minutes, :actual_seconds,
                :source, :client_id, :module_id, :task_id, :is_break
            )
            RETURNING *
        """,
        values={
            "user_id": current_user.id,
            "started_at": payload.started_at,
            "ended_at": payload.ended_at,
            "planned_minutes": payload.planned_minutes,
            "actual_seconds": payload.actual_seconds,
            "source": payload.source,
            "client_id": client_id,
            "module_id": payload.module_id,
            "task_id": payload.task_id,
            "is_break": payload.is_break,
        },
    )
    if not row:
        raise HTTPException(status_code=500, detail="Focus session could not be stored.")
    response.status_code = status.HTTP_201_CREATED
    return build_session(row)


@router.get("/summary")
async def focus_summary(current_user: CurrentUser, range: str = "today"):
    if range not in ("today", "week"):
        raise HTTPException(status_code=422, detail="range must be 'today' or 'week'.")
    now = datetime.now()
    if range == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = week_start(now)
    row = await db.fetch_one(
        query="""
            SELECT COALESCE(SUM(actual_seconds), 0) AS total_seconds,
                   COUNT(*) AS sessions
            FROM focus_sessions
            WHERE user_id = :user_id AND is_break = FALSE AND ended_at >= :start
        """,
        values={"user_id": current_user.id, "start": start},
    )
    return {
        "range": range,
        "total_seconds": row["total_seconds"] or 0,
        "sessions": row["sessions"] or 0,
    }


@router.get("/sessions")
async def list_focus_sessions(current_user: CurrentUser, limit: int = 20):
    rows = await db.fetch_all(
        query="""
            SELECT * FROM focus_sessions
            WHERE user_id = :user_id
            ORDER BY ended_at DESC
            LIMIT :limit
        """,
        values={"user_id": current_user.id, "limit": min(max(limit, 1), 100)},
    )
    return [build_session(row) for row in rows]


@router.delete("/sessions/{session_id}")
async def delete_focus_session(session_id: int, current_user: CurrentUser):
    row = await db.fetch_one(
        query="DELETE FROM focus_sessions WHERE id = :session_id AND user_id = :user_id RETURNING id",
        values={"session_id": session_id, "user_id": current_user.id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Focus session not found.")
    return {"ok": True, "id": row["id"]}
