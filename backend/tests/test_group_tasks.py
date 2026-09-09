"""
Group Tasks tests — Create group task, assign member, list group tasks,
personal task list merging, and authorization checks.
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers, unique_email, TEST_PASSWORD

pytestmark = pytest.mark.asyncio


async def test_group_tasks_flow(client: AsyncClient, auth):
    owner_token, owner_id, owner_email = auth

    # 1. Register a second user (member)
    member_email = unique_email()
    reg_resp = await client.post(
        "/auth/register",
        json={"email": member_email, "password": TEST_PASSWORD},
    )
    assert reg_resp.status_code == 201
    member_token = reg_resp.json()["access_token"]
    member_id = reg_resp.json()["user"]["id"]

    # 2. Register a third user (outsider / non-member)
    outsider_email = unique_email()
    out_resp = await client.post(
        "/auth/register",
        json={"email": outsider_email, "password": TEST_PASSWORD},
    )
    assert out_resp.status_code == 201
    outsider_token = out_resp.json()["access_token"]

    # 3. Create a community and group by owner
    comm_resp = await client.post(
        "/communities",
        json={"name": "CS2103T Community", "description": "SE Project"},
        headers=auth_headers(owner_token),
    )
    assert comm_resp.status_code == 201
    comm_id = comm_resp.json()["id"]

    grp_resp = await client.post(
        "/groups",
        json={"c_id": comm_id, "name": "Team W14-2", "description": "Main Project Team"},
        headers=auth_headers(owner_token),
    )
    assert grp_resp.status_code == 201
    group_id = grp_resp.json()["id"]

    # 4. Invite member to group
    inv_resp = await client.post(
        "/invites",
        json={"g_id": group_id},
        headers=auth_headers(owner_token),
    )
    assert inv_resp.status_code == 201
    invite_code = inv_resp.json()["code"]

    join_resp = await client.post(
        f"/invites/join/{invite_code}",
        headers=auth_headers(member_token),
    )
    assert join_resp.status_code == 200

    # 5. Non-member cannot create task in group (403)
    out_task_resp = await client.post(
        "/tasks",
        json={"title": "Unauthorized Task", "group_id": group_id},
        headers=auth_headers(outsider_token),
    )
    assert out_task_resp.status_code == 403

    # 6. Owner creates task assigned to member
    create_task_resp = await client.post(
        "/tasks",
        json={
            "title": "Implement User Profile UI",
            "description": "Follow macOS HIG specifications",
            "priority_manual": "high",
            "group_id": group_id,
            "assignee_id": member_id,
        },
        headers=auth_headers(owner_token),
    )
    assert create_task_resp.status_code == 201
    task_data = create_task_resp.json()
    task_id = task_data["id"]
    assert task_data["group_id"] == group_id
    assert task_data["group_name"] == "Team W14-2"
    assert task_data["assignee_id"] == member_id
    assert task_data["assignee_email"] == member_email

    # 7. Member can list group tasks via /groups/{group_id}/tasks
    grp_tasks_resp = await client.get(
        f"/groups/{group_id}/tasks",
        headers=auth_headers(member_token),
    )
    assert grp_tasks_resp.status_code == 200
    grp_tasks = grp_tasks_resp.json()
    assert len(grp_tasks) == 1
    assert grp_tasks[0]["id"] == task_id
    assert grp_tasks[0]["assignee_id"] == member_id

    # 8. Outsider cannot list group tasks (403)
    out_list_resp = await client.get(
        f"/groups/{group_id}/tasks",
        headers=auth_headers(outsider_token),
    )
    assert out_list_resp.status_code == 403

    # 9. Member sees the assigned task in their personal /tasks feed
    member_personal_resp = await client.get(
        "/tasks",
        headers=auth_headers(member_token),
    )
    assert member_personal_resp.status_code == 200
    member_personal_tasks = member_personal_resp.json()
    assert any(t["id"] == task_id for t in member_personal_tasks)

    # 10. Member completes the task
    update_resp = await client.patch(
        f"/tasks/{task_id}",
        json={"status": "done"},
        headers=auth_headers(member_token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "done"
    assert update_resp.json()["completed_at"] is not None

    # 11. Delete task by owner
    del_resp = await client.delete(
        f"/tasks/{task_id}",
        headers=auth_headers(owner_token),
    )
    assert del_resp.status_code == 204
