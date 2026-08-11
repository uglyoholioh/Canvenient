"""
Tests for AI Brief response caching in backend/routes/ai.py.
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers
from routes.ai import save_ai_brief_cache, get_ai_brief_cache

pytestmark = pytest.mark.asyncio


async def test_save_and_get_ai_brief_cache(auth):
    _, user_id, _ = auth
    brief_data = {
        "summary": "You have a light week ahead with one assignment due.",
        "suggestions": [{"type": "task", "title": "Revise CS2103", "description": "Preparation", "priority": "high"}]
    }
    context_snap = {"tasks": [], "schedule": [], "announcements": [], "current_date": "2026-08-11"}

    await save_ai_brief_cache(user_id, brief_data, context_snap)

    cached_b, cached_c, synced_at = await get_ai_brief_cache(user_id)
    assert cached_b == brief_data
    assert cached_c == context_snap
    assert synced_at is not None


async def test_ai_brief_cache_hit(client: AsyncClient, auth):
    token, user_id, _ = auth
    brief_data = {
        "summary": "Cached brief test summary.",
        "suggestions": []
    }
    context_snap = {"tasks": [], "schedule": [], "announcements": [], "current_date": "2026-08-11"}

    await save_ai_brief_cache(user_id, brief_data, context_snap)

    # Without force_refresh=true, /ai/brief returns cached brief immediately without needing MODEL_API_KEY
    resp = await client.post("/ai/brief", headers=auth_headers(token))
    assert resp.status_code == 200
    res_json = resp.json()
    assert res_json["brief"] == brief_data
    assert res_json["context_snapshot"] == context_snap
