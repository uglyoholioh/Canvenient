"""
Tests for the focus session system: /focus/* endpoints, user scoping,
client_id replay for offline queues, and the 0003 legacy-copy migration.
"""

import pytest
from conftest import TEST_PASSWORD, auth_headers
from httpx import AsyncClient

from database import db
from migrations import run_migrations

pytestmark = pytest.mark.asyncio


def payload(**overrides):
    base = {
        "started_at": "2026-09-16T02:00:00+00:00",
        "ended_at": "2026-09-16T02:25:00+00:00",
        "planned_minutes": 25,
        "actual_seconds": 1500,
        "source": "mac_tray",
        "client_id": "11111111-1111-1111-1111-111111111111",
    }
    base.update(overrides)
    return base


async def seed_study_session(user_id: int, *, status: str, ended: str):
    await db.fetch_one(
        query="""
            INSERT INTO study_sessions (
                user_id, title, planned_minutes, actual_seconds, status, started_at, ended_at
            ) VALUES (
                :user_id, 'Deep Focus', 25, 1500, :status, CURRENT_TIMESTAMP, :ended
            )
            RETURNING id
        """,
        values={"user_id": user_id, "status": status, "ended": ended},
    )


class TestCreateFocusSession:
    async def test_create_returns_201(self, client: AsyncClient, auth):
        token, _, _ = auth
        resp = await client.post("/focus/sessions", json=payload(), headers=auth_headers(token))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["source"] == "mac_tray"
        assert body["actual_seconds"] == 1500
        assert body["is_break"] is False

    async def test_replay_same_client_id_returns_existing(self, client: AsyncClient, auth):
        token, _, _ = auth
        first = await client.post("/focus/sessions", json=payload(), headers=auth_headers(token))
        assert first.status_code == 201
        second = await client.post("/focus/sessions", json=payload(), headers=auth_headers(token))
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]

    async def test_no_client_id_still_creates(self, client: AsyncClient, auth):
        token, _, _ = auth
        body = payload()
        del body["client_id"]
        resp = await client.post("/focus/sessions", json=body, headers=auth_headers(token))
        assert resp.status_code == 201

    async def test_rejects_bad_source_and_inverted_times(self, client: AsyncClient, auth):
        token, _, _ = auth
        bad_source = await client.post("/focus/sessions", json=payload(source="hacker"), headers=auth_headers(token))
        assert bad_source.status_code == 422
        inverted = await client.post(
            "/focus/sessions",
            json=payload(started_at="2026-09-16T03:00:00+00:00"),
            headers=auth_headers(token),
        )
        assert inverted.status_code == 422

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post("/focus/sessions", json=payload())
        assert resp.status_code in (401, 403)


class TestScoping:
    async def test_user_cannot_see_or_delete_other_sessions(self, client: AsyncClient, auth):
        token_a, _, _ = auth
        created = await client.post("/focus/sessions", json=payload(), headers=auth_headers(token_a))
        session_id = created.json()["id"]

        other_email = f"focus_other_{session_id}@u.nus.edu"
        token_b_resp = await client.post("/auth/register", json={"email": other_email, "password": TEST_PASSWORD})
        assert token_b_resp.status_code == 201
        token_b = token_b_resp.json()["access_token"]

        listing = await client.get("/focus/sessions", headers=auth_headers(token_b))
        assert listing.json() == []

        deleted = await client.delete(f"/focus/sessions/{session_id}", headers=auth_headers(token_b))
        assert deleted.status_code == 404


class TestSummary:
    async def test_summary_counts_non_break_sessions(self, client: AsyncClient, auth):
        token, _, _ = auth
        await client.post("/focus/sessions", json=payload(), headers=auth_headers(token))
        # A break must not count toward totals.
        await client.post(
            "/focus/sessions",
            json=payload(client_id="break-1", source="break", is_break=True, actual_seconds=300),
            headers=auth_headers(token),
        )
        today = await client.get("/focus/summary?range=today", headers=auth_headers(token))
        assert today.status_code == 200
        body = today.json()
        assert body["total_seconds"] == 1500
        assert body["sessions"] == 1
        week = await client.get("/focus/summary?range=week", headers=auth_headers(token))
        assert week.json()["total_seconds"] == 1500

    async def test_summary_rejects_bad_range(self, client: AsyncClient, auth):
        token, _, _ = auth
        resp = await client.get("/focus/summary?range=month", headers=auth_headers(token))
        assert resp.status_code == 422


class TestDelete:
    async def test_delete_own_session(self, client: AsyncClient, auth):
        token, _, _ = auth
        created = await client.post("/focus/sessions", json=payload(), headers=auth_headers(token))
        session_id = created.json()["id"]
        deleted = await client.delete(f"/focus/sessions/{session_id}", headers=auth_headers(token))
        assert deleted.status_code == 200
        listing = await client.get("/focus/sessions", headers=auth_headers(token))
        assert listing.json() == []


class TestLegacyCopyMigration:
    async def test_completed_sessions_are_copied_once(self, client: AsyncClient, auth):
        token, user_id, _ = auth
        await seed_study_session(user_id, status="completed", ended="2026-09-15 10:00:00")
        await seed_study_session(user_id, status="cancelled", ended="2026-09-15 11:00:00")

        # Other test files may have already applied the whole MIGRATIONS list;
        # reset just this entry's marker so the copy runs now, against rows
        # seeded after that earlier run. Mirrors a real upgrade, where the
        # migration sees sessions that already exist.
        await db.execute(query="DELETE FROM _migrations WHERE name = '0003_focus_sessions_legacy_copy'")
        applied = await run_migrations()
        assert "0003_focus_sessions_legacy_copy" in applied

        rows = await db.fetch_all(
            query="SELECT * FROM focus_sessions WHERE user_id = :user_id AND source = 'legacy'",
            values={"user_id": user_id},
        )
        assert len(rows) == 1  # only the completed one
        assert rows[0]["actual_seconds"] == 1500
        assert rows[0]["client_id"].startswith("legacy-")

        # Re-running copies nothing new (marker + NOT EXISTS guard).
        applied_again = await run_migrations()
        assert applied_again == []
        rows_again = await db.fetch_all(
            query="SELECT * FROM focus_sessions WHERE user_id = :user_id AND source = 'legacy'",
            values={"user_id": user_id},
        )
        assert len(rows_again) == 1
