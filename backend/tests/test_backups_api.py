"""
Tests for the backup listing/restore API (routes/backups.py).
"""

import uuid

import pytest
from httpx import AsyncClient

from backup import backup_database, list_backups
from conftest import auth_headers


@pytest.mark.asyncio
async def test_list_and_restore_backup(client: AsyncClient, auth):
    token, user_id, _ = auth
    headers = auth_headers(token)

    # Isolate: drop leftovers from previous runs so the listing is deterministic.
    import shutil
    from pathlib import Path
    backup_dir = Path("./backups")
    if backup_dir.exists():
        shutil.rmtree(backup_dir)

    suffix = uuid.uuid4().hex[:8]

    # Create data, take a backup, then create more data.
    task = await client.post(
        "/tasks",
        json={"title": f"Before {suffix}"},
        headers=headers,
    )
    assert task.status_code == 201

    from backup import backup_database
    import os
    safety = backup_database(os.environ["DATABASE_URL"])
    assert safety is not None

    task2 = await client.post(
        "/tasks",
        json={"title": f"After {suffix}"},
        headers=headers,
    )
    assert task2.status_code == 201

    listing = await client.get("/backups", headers=headers)
    assert listing.status_code == 200
    backups = listing.json()
    assert len(backups) >= 1
    assert all("name" in b and "size_bytes" in b and "modified_at" in b for b in backups)

    # Restoring the pre-"After backup" state removes the newer task again.
    restore = await client.post(
        "/backups/restore",
        json={"name": backups[0]["name"]},
        headers=headers,
    )
    assert restore.status_code == 200, restore.text

    tasks_resp = await client.get("/tasks", headers=headers)
    titles = [t["title"] for t in tasks_resp.json()]
    assert f"After {suffix}" not in titles
    assert f"Before {suffix}" in titles


@pytest.mark.asyncio
async def test_restore_rejects_unknown_and_traversal_names(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)

    missing = await client.post(
        "/backups/restore", json={"name": "nope-20260101-000000.db"}, headers=headers
    )
    assert missing.status_code == 404

    traversal = await client.post(
        "/backups/restore",
        json={"name": "../canvenient.db"},
        headers=headers,
    )
    assert traversal.status_code in (404, 500)
