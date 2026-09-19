import pytest
from conftest import auth_headers

from database import db

pytestmark = pytest.mark.asyncio


async def test_module_selection_is_persisted_per_user(client, auth):
    token, user_id, _ = auth
    for module_code, name in (("CS2040", "Data Structures"), ("ST2334", "Probability")):
        await db.execute(
            "INSERT INTO academic_modules (user_id, module_code, name, source_type) VALUES (:user_id, :module_code, :name, 'canvas')",
            values={"user_id": user_id, "module_code": module_code, "name": name},
        )

    listed = await client.get("/academic-modules", headers=auth_headers(token))
    assert listed.status_code == 200, listed.text
    modules = listed.json()
    cs2040_id = next(module["id"] for module in modules if module["module_code"] == "CS2040")

    saved = await client.put(
        "/academic-modules/selection", json={"module_ids": [cs2040_id]}, headers=auth_headers(token)
    )
    assert saved.status_code == 200, saved.text
    selected = {module["module_code"]: module["is_selected"] for module in saved.json()}
    assert selected == {"CS2040": True, "ST2334": False}


async def test_custom_module_lifecycle(client, auth):
    token, user_id, _ = auth
    await db.execute(
        "INSERT INTO academic_modules (user_id, module_code, name, source_type) VALUES (:user_id, 'CS2040', 'Data Structures', 'canvas')",
        values={"user_id": user_id},
    )

    created = await client.post(
        "/academic-modules/custom",
        json={"module_code": "xfs3241", "name": "Independent Study"},
        headers=auth_headers(token),
    )
    assert created.status_code == 201, created.text
    module = created.json()
    assert module["module_code"] == "XFS3241"
    assert module["source_type"] == "manual"
    assert module["is_selected"] is True

    duplicate = await client.post(
        "/academic-modules/custom",
        json={"module_code": "XFS3241", "name": "Again"},
        headers=auth_headers(token),
    )
    assert duplicate.status_code == 400

    deleted = await client.delete(f"/academic-modules/custom/{module['id']}", headers=auth_headers(token))
    assert deleted.status_code == 204
    listed = await client.get("/academic-modules", headers=auth_headers(token))
    assert all(item["module_code"] != "XFS3241" for item in listed.json())


async def test_canvas_synced_module_cannot_be_deleted(client, auth):
    token, user_id, _ = auth
    await db.execute(
        "INSERT INTO academic_modules (user_id, module_code, name, source_type) VALUES (:user_id, 'CS2040', 'Data Structures', 'canvas')",
        values={"user_id": user_id},
    )
    listed = await client.get("/academic-modules", headers=auth_headers(token))
    cs2040_id = next(m["id"] for m in listed.json() if m["module_code"] == "CS2040")

    deleted = await client.delete(f"/academic-modules/custom/{cs2040_id}", headers=auth_headers(token))
    assert deleted.status_code == 400
