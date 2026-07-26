"""
INVITES test cases — maps to TEST-CASES.md section 8 (INV-01 … INV-05).
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers, unique_email, TEST_PASSWORD

pytestmark = pytest.mark.asyncio


async def _setup_group(client: AsyncClient, token: str) -> int:
    """Create a community + group and return g_id."""
    com = await client.post("/communities", json={"name": "Test Community"}, headers=auth_headers(token))
    assert com.status_code == 201, com.text
    c_id = com.json()["id"]
    grp = await client.post("/groups", json={"name": "Test Group", "c_id": c_id}, headers=auth_headers(token))
    assert grp.status_code == 201, grp.text
    return grp.json()["id"]


async def test_INV_01_create_invite_as_admin(client: AsyncClient, auth):
    token, _, _ = auth
    g_id = await _setup_group(client, token)
    resp = await client.post("/invites", json={"g_id": g_id}, headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    code = resp.json()["code"]
    assert len(code) >= 8


async def test_INV_02_create_invite_as_non_admin(client: AsyncClient, auth):
    token_admin, _, _ = auth
    g_id = await _setup_group(client, token_admin)

    # Register a second user (non-admin)
    reg = await client.post("/auth/register", json={"email": unique_email(), "password": TEST_PASSWORD})
    token_b = reg.json()["access_token"]

    resp = await client.post("/invites", json={"g_id": g_id}, headers=auth_headers(token_b))
    assert resp.status_code == 403


async def test_INV_03_join_via_valid_code(client: AsyncClient, auth):
    token_admin, _, _ = auth
    g_id = await _setup_group(client, token_admin)

    # Create invite
    inv = await client.post("/invites", json={"g_id": g_id}, headers=auth_headers(token_admin))
    code = inv.json()["code"]

    # Second user joins
    reg = await client.post("/auth/register", json={"email": unique_email(), "password": TEST_PASSWORD})
    token_b = reg.json()["access_token"]

    resp = await client.post(f"/invites/join/{code}", headers=auth_headers(token_b))
    assert resp.status_code == 200
    assert resp.json()["g_id"] == g_id


async def test_INV_04_join_invalid_code(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.post("/invites/join/zzzzzzzz", headers=auth_headers(token))
    assert resp.status_code == 404


async def test_INV_05_join_twice_no_duplicate(client: AsyncClient, auth):
    token_admin, _, _ = auth
    g_id = await _setup_group(client, token_admin)

    inv = await client.post("/invites", json={"g_id": g_id}, headers=auth_headers(token_admin))
    code = inv.json()["code"]

    reg = await client.post("/auth/register", json={"email": unique_email(), "password": TEST_PASSWORD})
    token_b = reg.json()["access_token"]

    # Join once
    resp1 = await client.post(f"/invites/join/{code}", headers=auth_headers(token_b))
    assert resp1.status_code == 200

    # Join again — should succeed without error or duplicate membership
    resp2 = await client.post(f"/invites/join/{code}", headers=auth_headers(token_b))
    assert resp2.status_code == 200
