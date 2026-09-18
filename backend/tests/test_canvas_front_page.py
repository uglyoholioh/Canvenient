"""
Tests for the /canvas/front-page endpoint (course home pages).

The endpoint serves the cached front page when fresh, reports a cached
absence (`missing: true`) for courses without one, and maps Canvas 404s
to that same absence shape.
"""

import pytest
from conftest import auth_headers
from fastapi import HTTPException
from httpx import AsyncClient
from test_canvas_cache import set_canvas_token

from routes import canvas as canvas_routes
from routes.canvas import get_canvas_cache, save_canvas_cache

pytestmark = pytest.mark.asyncio


async def test_front_page_cache_hit(client: AsyncClient, auth):
    token, user_id, _ = auth
    await set_canvas_token(user_id)
    cached = {
        "title": "Welcome to CS2103",
        "body": "<h2>Week 1</h2><p>Read the handbook.</p>",
        "updated_at": "2026-08-20T03:00:00Z",
    }
    await save_canvas_cache(user_id, "front_page_202", cached)

    resp = await client.get("/canvas/front-page?course_id=202", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == cached
    assert "missing" not in resp.json()


async def test_front_page_cached_absence(client: AsyncClient, auth):
    token, user_id, _ = auth
    await set_canvas_token(user_id)
    await save_canvas_cache(
        user_id,
        "front_page_303",
        {"title": None, "body": "", "updated_at": None, "missing": True},
    )

    resp = await client.get("/canvas/front-page?course_id=303", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == {"title": None, "body": "", "updated_at": None, "missing": True}


async def test_front_page_maps_missing_page_to_absence(client: AsyncClient, auth, monkeypatch):
    token, user_id, _ = auth
    await set_canvas_token(user_id)

    async def raise_404(course_id, current_user, path, params=None):
        raise HTTPException(status_code=404, detail="No front page found.")

    monkeypatch.setattr(canvas_routes, "canvas_course_get", raise_404)

    resp = await client.get("/canvas/front-page?course_id=404", headers=auth_headers(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["missing"] is True
    assert body["body"] == ""

    # The absence is cached so later visits don't re-probe Canvas.
    cached, _ = await get_canvas_cache(user_id, "front_page_404")
    assert cached["missing"] is True
