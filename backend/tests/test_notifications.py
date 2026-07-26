"""
NOTIFICATIONS test cases — maps to TEST-CASES.md section 10 (NOT-01 … NOT-04).
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers
from database import db

pytestmark = pytest.mark.asyncio


async def _create_notification(user_id: int, message: str = "Test notification") -> int:
    """Helper: insert a notification directly into DB."""
    row = await db.fetch_one(
        """
        INSERT INTO notifications (user_id, title, description, is_read)
        VALUES (:uid, :title, :desc, false)
        RETURNING id
        """,
        values={"uid": user_id, "title": message, "desc": message},
    )
    if not row:
        row = await db.fetch_one("SELECT MAX(id) AS id FROM notifications WHERE user_id = :uid", values={"uid": user_id})
    return row["id"]


async def test_NOT_01_list_notifications(client: AsyncClient, auth):
    token, user_id, _ = auth
    await _create_notification(user_id)
    resp = await client.get("/notifications", headers=auth_headers(token))
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list)
    assert len(items) >= 1


async def test_NOT_02_mark_one_read(client: AsyncClient, auth):
    token, user_id, _ = auth
    notif_id = await _create_notification(user_id)
    resp = await client.patch(f"/notifications/{notif_id}/read", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["is_read"] is True


async def test_NOT_03_mark_nonexistent_read(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.patch("/notifications/999999/read", headers=auth_headers(token))
    assert resp.status_code == 404


async def test_NOT_04_mark_all_read(client: AsyncClient, auth):
    token, user_id, _ = auth
    await _create_notification(user_id, "Notif A")
    await _create_notification(user_id, "Notif B")
    resp = await client.post("/notifications/read-all", headers=auth_headers(token))
    assert resp.status_code == 204
    # Verify all are read
    list_resp = await client.get("/notifications", headers=auth_headers(token))
    for notif in list_resp.json():
        assert notif["is_read"] is True
