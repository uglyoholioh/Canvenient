"""
Communities endpoint tests — creation, creator-only update/delete, and access control.
"""

import pytest
from httpx import AsyncClient

from conftest import auth_headers, unique_email, TEST_PASSWORD

pytestmark = pytest.mark.asyncio


async def create_user(client: AsyncClient):
    email = unique_email()
    resp = await client.post("/auth/register", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 201
    return auth_headers(resp.json()["access_token"])


async def test_create_and_list_communities(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    create = await client.post(
        "/communities",
        json={"name": "Orbital Group", "description": "Project space"},
        headers=headers,
    )
    assert create.status_code == 201, create.text
    community = create.json()
    assert community["name"] == "Orbital Group"

    listed = await client.get("/communities", headers=headers)
    assert listed.status_code == 200
    assert any(c["id"] == community["id"] for c in listed.json())


async def test_only_creator_can_update_or_delete(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    community = (
        await client.post("/communities", json={"name": "Study Circle"}, headers=headers)
    ).json()

    other_headers = await create_user(client)

    renamed = await client.patch(
        f"/communities/{community['id']}", json={"name": "Renamed"}, headers=headers
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    forbidden_update = await client.patch(
        f"/communities/{community['id']}", json={"name": "Hijacked"}, headers=other_headers
    )
    assert forbidden_update.status_code == 403

    forbidden_delete = await client.delete(f"/communities/{community['id']}", headers=other_headers)
    assert forbidden_delete.status_code == 403

    deleted = await client.delete(f"/communities/{community['id']}", headers=headers)
    assert deleted.status_code == 204

    gone = await client.patch(f"/communities/{community['id']}", json={"name": "x"}, headers=headers)
    assert gone.status_code == 404


async def test_empty_name_rejected(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    community = (
        await client.post("/communities", json={"name": "Keep"}, headers=headers)
    ).json()
    resp = await client.patch(f"/communities/{community['id']}", json={"name": "   "}, headers=headers)
    assert resp.status_code == 400
