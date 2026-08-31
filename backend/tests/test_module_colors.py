import pytest
from httpx import AsyncClient

from conftest import auth_headers
from database import db

pytestmark = pytest.mark.asyncio


async def add_class(user_id: int, module_code: str, module_name: str):
    await db.execute(
        """
            INSERT INTO classes (
                user_id, module_code, module_name, lesson_type, class_no,
                day_of_week, start_time, end_time, venue, class_date
            ) VALUES (
                :user_id, :module_code, :module_name, 'Lecture', '1',
                1, '10:00:00', '11:00:00', 'LT1', '2026-09-07'
            )
        """,
        values={"user_id": user_id, "module_code": module_code, "module_name": module_name},
    )


async def test_assigns_unique_shared_colors_to_discovered_modules(client: AsyncClient, auth):
    token, user_id, _ = auth
    await add_class(user_id, "CS2040S", "Data Structures and Algorithms")
    await add_class(user_id, "ST2334", "Probability and Statistics")

    response = await client.get("/module-colors", headers=auth_headers(token))

    assert response.status_code == 200, response.text
    modules = response.json()["modules"]
    assert [module["module_code"] for module in modules] == ["CS2040S", "ST2334"]
    assert len({module["color"] for module in modules}) == 2

    schedule = await client.get("/schedule", headers=auth_headers(token))
    schedule_colors = {item["module_code"]: item["module_color"] for item in schedule.json()["classes"]}
    assert schedule_colors == {module["module_code"]: module["color"] for module in modules}


async def test_migrates_the_legacy_default_palette_without_touching_custom_palettes(client: AsyncClient, auth):
    token, user_id, _ = auth
    await add_class(user_id, "CS2040S", "Data Structures and Algorithms")
    await add_class(user_id, "ST2334", "Probability and Statistics")
    await db.execute(
        "INSERT INTO module_colors (user_id, module_code, module_name, color) VALUES (:user_id, 'CS2040S', 'Data Structures and Algorithms', '#4F7CFF')",
        values={"user_id": user_id},
    )
    await db.execute(
        "INSERT INTO module_colors (user_id, module_code, module_name, color) VALUES (:user_id, 'ST2334', 'Probability and Statistics', '#19A974')",
        values={"user_id": user_id},
    )
    await db.execute(
        "INSERT INTO module_color_settings (user_id, palette_name) VALUES (:user_id, 'balanced')",
        values={"user_id": user_id},
    )

    response = await client.get("/module-colors", headers=auth_headers(token))

    assert response.status_code == 200, response.text
    assert response.json()["active_palette"] == "balanced"
    assert [item["color"] for item in response.json()["modules"]] == ["#F0757C", "#6A9DCF"]


async def test_palette_and_manual_color_changes_are_persisted(client: AsyncClient, auth):
    token, user_id, _ = auth
    await add_class(user_id, "CS2040S", "Data Structures and Algorithms")
    await add_class(user_id, "ST2334", "Probability and Statistics")

    palette_response = await client.put(
        "/module-colors/palette",
        json={"palette": "earth"},
        headers=auth_headers(token),
    )
    assert palette_response.status_code == 200, palette_response.text
    palette_payload = palette_response.json()
    assert palette_payload["active_palette"] == "earth"
    assert [item["color"] for item in palette_payload["modules"]] == ["#A35D3B", "#647A45"]

    custom_response = await client.patch(
        "/module-colors/CS2040S",
        json={"color": "#123ABC"},
        headers=auth_headers(token),
    )
    assert custom_response.status_code == 200, custom_response.text
    custom_payload = custom_response.json()
    assert custom_payload["active_palette"] == "custom"
    colors = {item["module_code"]: item["color"] for item in custom_payload["modules"]}
    assert colors["CS2040S"] == "#123ABC"
    assert len(set(colors.values())) == 2

    swapped_response = await client.patch(
        "/module-colors/ST2334",
        json={"color": "#123ABC"},
        headers=auth_headers(token),
    )
    assert swapped_response.status_code == 200, swapped_response.text
    swapped = {item["module_code"]: item["color"] for item in swapped_response.json()["modules"]}
    assert swapped == {"CS2040S": "#647A45", "ST2334": "#123ABC"}

    restored_response = await client.put(
        "/module-colors/palette",
        json={"palette": "earth"},
        headers=auth_headers(token),
    )
    assert restored_response.status_code == 200, restored_response.text
    restored = {item["module_code"]: item["color"] for item in restored_response.json()["modules"]}
    assert restored == {"CS2040S": "#A35D3B", "ST2334": "#647A45"}
