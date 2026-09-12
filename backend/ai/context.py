"""Server-side context builders for the assistant.

Every behaviour grounds itself in data read straight from the database (and
the cached Canvas layer) — the assistant never trusts a client-supplied
snapshot. `day_context` feeds the briefing/digest; `chat_context` feeds the
conversational assistant with a compact, id-labelled index of the student's
resources so replies can cite things worth opening.
"""

import asyncio
import logging
from datetime import datetime

from database import db
from routes.canvas import list_canvas_announcements, list_canvas_assignments
from sql_dialect import now_expr, today_expr, today_plus_expr

logger = logging.getLogger("canvenient.ai")

NOTE_SNIPPET_CHARS = 120
MAX_ANNOUNCEMENT_AGE_DAYS = 3


async def open_tasks(user_id: int, limit: int = 15) -> list[dict]:
    rows = await db.fetch_all(
        query="""
            SELECT t.id, t.title, COALESCE(t.due_at_override, t.source_due_at) AS due_at,
                   t.priority_manual, t.status, c.name AS category_name, m.module_code
            FROM tasks t
            LEFT JOIN categories c ON c.id = t.category_id
            LEFT JOIN academic_modules m ON m.id = t.module_id
            WHERE t.user_id = :user_id AND t.status <> 'done'
            ORDER BY due_at ASC NULLS LAST
            LIMIT :limit
        """,
        values={"user_id": user_id, "limit": limit},
    )
    return [dict(row) for row in rows]


async def todays_classes(user_id: int) -> list[dict]:
    rows = await db.fetch_all(
        query=f"""
            SELECT module_code, module_name, lesson_type, start_time, end_time, venue
            FROM classes
            WHERE user_id = :user_id AND class_date = {today_expr()}
            ORDER BY start_time ASC
        """,
        values={"user_id": user_id},
    )
    return [dict(row) for row in rows]


async def upcoming_exams(user_id: int, days: int = 7) -> list[dict]:
    rows = await db.fetch_all(
        query=f"""
            SELECT module_code, module_name, start_at
            FROM exams
            WHERE user_id = :user_id AND start_at >= {now_expr()}
              AND start_at <= {today_plus_expr(f'{days} days')}
            ORDER BY start_at ASC LIMIT 5
        """,
        values={"user_id": user_id},
    )
    return [dict(row) for row in rows]


async def upcoming_events(user_id: int, days: int = 7) -> list[dict]:
    rows = await db.fetch_all(
        query=f"""
            SELECT id, title, start_at, venue
            FROM events
            WHERE user_id = :user_id AND start_at >= {now_expr()}
              AND start_at <= {today_plus_expr(f'{days} days')}
            ORDER BY start_at ASC LIMIT 5
        """,
        values={"user_id": user_id},
    )
    return [dict(row) for row in rows]


async def recent_announcements(user, limit: int = 8) -> list[dict]:
    """Undismissed announcements, newest first, from the cached Canvas layer."""
    try:
        announcements = await list_canvas_announcements(user, force_refresh=False)
    except Exception:
        logger.warning("canvas announcements unavailable for assistant context", exc_info=True)
        return []
    fresh = [a for a in announcements if not a.get("is_dismissed")]
    return fresh[:limit]


async def unsubmitted_assignments(user, limit: int = 10) -> list[dict]:
    try:
        assignments = await list_canvas_assignments(user, force_refresh=False)
    except Exception:
        logger.warning("canvas assignments unavailable for assistant context", exc_info=True)
        return []
    return [a for a in assignments if not a.get("has_submitted")][:limit]


async def note_index(user_id: int, limit: int = 20) -> list[dict]:
    rows = await db.fetch_all(
        query=f"""
            SELECT id, title, substr(content, 1, {NOTE_SNIPPET_CHARS}) AS snippet, updated_at
            FROM notes
            WHERE user_id = :user_id
            ORDER BY updated_at DESC
            LIMIT :limit
        """,
        values={"user_id": user_id, "limit": limit},
    )
    return [dict(row) for row in rows]


async def file_index(user_id: int, limit: int = 15) -> list[dict]:
    rows = await db.fetch_all(
        query="""
            SELECT id, canvas_file_id, filename, module_code, file_type, created_at_canvas
            FROM canvas_files
            WHERE user_id = :user_id
            ORDER BY created_at_canvas DESC
            LIMIT :limit
        """,
        values={"user_id": user_id, "limit": limit},
    )
    return [dict(row) for row in rows]


def _iso(value) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _as_dt(value) -> datetime | None:
    """SQLite rows return timestamps as strings; normalise for comparisons."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return value if isinstance(value, datetime) else None


async def day_context(user) -> dict:
    """Everything that is true about the student's day, no AI involved."""
    user_id = user.id
    classes, tasks, exams = await asyncio.gather(
        todays_classes(user_id), open_tasks(user_id, limit=20), upcoming_exams(user_id)
    )
    now = datetime.now()
    announcements = await recent_announcements(user, limit=6)
    recent = []
    for ann in announcements:
        posted = ann.get("posted_at")
        try:
            posted_dt = datetime.fromisoformat(str(posted).replace("Z", "+00:00"))
            age_days = (datetime.now(posted_dt.tzinfo) - posted_dt).days
        except (ValueError, TypeError):
            age_days = None
        if age_days is not None and age_days > MAX_ANNOUNCEMENT_AGE_DAYS:
            continue
        recent.append(
            {
                "id": ann.get("id"),
                "course": ann.get("course_code"),
                "title": ann.get("title"),
                "posted_at": posted,
            }
        )
    return {
        "today": now.strftime("%A %d %b %Y"),
        "classes": [
            {
                "code": c["module_code"],
                "name": c["module_name"],
                "type": c["lesson_type"],
                "start": str(c["start_time"]),
                "end": str(c["end_time"]),
                "venue": c["venue"] or "",
            }
            for c in classes
        ],
        "tasks": [
            {
                "id": t["id"],
                "title": t["title"],
                "due_at": _iso(t["due_at"]),
                "priority": t["priority_manual"],
                "overdue": bool(_as_dt(t["due_at"]) and _as_dt(t["due_at"]) < now),
            }
            for t in tasks
        ],
        "exams": [
            {"code": e["module_code"], "name": e["module_name"], "start_at": _iso(e["start_at"])}
            for e in exams
        ],
        "new_announcements": recent,
    }


async def chat_context(user) -> dict:
    """Compact, id-labelled index of the student's world for the chat turn."""
    day, notes, files, assignments, events = await asyncio.gather(
        day_context(user),
        note_index(user.id),
        file_index(user.id),
        unsubmitted_assignments(user, limit=8),
        upcoming_events(user.id),
    )
    context = dict(day)
    context["now"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    context["notes"] = [
        {"id": n["id"], "title": n["title"], "snippet": (n["snippet"] or "").strip()}
        for n in notes
    ]
    context["files"] = [
        {
            "id": int(f["canvas_file_id"]),
            "name": f["filename"],
            "course": f["module_code"],
            "type": f["file_type"],
        }
        for f in files
        if str(f["canvas_file_id"]).isdigit()
    ]
    context["assignments"] = [
        {
            "id": a.get("id"),
            "course": a.get("course_code"),
            "title": a.get("title"),
            "due_at": a.get("due_at"),
        }
        for a in assignments
        if a.get("id") is not None
    ]
    context["events"] = [
        {"id": e["id"], "title": e["title"], "start_at": _iso(e["start_at"]), "venue": e["venue"] or ""}
        for e in events
    ]
    return context
