"""
Events endpoint CRUD tests — Create, List, Update, Delete.
"""

from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from conftest import auth_headers

pytestmark = pytest.mark.asyncio


def get_sample_event_payload():
    now = datetime.now(timezone.utc)
    return {
        "title": "Orbital Milestone 3 Showcase",
        "description": "Demonstrating web application to advisors",
        "venue": "COM3-0120",
        "start_at": (now + timedelta(days=1)).isoformat(),
        "end_at": (now + timedelta(days=1, hours=2)).isoformat(),
        "is_all_day": False,
        "event_type": "presentation",
    }


async def test_create_event_success(client: AsyncClient, auth):
    """Test creating a personal event returns 201 created."""
    token, _, _ = auth
    payload = get_sample_event_payload()
    resp = await client.post("/events", json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == payload["title"]
    assert data["venue"] == payload["venue"]


async def test_list_events(client: AsyncClient, auth):
    """Test listing events returns created events for user."""
    token, _, _ = auth
    payload = get_sample_event_payload()
    await client.post("/events", json=payload, headers=auth_headers(token))

    resp = await client.get("/events", headers=auth_headers(token))
    assert resp.status_code == 200
    events = resp.json()
    assert isinstance(events, list)
    assert len(events) >= 1
    assert events[0]["title"] == payload["title"]


async def test_update_event(client: AsyncClient, auth):
    """Test updating event title and venue."""
    token, _, _ = auth
    create_resp = await client.post("/events", json=get_sample_event_payload(), headers=auth_headers(token))
    event_id = create_resp.json()["id"]

    update_payload = {"title": "Updated Event Title", "venue": "SR1"}
    resp = await client.patch(f"/events/{event_id}", json=update_payload, headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Event Title"
    assert data["venue"] == "SR1"


async def test_delete_event(client: AsyncClient, auth):
    """Test deleting an event removes it from list."""
    token, _, _ = auth
    create_resp = await client.post("/events", json=get_sample_event_payload(), headers=auth_headers(token))
    event_id = create_resp.json()["id"]

    resp = await client.delete(f"/events/{event_id}", headers=auth_headers(token))
    assert resp.status_code == 204

    # Verify event is deleted
    list_resp = await client.get("/events", headers=auth_headers(token))
    event_ids = [e["id"] for e in list_resp.json()]
    assert event_id not in event_ids


async def test_unauthenticated_events_access(client: AsyncClient):
    """Test unauthenticated access returns 401."""
    resp = await client.get("/events")
    assert resp.status_code == 401
