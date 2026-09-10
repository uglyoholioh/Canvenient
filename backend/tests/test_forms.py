"""
Forms endpoint tests — creation scoping (group/community), responses,
duplicate rejection, and admin-only response visibility.
"""

import pytest
from httpx import AsyncClient

from conftest import auth_headers, unique_email, TEST_PASSWORD

pytestmark = pytest.mark.asyncio


async def register_user(client: AsyncClient):
    email = unique_email()
    resp = await client.post("/auth/register", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 201
    return resp.json()["access_token"]


async def build_group_with_member(client: AsyncClient, auth):
    """Owner creates a community + group; a member joins via invite code."""
    owner_token, _, _ = auth
    owner_headers = auth_headers(owner_token)

    comm = await client.post(
        "/communities", json={"name": "Form Test Community"}, headers=owner_headers
    )
    assert comm.status_code == 201
    comm_id = comm.json()["id"]

    group = await client.post(
        "/groups", json={"c_id": comm_id, "name": "Form Test Group"}, headers=owner_headers
    )
    assert group.status_code == 201
    group_id = group.json()["id"]

    invite = await client.post("/invites", json={"g_id": group_id}, headers=owner_headers)
    assert invite.status_code == 201
    invite_code = invite.json()["code"]

    member_token = await register_user(client)
    join = await client.post(f"/invites/join/{invite_code}", headers=auth_headers(member_token))
    assert join.status_code == 200

    return owner_headers, member_token, group_id


async def test_form_requires_group_or_community(client: AsyncClient, auth):
    token, _, _ = auth
    resp = await client.post(
        "/forms",
        json={"title": "Orphan Form", "fields": []},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


async def test_group_form_lifecycle(client: AsyncClient, auth):
    owner_headers, member_token, group_id = await build_group_with_member(client, auth)

    # Only group admins can create group forms; the member cannot.
    member_create = await client.post(
        "/forms",
        json={"title": "Member Poll", "g_id": group_id, "fields": [{"type": "text", "label": "Q1"}]},
        headers=auth_headers(member_token),
    )
    assert member_create.status_code == 403

    created = await client.post(
        "/forms",
        json={
            "title": "Project Poll",
            "description": "Pick a meeting time",
            "g_id": group_id,
            "fields": [{"type": "text", "label": "Preferred slot"}],
        },
        headers=owner_headers,
    )
    assert created.status_code == 201, created.text
    form = created.json()
    assert form["g_id"] == group_id
    assert form["fields"] == [{"type": "text", "label": "Preferred slot"}]

    # The creator sees the form; so does the member (group visibility).
    owner_list = await client.get("/forms", headers=owner_headers)
    assert any(f["id"] == form["id"] for f in owner_list.json())
    member_list = await client.get("/forms", headers=auth_headers(member_token))
    assert any(f["id"] == form["id"] for f in member_list.json())

    # Member responds; a duplicate submission is rejected.
    answer = await client.post(
        f"/forms/{form['id']}/responses",
        json={"response_data": {"Preferred slot": "Tuesday 2pm"}},
        headers=auth_headers(member_token),
    )
    assert answer.status_code == 201, answer.text
    duplicate = await client.post(
        f"/forms/{form['id']}/responses",
        json={"response_data": {"Preferred slot": "Wednesday 10am"}},
        headers=auth_headers(member_token),
    )
    assert duplicate.status_code == 409

    # Responses and stats are admin-only.
    member_responses = await client.get(f"/forms/{form['id']}/responses", headers=auth_headers(member_token))
    assert member_responses.status_code == 403
    member_stats = await client.get(f"/forms/{form['id']}/stats", headers=auth_headers(member_token))
    assert member_stats.status_code == 403

    owner_responses = await client.get(f"/forms/{form['id']}/responses", headers=owner_headers)
    assert owner_responses.status_code == 200
    assert len(owner_responses.json()) == 1

    owner_stats = await client.get(f"/forms/{form['id']}/stats", headers=owner_headers)
    assert owner_stats.status_code == 200
    stats = owner_stats.json()
    assert stats["responses_count"] == 1
    assert stats["total_members"] >= 1
    assert 0 < stats["response_rate"] <= 1

    # The member's own response is echoed back on their form view.
    member_view = await client.get("/forms", headers=auth_headers(member_token))
    mine = next(f for f in member_view.json() if f["id"] == form["id"])
    assert mine["user_response"] == {"Preferred slot": "Tuesday 2pm"}


async def test_community_form_created_by_creator_only(client: AsyncClient, auth):
    token, _, _ = auth
    owner_headers = auth_headers(token)
    comm = await client.post("/communities", json={"name": "Comm Form"}, headers=owner_headers)
    comm_id = comm.json()["id"]

    outsider_token = await register_user(client)
    outsider_create = await client.post(
        "/forms",
        json={"title": "Nope", "c_id": comm_id, "fields": []},
        headers=auth_headers(outsider_token),
    )
    assert outsider_create.status_code == 403

    created = await client.post(
        "/forms",
        json={"title": "Community Survey", "c_id": comm_id, "fields": []},
        headers=owner_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["c_id"] == comm_id
