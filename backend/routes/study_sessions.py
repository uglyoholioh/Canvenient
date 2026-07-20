from database import db
from dependencies import CurrentUser
from fastapi import APIRouter, HTTPException, Response, status
from models.study_session import (
    LeaderboardEntry,
    StudySessionCreate,
    StudySessionFinish,
    StudySessionOut,
    StudySummary,
)


router = APIRouter(prefix="/study-sessions", tags=["study sessions"])


def build_session(row) -> StudySessionOut:
    return StudySessionOut(**dict(row))


async def ensure_owned_reference(table: str, record_id: int | None, user_id: int):
    if record_id is None:
        return
    row = await db.fetch_one(
        query=f"SELECT id FROM {table} WHERE id = :id AND user_id = :user_id",
        values={"id": record_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"{table.replace('_', ' ').title()} not found.")


async def fetch_session(session_id: int, user_id: int):
    row = await db.fetch_one(
        query="""
            SELECT s.id, s.title, s.planned_minutes, s.actual_seconds,
                   s.pause_count, s.status, s.task_id, t.title AS task_title,
                   s.module_id, m.module_code, s.category_id,
                   c.name AS category_name, s.started_at, s.ended_at, s.created_at
            FROM study_sessions s
            LEFT JOIN tasks t ON t.id = s.task_id
            LEFT JOIN academic_modules m ON m.id = s.module_id
            LEFT JOIN categories c ON c.id = s.category_id
            WHERE s.id = :session_id AND s.user_id = :user_id
        """,
        values={"session_id": session_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Study session not found.")
    return row


@router.get("", response_model=list[StudySessionOut])
async def list_study_sessions(current_user: CurrentUser, limit: int = 20):
    rows = await db.fetch_all(
        query="""
            SELECT s.id, s.title, s.planned_minutes, s.actual_seconds,
                   s.pause_count, s.status, s.task_id, t.title AS task_title,
                   s.module_id, m.module_code, s.category_id,
                   c.name AS category_name, s.started_at, s.ended_at, s.created_at
            FROM study_sessions s
            LEFT JOIN tasks t ON t.id = s.task_id
            LEFT JOIN academic_modules m ON m.id = s.module_id
            LEFT JOIN categories c ON c.id = s.category_id
            WHERE s.user_id = :user_id
            ORDER BY s.started_at DESC
            LIMIT :limit
        """,
        values={"user_id": current_user.id, "limit": min(max(limit, 1), 100)},
    )
    return [build_session(row) for row in rows]


@router.post("", response_model=StudySessionOut, status_code=status.HTTP_201_CREATED)
async def create_study_session(payload: StudySessionCreate, current_user: CurrentUser):
    await ensure_owned_reference("tasks", payload.task_id, current_user.id)
    await ensure_owned_reference("academic_modules", payload.module_id, current_user.id)
    await ensure_owned_reference("categories", payload.category_id, current_user.id)
    active = await db.fetch_one(
        query="SELECT id FROM study_sessions WHERE user_id = :user_id AND status = 'active'",
        values={"user_id": current_user.id},
    )
    if active:
        raise HTTPException(status_code=409, detail="Finish or cancel your active session first.")
    row = await db.fetch_one(
        query="""
            INSERT INTO study_sessions (
                user_id, title, planned_minutes, task_id, module_id, category_id
            ) VALUES (
                :user_id, :title, :planned_minutes, :task_id, :module_id, :category_id
            ) RETURNING id
        """,
        values={"user_id": current_user.id, **payload.model_dump()},
    )
    return build_session(await fetch_session(row["id"], current_user.id))


@router.patch("/{session_id}/complete", response_model=StudySessionOut)
async def complete_study_session(
    session_id: int, payload: StudySessionFinish, current_user: CurrentUser
):
    session = await fetch_session(session_id, current_user.id)
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Only an active session can be completed.")
    maximum = session["planned_minutes"] * 60
    actual_seconds = min(payload.actual_seconds, maximum)
    await db.execute(
        query="""
            UPDATE study_sessions SET status = 'completed',
                actual_seconds = :actual_seconds, pause_count = :pause_count,
                ended_at = NOW()
            WHERE id = :session_id AND user_id = :user_id
        """,
        values={
            "session_id": session_id,
            "user_id": current_user.id,
            "actual_seconds": actual_seconds,
            "pause_count": payload.pause_count,
        },
    )
    return build_session(await fetch_session(session_id, current_user.id))


@router.patch("/{session_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_study_session(session_id: int, current_user: CurrentUser):
    session = await fetch_session(session_id, current_user.id)
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Only an active session can be cancelled.")
    await db.execute(
        query="""
            UPDATE study_sessions SET status = 'cancelled', ended_at = NOW()
            WHERE id = :session_id AND user_id = :user_id
        """,
        values={"session_id": session_id, "user_id": current_user.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/summary", response_model=StudySummary)
async def get_study_summary(current_user: CurrentUser):
    totals = await db.fetch_one(
        query="""
            SELECT
              COALESCE(SUM(actual_seconds) FILTER (WHERE ended_at >= CURRENT_DATE), 0) AS today_seconds,
              COALESCE(SUM(actual_seconds) FILTER (WHERE ended_at >= date_trunc('week', NOW())), 0) AS week_seconds,
              COUNT(*) AS completed_sessions,
              COALESCE(AVG(actual_seconds)::INTEGER, 0) AS average_seconds
            FROM study_sessions
            WHERE user_id = :user_id AND status = 'completed'
        """,
        values={"user_id": current_user.id},
    )
    modules = await db.fetch_all(
        query="""
            SELECT COALESCE(m.module_code, 'Unassigned') AS module_code,
                   SUM(s.actual_seconds)::INTEGER AS total_seconds
            FROM study_sessions s
            LEFT JOIN academic_modules m ON m.id = s.module_id
            WHERE s.user_id = :user_id AND s.status = 'completed'
            GROUP BY COALESCE(m.module_code, 'Unassigned')
            ORDER BY total_seconds DESC LIMIT 6
        """,
        values={"user_id": current_user.id},
    )
    days = await db.fetch_all(
        query="""
            SELECT DISTINCT ended_at::date AS study_day
            FROM study_sessions
            WHERE user_id = :user_id AND status = 'completed'
            ORDER BY study_day DESC
        """,
        values={"user_id": current_user.id},
    )
    streak = 0
    if days:
        from datetime import date, timedelta
        expected = date.today()
        if days[0]["study_day"] == expected - timedelta(days=1):
            expected -= timedelta(days=1)
        for row in days:
            if row["study_day"] != expected:
                break
            streak += 1
            expected -= timedelta(days=1)
    return StudySummary(
        **dict(totals), current_streak=streak, by_module=[dict(row) for row in modules]
    )


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(current_user: CurrentUser, period: str = "week"):
    cutoff = "CURRENT_DATE" if period == "day" else "date_trunc('week', NOW())"
    rows = await db.fetch_all(
        query=f"""
            SELECT s.user_id, COALESCE(NULLIF(us.name, ''), split_part(u.email, '@', 1)) AS name,
                   SUM(s.actual_seconds)::INTEGER AS total_seconds,
                   COUNT(*)::INTEGER AS completed_sessions
            FROM study_sessions s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN user_settings us ON us.user_id = s.user_id
            WHERE s.status = 'completed' AND s.ended_at >= {cutoff}
            GROUP BY s.user_id, us.name, u.email
            ORDER BY total_seconds DESC, completed_sessions DESC, name ASC
            LIMIT 20
        """
    )
    return [
        LeaderboardEntry(
            rank=index + 1,
            **dict(row),
            is_current_user=row["user_id"] == current_user.id,
        )
        for index, row in enumerate(rows)
    ]
