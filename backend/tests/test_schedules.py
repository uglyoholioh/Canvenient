import pytest
from httpx import AsyncClient

import routes.schedules as schedule_routes
from conftest import auth_headers
from database import db

pytestmark = pytest.mark.asyncio


async def test_import_nusmods_timetable(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth

    async def fake_module(_client, _api_year, module_code):
        assert module_code == "CS2040S"
        return {
            "moduleCode": "CS2040S",
            "title": "Data Structures and Algorithms",
            "semesterData": [{
                "semester": 1,
                "examDate": "2026-11-24T01:00:00.000Z",
                "examDuration": 120,
                "timetable": [
                    {"classNo": "1", "lessonType": "Lecture", "day": "Monday", "startTime": "1000", "endTime": "1200", "venue": "LT19", "weeks": [2, 3]},
                    {"classNo": "2", "lessonType": "Tutorial", "day": "Wednesday", "startTime": "1400", "endTime": "1500", "venue": "COM1-0201", "weeks": [2]},
                ],
            }],
        }

    monkeypatch.setattr(schedule_routes, "fetch_nusmods_module", fake_module)
    response = await client.post(
        "/schedule/import/nusmods",
        json={"url": "https://nusmods.com/timetable/2026-2027/sem-1/share?CS2040S=LEC:1,TUT:2"},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["classes"] == 3
    assert response.json()["exams"] == 1

    schedule = await client.get("/schedule", headers=auth_headers(token))
    assert schedule.status_code == 200
    payload = schedule.json()
    assert [item["class_date"] for item in payload["classes"]] == ["2026-08-17", "2026-08-19", "2026-08-24"]
    assert payload["classes"][0]["module_name"] == "Data Structures and Algorithms"
    assert payload["exams"][0]["module_code"] == "CS2040S"


async def test_rejects_non_nusmods_link(client: AsyncClient, auth):
    token, _, _ = auth
    response = await client.post(
        "/schedule/import/nusmods",
        json={"url": "https://example.com/timetable/sem-1/share?CS2040S=LEC:1"},
        headers=auth_headers(token),
    )
    assert response.status_code == 400
    assert "nusmods.com" in response.json()["detail"]


async def test_import_ics_timetable(client: AsyncClient, auth):
    token, _, _ = auth
    calendar = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Canvenient Tests//EN
BEGIN:VEVENT
UID:cs2040s-lecture@test
DTSTART;TZID=Asia/Singapore:20260901T100000
DTEND;TZID=Asia/Singapore:20260901T120000
SUMMARY:CS2040S Lecture
DESCRIPTION:Data Structures and Algorithms\\nLecture Group 1
LOCATION:COM1-0201
END:VEVENT
END:VCALENDAR
"""
    response = await client.post(
        "/schedule/import/ics",
        files={"file": ("timetable.ics", calendar, "text/calendar")},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    assert response.json() == {"source": "ics", "classes": 1, "exams": 0}

    schedule = await client.get("/schedule", headers=auth_headers(token))
    imported = schedule.json()["classes"][0]
    assert imported["class_date"] == "2026-09-01"
    assert imported["start_time"] == "10:00:00"
    assert imported["class_no"] == "1"


async def test_reads_legacy_weekly_classes_without_exact_date(client: AsyncClient, auth):
    token, user_id, _ = auth
    await db.execute(
        query="""
            INSERT INTO classes
                (user_id, module_code, module_name, lesson_type, class_no,
                 day_of_week, start_time, end_time, venue, class_date)
            VALUES
                (:user_id, 'CS1231S', 'Discrete Structures', 'Tutorial', '08',
                 5, '09:00:00', '10:00:00', 'COM1-0201', NULL)
        """,
        values={"user_id": user_id},
    )

    response = await client.get("/schedule", headers=auth_headers(token))

    assert response.status_code == 200, response.text
    assert response.json()["classes"][0]["class_date"] is None
