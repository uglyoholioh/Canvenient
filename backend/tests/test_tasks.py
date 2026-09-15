"""
Tasks endpoint CRUD tests — Create, Read, Update, Delete, Unauthenticated access checks.
"""

import pytest
from conftest import auth_headers
from httpx import AsyncClient

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


async def test_create_task_with_long_description(client: AsyncClient, auth):
    """Test creating a task with a long description (> 4000 chars) succeeds and truncates gracefully if oversized."""
    token, _, _ = auth
    long_desc = "A" * 5000
    resp = await client.post(
        "/tasks",
        json={"title": "Assignment with long prompt", "description": long_desc},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["description"] == long_desc

    oversized_desc = "B" * 25000
    resp_over = await client.post(
        "/tasks",
        json={"title": "Assignment with oversized prompt", "description": oversized_desc},
        headers=auth_headers(token),
    )
    assert resp_over.status_code == 201
    data_over = resp_over.json()
    assert len(data_over["description"]) == 20000
    assert data_over["description"] == "B" * 20000


async def test_unauthenticated_tasks_access(client: AsyncClient):
    """Test unauthenticated access to /tasks returns 401."""
    resp = await client.get("/tasks")
    assert resp.status_code == 401

    post_resp = await client.post("/tasks", json={"title": "Unauthorized Task"})
    assert post_resp.status_code == 401


async def test_create_canvas_task_strips_html_description(client: AsyncClient, auth):
    """Test creating a task with source_type='canvas' cleans HTML tags from description."""
    token, _, _ = auth
    html_desc = (
        "<p><span>Attached here are the Assignment 1 files.</span></p><p><a href='#'>BT2102-Assignment1.pdf</a></p>"
    )
    resp = await client.post(
        "/tasks",
        json={
            "title": "Assignment 1",
            "description": html_desc,
            "source_type": "canvas",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "<p>" not in data["description"]
    assert "<span>" not in data["description"]
    assert "Attached here are the Assignment 1 files." in data["description"]
    assert "BT2102-Assignment1.pdf" in data["description"]


async def test_recurring_task_roundtrip(client: AsyncClient, auth):
    """Repeat fields survive create and read."""
    token, _, _ = auth
    resp = await client.post(
        "/tasks",
        json={
            "title": "Weekly lab report",
            "due_at_override": "2026-09-18T17:00:00+00:00",
            "repeat_every": 1,
            "repeat_unit": "week",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["repeat_every"] == 1
    assert body["repeat_unit"] == "week"


async def test_completing_recurring_task_spawns_next(client: AsyncClient, auth):
    """Completion spawns one next occurrence anchored to the prior due date."""
    token, _, _ = auth
    created = await client.post(
        "/tasks",
        json={
            "title": "Weekly lab report",
            "due_at_override": "2026-09-11T17:00:00+00:00",
            "repeat_every": 1,
            "repeat_unit": "week",
        },
        headers=auth_headers(token),
    )
    task_id = created.json()["id"]

    done = await client.patch(
        f"/tasks/{task_id}",
        json={"status": "done"},
        headers=auth_headers(token),
    )
    assert done.status_code == 200
    assert done.json()["status"] == "done"

    listing = (await client.get("/tasks", headers=auth_headers(token))).json()
    todos = [task for task in listing if task["status"] == "todo"]
    assert len(todos) == 1
    spawned = todos[0]
    assert spawned["title"] == "Weekly lab report"
    assert spawned["due_at_override"].startswith("2026-09-18T17:00:00")
    assert spawned["repeat_every"] == 1
    assert spawned["repeat_unit"] == "week"


async def test_completing_daily_recurring_task_uses_day_step(client: AsyncClient, auth):
    token, _, _ = auth
    created = await client.post(
        "/tasks",
        json={
            "title": "Water the plants",
            "due_at_override": "2026-09-14T09:00:00+00:00",
            "repeat_every": 3,
            "repeat_unit": "day",
        },
        headers=auth_headers(token),
    )
    task_id = created.json()["id"]
    await client.patch(f"/tasks/{task_id}", json={"status": "done"}, headers=auth_headers(token))

    listing = (await client.get("/tasks", headers=auth_headers(token))).json()
    spawned = next(task for task in listing if task["status"] == "todo")
    assert spawned["due_at_override"].startswith("2026-09-17T09:00:00")


async def test_non_repeating_and_canvas_tasks_never_spawn(client: AsyncClient, auth):
    token, _, _ = auth
    plain = await client.post(
        "/tasks", json={"title": "One-off chore"}, headers=auth_headers(token)
    )
    await client.patch(
        f"/tasks/{plain.json()['id']}", json={"status": "done"}, headers=auth_headers(token)
    )
    canvas = await client.post(
        "/tasks",
        json={
            "title": "Canvas quiz",
            "source_type": "canvas",
            "source_id": "quiz-1",
            "repeat_every": 1,
            "repeat_unit": "week",
        },
        headers=auth_headers(token),
    )
    await client.patch(
        f"/tasks/{canvas.json()['id']}", json={"status": "done"}, headers=auth_headers(token)
    )

    listing = (await client.get("/tasks", headers=auth_headers(token))).json()
    assert all(task["status"] != "todo" or task["source_type"] == "manual" and task["repeat_every"] is None for task in listing)
