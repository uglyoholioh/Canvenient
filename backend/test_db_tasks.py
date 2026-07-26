"""
Audit & refactored test_db_tasks.py:
Converted from ad-hoc script into a proper pytest test module.
Uses pytest.mark.asyncio, test fixtures, assertions, and runs cleanly in CI.
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers

pytestmark = pytest.mark.asyncio


async def test_db_tasks_query(client: AsyncClient, auth):
    """Verify tasks table exists and can be queried for authenticated user."""
    token, _, _ = auth
    resp = await client.get("/tasks", headers=auth_headers(token))
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)
