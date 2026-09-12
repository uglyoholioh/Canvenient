"""
Regression tests for SQL that must run on both PostgreSQL and SQLite.

The packaged desktop sidecar always runs SQLite, which implements neither
NOW(), INTERVAL, date_trunc, split_part, nor :: casts. These tests exercise
the endpoints that previously regressed to Postgres-only syntax and silently
failed on the shipped app.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from conftest import auth_headers
from httpx import AsyncClient

from database import db
from telegram_bot import handle_command

pytestmark = pytest.mark.asyncio


async def test_assistant_brief_builds_context_on_sqlite(client: AsyncClient, auth, monkeypatch):
    """A forced refresh skips the cache, so the day-context queries must execute."""
    token, user_id, _ = auth

    async def fake_generate_json(system, prompt, schema, extra_parts=None):
        return {"summary": "All clear.", "attention": []}

    monkeypatch.setattr("ai.assistant.generate_json", fake_generate_json)

    resp = await client.get("/assistant/brief?refresh=true", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary"] == "All clear."
    assert body["ai_ok"] is True


async def test_sync_canvas_tasks_on_sqlite(client: AsyncClient, auth, monkeypatch):
    """The sync delete/update statements must run on SQLite without swallowing errors."""
    token, user_id, _ = auth
    monkeypatch.setattr("routes.tasks.sync_canvas_courses_as_academic_modules", AsyncMock(return_value=None))
    monkeypatch.setattr("routes.tasks.list_canvas_assignments", AsyncMock(return_value=[]))

    resp = await client.post("/tasks/sync-canvas", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


async def test_study_session_summary_and_leaderboard_on_sqlite(client: AsyncClient, auth):
    token, user_id, _ = auth

    create = await client.post(
        "/study-sessions",
        headers=auth_headers(token),
        json={"title": "Deep work", "planned_minutes": 25},
    )
    assert create.status_code == 201, create.text
    session_id = create.json()["id"]

    complete = await client.patch(
        f"/study-sessions/{session_id}/complete",
        headers=auth_headers(token),
        json={"actual_seconds": 1500, "pause_count": 0},
    )
    assert complete.status_code == 200, complete.text

    summary = await client.get("/study-sessions/summary", headers=auth_headers(token))
    assert summary.status_code == 200, summary.text
    summary_body = summary.json()
    assert summary_body["completed_sessions"] == 1
    assert summary_body["week_seconds"] == 1500
    assert summary_body["current_streak"] == 1
    assert {"module_code": "Unassigned", "total_seconds": 1500} in summary_body["by_module"]

    leaderboard = await client.get("/study-sessions/leaderboard", headers=auth_headers(token))
    assert leaderboard.status_code == 200, leaderboard.text
    entries = leaderboard.json()
    assert len(entries) == 1
    assert entries[0]["completed_sessions"] == 1

    leaderboard_day = await client.get("/study-sessions/leaderboard?period=day", headers=auth_headers(token))
    assert leaderboard_day.status_code == 200, leaderboard_day.text


async def test_telegram_commands_on_sqlite(client: AsyncClient, auth):
    """/today, /week, /deadlines and /done issue time-window SQL on SQLite."""
    token, user_id, _ = auth
    due_soon = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    task = await client.post(
        "/tasks",
        headers=auth_headers(token),
        json={"title": "Regression task", "due_at_override": due_soon},
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]

    await db.execute(
        query="INSERT INTO events (user_id, title, start_at) VALUES (:user_id, :title, datetime('now', '+1 day'))",
        values={"user_id": user_id, "title": "Regression event"},
    )

    for command in ("/today", "/week", "/deadlines"):
        reply = await handle_command(user_id, command)
        assert "Regression task" in reply, f"{command} reply missing task: {reply}"

    done = await handle_command(user_id, f"/done {task_id}")
    assert "Completed: Regression task" in done
