"""
Tests for the Canvas calendar-events route — date-only items (quizzes,
midterms, review sessions) that the assignments sync misses.
"""

from unittest.mock import patch

import httpx
import pytest
from conftest import auth_headers
from httpx import AsyncClient
from test_canvas_cache import set_canvas_token

from routes.canvas import save_canvas_cache

pytestmark = pytest.mark.asyncio

COURSES = [
    {"id": 202, "course_code": "CS3230", "name": "Algorithms"},
    {"id": 303, "course_code": "ST2334", "name": "Probability"},
]

CANVAS_EVENTS = [
    {
        "id": 9001,
        "title": "Quiz 2",
        "start_at": "2026-09-20T09:00:00Z",
        "end_at": "2026-09-20T10:00:00Z",
        "all_day": False,
        "workflow_state": "active",
        "context_code": "course_202",
        "location_name": "LT19",
        "description": "<p>Covers weeks 1-5</p>",
    },
    {
        "id": 9002,
        "title": "Midterm",
        "start_at": "2026-10-01T17:00:00Z",
        "end_at": "2026-10-01T18:30:00Z",
        "all_day": False,
        "workflow_state": "active",
        "context_code": "course_303",
        "location_name": None,
    },
    {
        # Assignment-linked — the assignments sync already covers it.
        "id": 9003,
        "title": "Assignment 2",
        "start_at": "2026-09-25T23:59:00Z",
        "end_at": "2026-09-25T23:59:00Z",
        "assignment": {"id": 42, "due_at": "2026-09-25T23:59:00Z"},
        "workflow_state": "active",
        "context_code": "course_202",
    },
    {
        # Deleted on Canvas — must be filtered.
        "id": 9004,
        "title": "Cancelled review",
        "start_at": "2026-09-22T09:00:00Z",
        "end_at": "2026-09-22T10:00:00Z",
        "workflow_state": "deleted",
        "context_code": "course_202",
    },
]


def _response(events):
    response = httpx.Response(200, json=events)
    response._request = httpx.Request("GET", "https://canvas.nus.edu.sg/api/v1/calendar_events")
    return response


class FakeCanvasClient:
    """Replaces httpx.AsyncClient inside routes.canvas only."""

    def __init__(self, handler):
        self.handler = handler

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, **kwargs):
        return self.handler(str(url), kwargs)


def _patch_canvas(handler):
    return patch(
        "routes.canvas.httpx.AsyncClient",
        lambda **kwargs: FakeCanvasClient(handler),
    )


async def fetch_with_fake(handler, courses=COURSES):
    async with FakeCanvasClient(handler) as client:
        from routes.canvas import fetch_canvas_calendar_events

        return await fetch_canvas_calendar_events(client, {"Authorization": "Bearer x"}, courses)


class TestFetchCanvasCalendarEvents:
    async def test_normalizes_and_filters(self):
        result = await fetch_with_fake(lambda url, kwargs: _response(CANVAS_EVENTS))

        assert [item["id"] for item in result] == [9001, 9002]
        quiz = result[0]
        assert quiz["course_code"] == "CS3230"
        assert quiz["title"] == "Quiz 2"
        assert quiz["location"] == "LT19"
        assert quiz["all_day"] is False
        assert quiz["external_url"].endswith("/courses/202/calendar_events/9001")
        midterm = result[1]
        assert midterm["course_code"] == "ST2334"
        assert midterm["location"] == ""
        assert midterm["external_url"].endswith("/courses/303/calendar_events/9002")
        starts = [item["start_at"] for item in result]
        assert starts == sorted(starts)

    async def test_empty_is_a_real_result(self):
        result = await fetch_with_fake(lambda url, kwargs: _response([]))
        assert result == []

    async def test_unknown_context_code_is_tolerated(self):
        events = [
            {
                "id": 9100,
                "title": "Orphan event",
                "start_at": "2026-09-21T09:00:00Z",
                "end_at": "2026-09-21T10:00:00Z",
                "workflow_state": "active",
                "context_code": "course_99999",
            }
        ]
        result = await fetch_with_fake(lambda url, kwargs: _response(events))
        assert len(result) == 1
        assert result[0]["course_code"] is None
        assert result[0]["external_url"] is None


class TestCalendarEventsRoute:
    async def test_requires_canvas_token(self, client: AsyncClient, auth):
        token, _, _ = auth
        resp = await client.get("/canvas/calendar-events", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_cache_hit_skips_http(self, client: AsyncClient, auth):
        token, user_id, _ = auth
        await set_canvas_token(user_id)
        cached = [
            {
                "id": 8001,
                "course_id": 202,
                "course_code": "CS3230",
                "course_name": "Algorithms",
                "title": "Quiz 1",
                "start_at": "2026-09-10T09:00:00Z",
                "end_at": "2026-09-10T10:00:00Z",
                "all_day": False,
                "location": "LT19",
                "external_url": "url",
                "description": "",
            }
        ]
        await save_canvas_cache(user_id, "calendar_events", cached)

        resp = await client.get("/canvas/calendar-events", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json() == cached

    async def test_fresh_fetch_saves_and_dedupes(self, client: AsyncClient, auth):
        token, user_id, _ = auth
        await set_canvas_token(user_id)

        async def fake_courses(user, force_refresh=False):
            return COURSES

        with _patch_canvas(lambda url, kwargs: _response(CANVAS_EVENTS)):
            with patch("routes.canvas.list_canvas_courses", side_effect=fake_courses):
                resp = await client.get("/canvas/calendar-events", headers=auth_headers(token))

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert [item["id"] for item in body] == [9001, 9002]
        # The result is cached for the next call.
        again = await client.get("/canvas/calendar-events", headers=auth_headers(token))
        assert again.json() == body

    async def test_canvas_error_falls_back_to_stale(self, client: AsyncClient, auth):
        token, user_id, _ = auth
        await set_canvas_token(user_id)
        stale = [{"id": 7001, "title": "Old quiz"}]
        await save_canvas_cache(user_id, "calendar_events", stale)

        def failing_handler(url, kwargs):
            return httpx.Response(500, request=httpx.Request("GET", url))

        async def fake_courses(user, force_refresh=False):
            return COURSES

        with _patch_canvas(failing_handler):
            with patch("routes.canvas.list_canvas_courses", side_effect=fake_courses):
                resp = await client.get("/canvas/calendar-events", headers=auth_headers(token))

        assert resp.status_code == 200
        assert resp.json() == stale
