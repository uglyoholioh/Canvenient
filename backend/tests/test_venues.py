import pytest
from httpx import AsyncClient

import routes.venues as venue_routes
from conftest import auth_headers
from database import db

pytestmark = pytest.mark.asyncio


SAMPLE_VENUE_INFO = {
    "COM1-0206": [
        {
            "day": "Monday",
            "classes": [
                {
                    "classNo": "1",
                    "startTime": "1000",
                    "endTime": "1200",
                    "weeks": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                    "day": "Monday",
                    "lessonType": "Lecture",
                    "size": 60,
                    "moduleCode": "CS2040C",
                }
            ],
            "availability": {
                "1000": "occupied",
                "1030": "occupied",
                "1100": "occupied",
                "1130": "occupied",
            },
        },
        {
            "day": "Tuesday",
            "classes": [],
            "availability": {},
        },
    ],
    "AS6-0208": [
        {
            "day": "Monday",
            "classes": [
                {
                    "classNo": "T1",
                    "startTime": "1400",
                    "endTime": "1600",
                    "weeks": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                    "day": "Monday",
                    "lessonType": "Tutorial",
                    "size": 25,
                    "moduleCode": "PL1101E",
                }
            ],
            "availability": {
                "1400": "occupied",
                "1430": "occupied",
                "1500": "occupied",
                "1530": "occupied",
            },
        }
    ],
    "LT27": [
        {
            "day": "Monday",
            "classes": [],
            "availability": {},
        }
    ],
}

SAMPLE_LOCATIONS = {
    "COM1-0206": {
        "roomName": "Seminar Room 1",
        "floor": 2,
        "location": {"x": 103.77372, "y": 1.29495},
    },
    "AS6-0208": {
        "roomName": "Tutorial Room 8",
        "floor": 2,
        "location": {"x": 103.77265, "y": 1.29532},
    },
    "LT27": {
        "roomName": "Lecture Theatre 27",
        "floor": 1,
        "location": {"x": 103.78035, "y": 1.29785},
    },
}


async def test_get_venues_info(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    venue_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'venues:%%'")

    async def fake_fetch_info(ay, sem):
        return SAMPLE_VENUE_INFO

    monkeypatch.setattr(venue_routes, "_fetch_venue_info", fake_fetch_info)

    response = await client.get("/venues/info", headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["total_venues"] == 3
    assert "COM1-0206" in data["venues"]
    assert "AS6-0208" in data["venues"]


async def test_get_venues_locations(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    venue_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'venues:%%'")

    async def fake_fetch_locations():
        return SAMPLE_LOCATIONS

    monkeypatch.setattr(venue_routes, "_fetch_venue_locations", fake_fetch_locations)

    response = await client.get("/venues/locations", headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()
    assert data["total_locations"] == 3
    assert data["locations"]["COM1-0206"]["roomName"] == "Seminar Room 1"


async def test_search_free_venues_with_proximity(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    venue_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'venues:%%'")

    async def fake_fetch_info(ay, sem):
        return SAMPLE_VENUE_INFO

    async def fake_fetch_locations():
        return SAMPLE_LOCATIONS

    monkeypatch.setattr(venue_routes, "_fetch_venue_info", fake_fetch_info)
    monkeypatch.setattr(venue_routes, "_fetch_venue_locations", fake_fetch_locations)

    # Search free rooms on Monday at 09:00 near COM1 (1.29495, 103.77372)
    response = await client.get(
        "/venues/availability?day=Monday&time=0900&lat=1.29495&lon=103.77372&sort=distance",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    results = data["results"]
    assert len(results) == 3

    # COM1-0206 should be nearest (0m away), free until 1000 (60 mins free)
    com1 = next(r for r in results if r["venue_code"] == "COM1-0206")
    assert com1["is_free"] is True
    assert com1["free_until"] == "1000"
    assert com1["free_minutes"] == 60
    assert com1["distance_metres"] == 0
    assert com1["walking_minutes"] == 1
    assert com1["faculty"] == "Computing"
    assert com1["next_lesson"]["moduleCode"] == "CS2040C"

    # LT27 should be free all day (until 2200)
    lt27 = next(r for r in results if r["venue_code"] == "LT27")
    assert lt27["is_free"] is True
    assert lt27["free_until"] == "2200"


async def test_search_free_venues_filtering_and_occupied(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    venue_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'venues:%%'")

    async def fake_fetch_info(ay, sem):
        return SAMPLE_VENUE_INFO

    async def fake_fetch_locations():
        return SAMPLE_LOCATIONS

    monkeypatch.setattr(venue_routes, "_fetch_venue_info", fake_fetch_info)
    monkeypatch.setattr(venue_routes, "_fetch_venue_locations", fake_fetch_locations)

    # At 10:30 on Monday, COM1-0206 is occupied. With only_free=true it shouldn't appear
    response = await client.get(
        "/venues/availability?day=Monday&time=1030&only_free=true",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    free_codes = [r["venue_code"] for r in response.json()["results"]]
    assert "COM1-0206" not in free_codes
    assert "AS6-0208" in free_codes
    assert "LT27" in free_codes

    # With only_free=false, COM1-0206 appears and is flagged as not free
    response_all = await client.get(
        "/venues/availability?day=Monday&time=1030&only_free=false",
        headers=auth_headers(token),
    )
    assert response_all.status_code == 200
    all_results = response_all.json()["results"]
    com1 = next(r for r in all_results if r["venue_code"] == "COM1-0206")
    assert com1["is_free"] is False
    assert com1["current_lesson"]["moduleCode"] == "CS2040C"

    # Faculty filter
    response_fac = await client.get(
        "/venues/availability?day=Monday&time=0900&faculty=Arts%20%26%20Social%20Sciences",
        headers=auth_headers(token),
    )
    assert response_fac.status_code == 200
    assert len(response_fac.json()["results"]) == 1
    assert response_fac.json()["results"][0]["venue_code"] == "AS6-0208"
