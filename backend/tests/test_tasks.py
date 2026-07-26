"""
Tasks endpoint CRUD tests — Create, Read, Update, Delete, Unauthenticated access checks.
"""

import pytest
from httpx import AsyncClient
from conftest import auth_headers

pytestmark = pytest.mark.asyncio


async def test_create_task_success(client: AsyncClient, auth):
    """Test creating a new task returns 201 with default fields."""
    token, _, _ = auth
    payload = {
        "title": "CS2103T Software Engineering Quiz",
        "description": "Complete online quiz before Friday",
        "estimated_minutes": 45,
        "priority_manual": "high",
    }
    resp = await client.post("/tasks", json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == payload["title"]
    assert data["status"] == "todo"
    assert data["estimated_minutes"] == 45


async def test_get_tasks_list(client: AsyncClient, auth):
    """Test fetching task list returns created tasks for user."""
    token, _, _ = auth
    # Create two tasks
    await client.post("/tasks", json={"title": "Task A"}, headers=auth_headers(token))
    await client.post("/tasks", json={"title": "Task B"}, headers=auth_headers(token))

    resp = await client.get("/tasks", headers=auth_headers(token))
    assert resp.status_code == 200
    tasks = resp.json()
    assert isinstance(tasks, list)
    assert len(tasks) >= 2


async def test_update_task_status_and_title(client: AsyncClient, auth):
    """Test updating task status to 'done' sets completed_at."""
    token, _, _ = auth
    create_resp = await client.post("/tasks", json={"title": "Original Title"}, headers=auth_headers(token))
    task_id = create_resp.json()["id"]

    update_payload = {"title": "Updated Title", "status": "done"}
    resp = await client.patch(f"/tasks/{task_id}", json=update_payload, headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["status"] == "done"
    assert data["completed_at"] is not None


async def test_delete_task_success(client: AsyncClient, auth):
    """Test deleting an existing task returns 204 no content."""
    token, _, _ = auth
    create_resp = await client.post("/tasks", json={"title": "Task to delete"}, headers=auth_headers(token))
    task_id = create_resp.json()["id"]

    resp = await client.delete(f"/tasks/{task_id}", headers=auth_headers(token))
    assert resp.status_code == 204

    # Verify task is deleted
    list_resp = await client.get("/tasks", headers=auth_headers(token))
    task_ids = [t["id"] for t in list_resp.json()]
    assert task_id not in task_ids


async def test_unauthenticated_tasks_access(client: AsyncClient):
    """Test unauthenticated access to /tasks returns 401."""
    resp = await client.get("/tasks")
    assert resp.status_code == 401

    post_resp = await client.post("/tasks", json={"title": "Unauthorized Task"})
    assert post_resp.status_code == 401
