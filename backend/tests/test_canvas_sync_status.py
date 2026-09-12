"""
Tests for Canvas sync status surfacing — the migration adds error tracking
columns and /canvas/cached-files reports the last sync error to the client.
"""

import pytest
from conftest import auth_headers
from httpx import AsyncClient

from database import db
from migrations import run_migrations
from routes.canvas import record_canvas_sync_error

pytestmark = pytest.mark.asyncio


async def test_shipped_migrations_add_sync_error_columns():
    """The real MIGRATIONS list applies cleanly to a fresh test database."""
    await run_migrations()  # apply if still pending (order-independent)

    columns = {row["name"] for row in await db.fetch_all("SELECT name FROM pragma_table_info('canvas_sync_state')")}
    assert "last_sync_error" in columns
    assert "last_sync_error_at" in columns

    # Idempotent: second startup run applies nothing.
    assert await run_migrations() == []


async def test_sync_error_surfaces_in_cached_files(client: AsyncClient, auth):
    token, user_id, _ = auth
    headers = auth_headers(token)

    await record_canvas_sync_error(user_id, "3 of 8 courses failed to sync")

    resp = await client.get("/canvas/cached-files", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["last_sync_error"] == "3 of 8 courses failed to sync"
    assert body["last_sync_error_at"] is not None
    assert "synced_at" in body
