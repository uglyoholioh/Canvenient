"""
Auth endpoint tests — Registration, Login, Token validation, Current user profile.
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers, unique_email, TEST_PASSWORD

pytestmark = pytest.mark.asyncio


async def test_register_new_user_success(client: AsyncClient):
    """Test successful user registration returns 201 and access_token."""
    email = unique_email()
    resp = await client.post("/auth/register", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == email


async def test_register_duplicate_email_fails(client: AsyncClient, auth):
    """Test registering with an existing email returns 409 conflict."""
    _, _, email = auth
    resp = await client.post("/auth/register", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 409


async def test_register_invalid_email_fails(client: AsyncClient):
    """Test registering with invalid email format returns 422 validation error."""
    resp = await client.post("/auth/register", json={"email": "invalid-email", "password": TEST_PASSWORD})
    assert resp.status_code == 422


async def test_login_success(client: AsyncClient, auth):
    """Test logging in with valid credentials returns 200 and access_token."""
    _, _, email = auth
    resp = await client.post("/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data


async def test_login_invalid_password_fails(client: AsyncClient, auth):
    """Test logging in with wrong password returns 401 unauthorized."""
    _, _, email = auth
    resp = await client.post("/auth/login", json={"email": email, "password": "WrongPassword123!"})
    assert resp.status_code == 401


async def test_get_current_user_profile(client: AsyncClient, auth):
    """Test authenticated request to /auth/me returns current user summary."""
    token, _, email = auth
    resp = await client.get("/auth/me", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == email


async def test_unauthenticated_request_fails(client: AsyncClient):
    """Test calling protected endpoint without token returns 401."""
    resp = await client.get("/auth/me")
    assert resp.status_code == 401
