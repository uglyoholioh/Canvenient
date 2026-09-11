import pytest
from conftest import auth_headers
from httpx import AsyncClient

from database import db

pytestmark = pytest.mark.asyncio

SERIES_DATES = ["2026-09-04", "2026-09-11", "2026-09-18"]


async def seed_series(user_id: int) -> dict[str, int]:
    """Three occurrences of one recurring tutorial + one unrelated class."""
    ids = {}
    for occurrence_date in SERIES_DATES:
        row = await db.fetch_one(
            query="""
                INSERT INTO classes (user_id, module_code, module_name, lesson_type, class_no,
                                     day_of_week, start_time, end_time, venue, class_date)
                VALUES (:user_id, 'CS2103', 'Software Engineering', 'Tutorial', '1',
                        5, '14:00:00', '15:00:00', 'COM1-0201', :class_date)
                RETURNING id
            """,
            values={"user_id": user_id, "class_date": occurrence_date},
        )
        ids[occurrence_date] = row["id"]
    other = await db.fetch_one(
        query="""
            INSERT INTO classes (user_id, module_code, module_name, lesson_type, class_no,
                                 day_of_week, start_time, end_time, venue, class_date)
            VALUES (:user_id, 'ST2334', 'Probability and Statistics', 'Lecture', '2',
                    3, '10:00:00', '12:00:00', 'LT27', '2026-09-09')
            RETURNING id
        """,
        values={"user_id": user_id},
    )
    ids["other"] = other["id"]
    return ids


async def test_instance_override_visible_in_schedule_and_context(client: AsyncClient, auth):
    token, user_id, _ = auth
    ids = await seed_series(user_id)
    headers = auth_headers(token)
    target_date = SERIES_DATES[1]

    resp = await client.patch(
        f"/schedule/classes/{ids[target_date]}",
        json={"attend_in_person": False, "occurrence_date": target_date},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    schedule = (await client.get("/schedule", headers=headers)).json()
    by_id = {c["id"]: c for c in schedule["classes"]}
    assert by_id[ids[target_date]]["attend_in_person"] is False
    assert by_id[ids[SERIES_DATES[0]]]["attend_in_person"] is True
    assert by_id[ids[SERIES_DATES[2]]]["attend_in_person"] is True
    assert by_id[ids["other"]]["attend_in_person"] is True
    # The old dead key must not come back; the value is merged into rows.
    assert "class_attendance_overrides" not in schedule

    context = await client.get(
        f"/schedule/classes/{ids[target_date]}/context",
        params={"occurrence_date": target_date},
        headers=headers,
    )
    assert context.status_code == 200
    assert context.json()["class"]["attend_in_person"] is False

    sibling = await client.get(
        f"/schedule/classes/{ids[SERIES_DATES[0]]}/context",
        params={"occurrence_date": SERIES_DATES[0]},
        headers=headers,
    )
    assert sibling.json()["class"]["attend_in_person"] is True


async def test_whole_class_updates_series_and_clears_exceptions(client: AsyncClient, auth):
    token, user_id, _ = auth
    ids = await seed_series(user_id)
    headers = auth_headers(token)
    exception_date = SERIES_DATES[0]

    # Create an exception first: not attending one date.
    resp = await client.patch(
        f"/schedule/classes/{ids[exception_date]}",
        json={"attend_in_person": False, "occurrence_date": exception_date},
        headers=headers,
    )
    assert resp.status_code == 200

    # Whole-class setting wins and clears the exception.
    resp = await client.patch(
        f"/schedule/classes/{ids[SERIES_DATES[1]]}",
        json={"attend_in_person": False},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    schedule = (await client.get("/schedule", headers=headers)).json()
    by_id = {c["id"]: c for c in schedule["classes"]}
    for date in SERIES_DATES:
        assert by_id[ids[date]]["attend_in_person"] is False
    assert by_id[ids["other"]]["attend_in_person"] is True

    remaining = await db.fetch_all(
        "SELECT * FROM class_attendance_overrides WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    assert remaining == []

    # Flipping the whole class back to attending applies to every occurrence.
    resp = await client.patch(
        f"/schedule/classes/{ids[SERIES_DATES[2]]}",
        json={"attend_in_person": True},
        headers=headers,
    )
    assert resp.status_code == 200
    schedule = (await client.get("/schedule", headers=headers)).json()
    assert all(c["attend_in_person"] is True for c in schedule["classes"])


async def test_whole_class_patch_is_scoped_to_the_series(client: AsyncClient, auth):
    token, user_id, _ = auth
    ids = await seed_series(user_id)
    headers = auth_headers(token)

    resp = await client.patch(
        f"/schedule/classes/{ids[SERIES_DATES[0]]}",
        json={"attend_in_person": False},
        headers=headers,
    )
    assert resp.status_code == 200

    schedule = (await client.get("/schedule", headers=headers)).json()
    by_id = {c["id"]: c for c in schedule["classes"]}
    assert by_id[ids["other"]]["attend_in_person"] is True


async def test_patch_validates_class_and_date(client: AsyncClient, auth):
    token, user_id, _ = auth
    ids = await seed_series(user_id)
    headers = auth_headers(token)

    missing = await client.patch(
        "/schedule/classes/999999",
        json={"attend_in_person": False},
        headers=headers,
    )
    assert missing.status_code == 404

    wrong_date = await client.patch(
        f"/schedule/classes/{ids[SERIES_DATES[0]]}",
        json={"attend_in_person": False, "occurrence_date": "2026-12-25"},
        headers=headers,
    )
    assert wrong_date.status_code == 400

    foreign = await client.patch(
        f"/schedule/classes/{ids[SERIES_DATES[0]]}",
        json={"attend_in_person": False, "occurrence_date": SERIES_DATES[0]},
        headers={"Authorization": "Bearer invalid-token-xyz"},
    )
    assert foreign.status_code in (401, 403)
