"""
Notes and Folders endpoint tests — CRUD, ownership scoping, and cross-user isolation.
"""

import pytest
from httpx import AsyncClient

from conftest import auth_headers, unique_email, TEST_PASSWORD

pytestmark = pytest.mark.asyncio


async def test_folder_crud_flow(client: AsyncClient, auth):
    token, user_id, _ = auth
    headers = auth_headers(token)

    create = await client.post("/folders", json={"name": "Lecture Notes"}, headers=headers)
    assert create.status_code == 200, create.text
    folder = create.json()
    assert folder["name"] == "Lecture Notes"
    assert folder["user_id"] == user_id

    listed = await client.get("/folders", headers=headers)
    assert listed.status_code == 200
    assert any(f["id"] == folder["id"] for f in listed.json())

    renamed = await client.patch(f"/folders/{folder['id']}", json={"name": "Course Notes"}, headers=headers)
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Course Notes"

    empty_update = await client.patch(f"/folders/{folder['id']}", json={}, headers=headers)
    assert empty_update.status_code == 400

    deleted = await client.delete(f"/folders/{folder['id']}", headers=headers)
    assert deleted.status_code == 200
    after = await client.get("/folders", headers=headers)
    assert all(f["id"] != folder["id"] for f in after.json())


async def test_note_crud_flow(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)

    folder = (await client.post("/folders", json={"name": "Scratch"}, headers=headers)).json()

    create = await client.post(
        "/notes",
        json={"title": "Week 1 Summary", "content": "Central limit theorem", "folder_id": folder["id"]},
        headers=headers,
    )
    assert create.status_code == 200, create.text
    note = create.json()
    assert note["title"] == "Week 1 Summary"
    assert note["folder_id"] == folder["id"]

    listed = await client.get("/notes", headers=headers)
    assert listed.status_code == 200
    assert any(n["id"] == note["id"] for n in listed.json())

    updated = await client.patch(
        f"/notes/{note['id']}",
        json={"title": "Week 1 Summary (edited)", "is_pinned": True},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Week 1 Summary (edited)"
    assert bool(updated.json()["is_pinned"]) is True

    deleted = await client.delete(f"/notes/{note['id']}", headers=headers)
    assert deleted.status_code == 200
    missing = await client.patch(f"/notes/{note['id']}", json={"title": "x"}, headers=headers)
    assert missing.status_code == 404


async def test_note_ownership_is_isolated(client: AsyncClient, auth):
    """Another user can neither see, update, nor delete someone else's note."""
    token, _, _ = auth
    headers = auth_headers(token)

    note = (
        await client.post("/notes", json={"title": "Private", "content": "secret"}, headers=headers)
    ).json()

    other_email = unique_email()
    reg = await client.post("/auth/register", json={"email": other_email, "password": TEST_PASSWORD})
    other_token = reg.json()["access_token"]
    other_headers = auth_headers(other_token)

    other_list = await client.get("/notes", headers=other_headers)
    assert all(n["id"] != note["id"] for n in other_list.json())

    other_patch = await client.patch(f"/notes/{note['id']}", json={"title": "hijacked"}, headers=other_headers)
    assert other_patch.status_code == 404

    other_delete = await client.delete(f"/notes/{note['id']}", headers=other_headers)
    assert other_delete.status_code == 404
