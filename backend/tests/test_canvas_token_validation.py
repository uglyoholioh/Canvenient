from unittest.mock import AsyncMock, patch

import pytest
from conftest import auth_headers
from httpx import AsyncClient, Response

pytestmark = pytest.mark.asyncio


async def test_validate_canvas_token_empty(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)

    resp = await client.post("/canvas/validate-token", json={"token": ""}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert "cannot be empty" in data["error"]


async def test_validate_canvas_token_valid(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)

    mock_resp = Response(200, json={"id": 9999, "name": "Student Test", "short_name": "Student"})

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        resp = await client.post("/canvas/validate-token", json={"token": "valid-token-123"}, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["name"] == "Student Test"
        assert data["id"] == 9999


async def test_validate_canvas_token_invalid_401(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)

    mock_resp = Response(401, json={"errors": [{"message": "Invalid access token."}]})

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        resp = await client.post("/canvas/validate-token", json={"token": "invalid-bad-token"}, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert "Invalid or expired" in data["error"]
