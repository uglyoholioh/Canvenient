"""Tests for the fresh assistant layer: /assistant/* endpoints and the
Telegram digest tick."""

from datetime import datetime

import pytest
from conftest import auth_headers
from httpx import AsyncClient

from ai.digest import run_digest_tick
from database import db
from migrations import run_migrations

pytestmark = pytest.mark.asyncio


# --- endpoints --------------------------------------------------------------


async def test_parse_requires_ai(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    resp = await client.post(
        "/assistant/parse", json={"text": "lab report due friday"}, headers=auth_headers(token)
    )
    assert resp.status_code == 503


async def test_parse_normalises_model_output(client: AsyncClient, auth, monkeypatch):
    token, user_id, _ = auth
    await db.execute(
        query="INSERT INTO categories (user_id, name) VALUES (:u, 'Coursework')",
        values={"u": user_id},
    )

    async def fake_generate_json(system, prompt, schema=None, extra_parts=None):
        return {
            "title": "MA2002 Problem Set 4",
            "due_at": "2026-09-18 17:00",
            "priority": "high",
            "category": "coursework",
            "estimated_minutes": 90,
        }

    monkeypatch.setattr("ai.assistant.generate_json", fake_generate_json)
    resp = await client.post(
        "/assistant/parse",
        json={"text": "finish ma2002 ps4 by next friday 5pm urgent"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "MA2002 Problem Set 4"
    assert body["due_at"] == "2026-09-18T17:00:00"
    assert body["priority"] == "high"
    assert body["category_name"] == "Coursework"
    assert body["category_id"] is not None


async def test_chat_sanitises_and_includes_attachment(client: AsyncClient, auth, monkeypatch):
    token, user_id, _ = auth
    note = await db.fetch_one(
        query="""INSERT INTO notes (user_id, title, content)
                 VALUES (:u, 'Bus notes', 'The interpeak ISB route map') RETURNING id""",
        values={"u": user_id},
    )
    note_id = note["id"]
    captured = {}

    async def fake_generate_json(system, prompt, schema=None, extra_parts=None):
        captured["prompt"] = prompt
        return {
            "reply": "Your bus notes cover the interpeak routes.",
            "resources": [
                {"type": "note", "id": note_id, "label": "Bus notes"},
                {"type": "note", "id": 999999, "label": "Rogue"},
            ],
            "actions": [{"kind": "create_task", "title": "Check interpeak timings", "due_at": ""}],
        }

    monkeypatch.setattr("ai.assistant.generate_json", fake_generate_json)
    resp = await client.post(
        "/assistant/chat",
        json={
            "messages": [{"role": "user", "content": "what do my bus notes say?"}],
            "attachment": {"type": "note", "id": note_id},
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"].startswith("Your bus notes")
    assert body["resources"] == [{"type": "note", "id": note_id, "label": "Bus notes"}]
    assert body["actions"][0]["title"] == "Check interpeak timings"
    assert "interpeak ISB route map" in captured["prompt"]
    assert "ATTACHED NOTE" in captured["prompt"]


async def test_brief_degrades_without_ai_and_caches(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    monkeypatch.delenv("MODEL_API_KEY", raising=False)

    resp1 = await client.get("/assistant/brief", headers=auth_headers(token))
    assert resp1.status_code == 200
    body1 = resp1.json()
    assert body1["ai_ok"] is False
    assert "classes" in body1 and "tasks" in body1

    resp2 = await client.get("/assistant/brief", headers=auth_headers(token))
    assert resp2.json() == body1  # served from cache

    resp3 = await client.get("/assistant/brief?refresh=true", headers=auth_headers(token))
    assert resp3.status_code == 200


# --- telegram digest --------------------------------------------------------


async def test_digest_tick_sends_once_per_day(client: AsyncClient, auth, monkeypatch):
    token, user_id, _ = auth
    # Apply the digest migration to the fresh test database (idempotent).
    await run_migrations()
    await db.execute(
        query="""
            INSERT INTO telegram_links (user_id, chat_id, digest_time, digest_enabled)
            VALUES (:u, 4242, '00:00', 1)
        """,
        values={"u": user_id},
    )

    sent = []

    async def fake_send(chat_id, text, retries=3):
        sent.append((chat_id, text))

    async def fake_brief(user_id):
        return "BRIEF TEXT"

    monkeypatch.setattr("ai.digest.send_message", fake_send)
    monkeypatch.setattr("ai.digest.build_brief_text", fake_brief)

    assert await run_digest_tick() >= 1
    assert (4242, "BRIEF TEXT") in sent

    row = await db.fetch_one(
        query="SELECT last_digest_date FROM telegram_links WHERE user_id = :u", values={"u": user_id}
    )
    assert str(row["last_digest_date"])[:10] == datetime.now().date().isoformat()

    # Already sent today: a second tick must not resend.
    sent.clear()
    await run_digest_tick()
    assert (4242, "BRIEF TEXT") not in sent
