"""
CATEGORIES test cases — maps to TEST-CASES.md section 2 (CAT-01 … CAT-11).
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers

pytestmark = pytest.mark.asyncio

CAT_NAME = "Test Category Urgent"


async def test_CAT_01_list_categories(client: AsyncClient, auth):
    token, _, _ = auth
    # Given: freshly registered user, no categories yet
    resp = await client.get("/categories", headers=auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_CAT_02_create_category(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.post("/categories", json={"name": CAT_NAME}, headers=auth_headers(token))
    assert resp.status_code == 201
    assert resp.json()["name"] == CAT_NAME


async def test_CAT_03_duplicate_name(client: AsyncClient, auth):
    token, _, _ = auth
    await client.post("/categories", json={"name": CAT_NAME}, headers=auth_headers(token))
    resp = await client.post("/categories", json={"name": CAT_NAME}, headers=auth_headers(token))
    assert resp.status_code == 409


async def test_CAT_04_whitespace_only_name(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.post("/categories", json={"name": "   "}, headers=auth_headers(token))
    assert resp.status_code == 422


async def test_CAT_05_name_too_long(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.post("/categories", json={"name": "A" * 81}, headers=auth_headers(token))
    assert resp.status_code == 422


async def test_CAT_06_update_color_only(client: AsyncClient, auth):
    token, _, _ = auth
    # Given: category exists
    create = await client.post("/categories", json={"name": CAT_NAME}, headers=auth_headers(token))
    cat_id = create.json()["id"]
    # When: patch only color
    resp = await client.patch(f"/categories/{cat_id}", json={"color": "#ff0000"}, headers=auth_headers(token))
    assert resp.status_code == 200
    # Then: name preserved
    assert resp.json()["name"] == CAT_NAME


async def test_CAT_08_update_nonexistent(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.patch("/categories/999999", json={"name": "x"}, headers=auth_headers(token))
    assert resp.status_code == 404


async def test_CAT_09_delete_category(client: AsyncClient, auth):
    token, _, _ = auth
    create = await client.post("/categories", json={"name": CAT_NAME + "_del"}, headers=auth_headers(token))
    cat_id = create.json()["id"]
    resp = await client.delete(f"/categories/{cat_id}", headers=auth_headers(token))
    assert resp.status_code == 204


async def test_CAT_10_delete_nonexistent(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.delete("/categories/999999", headers=auth_headers(token))
    assert resp.status_code == 404


async def test_CAT_11_cross_user_isolation(client: AsyncClient, auth):
    """User A cannot modify User B's category."""
    token_a, _, _ = auth

    # Create a second user (User B)
    from conftest import unique_email, TEST_PASSWORD
    email_b = unique_email()
    reg_b = await client.post("/auth/register", json={"email": email_b, "password": TEST_PASSWORD})
    token_b = reg_b.json()["access_token"]
    user_b_id = reg_b.json()["user"]["id"]

    # User B creates a category
    create = await client.post("/categories", json={"name": "B's category"}, headers=auth_headers(token_b))
    cat_id = create.json()["id"]

    # User A tries to patch it
    resp = await client.patch(f"/categories/{cat_id}", json={"name": "hacked"}, headers=auth_headers(token_a))
    assert resp.status_code == 404

    # Cleanup User B
    from database import db
    await db.execute("DELETE FROM users WHERE id = :id", values={"id": user_b_id})
