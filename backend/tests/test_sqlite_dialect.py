"""
Regression tests for SQL that must run on both PostgreSQL and SQLite.

The packaged desktop sidecar always runs SQLite, which implements neither
NOW(), INTERVAL, date_trunc, split_part, nor :: casts. These tests exercise
the endpoints that previously regressed to Postgres-only syntax and silently
failed on the shipped app.
"""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from conftest import auth_headers
from database import db
from telegram_bot import handle_command

pytestmark = pytest.mark.asyncio


async def test_ai_brief_builds_context_on_sqlite(client: AsyncClient, auth, monkeypatch):
    """force_refresh skips the cache, so the four timeframe queries must execute."""
    token, user_id, _ = auth
    monkeypatch.setattr("routes.ai.list_canvas_announcements", AsyncMock(return_value=[]))
    monkeypatch.setattr("routes.ai.list_canvas_assignments", AsyncMock(return_value=[]))

    async def fake_call_ai(contents, system_instruction=None, response_mime_type=None):
        brief = json.dumps({"summary": "All clear.", "suggestions": []})
        return {"candidates": [{"content": {"parts": [{"text": brief}]}}]}

    monkeypatch.setattr("routes.ai.call_ai", fake_call_ai)

    resp = await client.post("/ai/brief?force_refresh=true", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["brief"] == {"summary": "All clear.", "suggestions": []}
    assert body["context_snapshot"]["timeframe"] == "this_week"


async def test_sync_canvas_tasks_on_sqlite(client: AsyncClient, auth, monkeypatch):
    """The sync delete/update statements must run on SQLite without swallowing errors."""
    token, user_id, _ = auth
    monkeypatch.setattr(
        "routes.tasks.sync_canvas_courses_as_academic_modules", AsyncMock(return_value=None)
    )
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

    leaderboard_day = await client.get(
        "/study-sessions/leaderboard?period=day", headers=auth_headers(token)
    )
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
