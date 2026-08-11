"""
Tests for Canvas API response caching in backend/routes/canvas.py.
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers
from database import db
from routes.canvas import save_canvas_cache, get_canvas_cache

pytestmark = pytest.mark.asyncio


async def set_canvas_token(user_id: int, token_str: str = "mock_canvas_token"):
    is_sqlite = "sqlite" in str(db.url).lower()
    if is_sqlite:
        await db.execute(
            "INSERT INTO user_settings (user_id, canvas_token) VALUES (:user_id, :token) "
            "ON CONFLICT(user_id) DO UPDATE SET canvas_token = :token",
            values={"user_id": user_id, "token": token_str},
        )
    else:
        await db.execute(
            "INSERT INTO user_settings (user_id, canvas_token) VALUES (:user_id, :token) "
            "ON CONFLICT(user_id) DO UPDATE SET canvas_token = EXCLUDED.canvas_token",
            values={"user_id": user_id, "token": token_str},
        )


async def test_save_and_get_canvas_cache(auth):
    _, user_id, _ = auth
    test_courses = [{"id": 101, "course_code": "CS2103", "name": "Software Engineering"}]

    await save_canvas_cache(user_id, "courses", test_courses)

    cached, synced_at = await get_canvas_cache(user_id, "courses")
    assert cached == test_courses
    assert synced_at is not None


async def test_canvas_courses_cache_hit(client: AsyncClient, auth):
    token, user_id, _ = auth
    await set_canvas_token(user_id)
    cached_courses = [{"id": 202, "course_code": "CS3230", "name": "Algorithms", "external_url": "https://canvas.nus.edu.sg/courses/202"}]

    await save_canvas_cache(user_id, "courses", cached_courses)

    # Without force_refresh, it should return cached courses without attempting HTTP call
    resp = await client.get("/canvas/courses", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == cached_courses


async def test_canvas_announcements_cache_hit(client: AsyncClient, auth):
    token, user_id, _ = auth
    await set_canvas_token(user_id)
    cached_ann = [{"id": 55, "course_id": 202, "course_code": "CS3230", "title": "Midterm Update", "body": "Room change", "posted_at": "2026-08-01T10:00:00Z", "author": "Prof", "is_priority": True, "external_url": "url"}]

    await save_canvas_cache(user_id, "announcements", cached_ann)

    resp = await client.get("/canvas/announcements", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == cached_ann


async def test_canvas_assignments_cache_hit(client: AsyncClient, auth):
    token, user_id, _ = auth
    await set_canvas_token(user_id)
    cached_asgn = [{"id": 77, "course_id": 202, "course_code": "CS3230", "course_name": "Algorithms", "title": "Assignment 1", "due_at": "2026-09-01T23:59:00Z", "is_priority": False, "external_url": "url", "description": "", "has_submitted": False}]

    await save_canvas_cache(user_id, "assignments", cached_asgn)

    resp = await client.get("/canvas/assignments", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == cached_asgn
