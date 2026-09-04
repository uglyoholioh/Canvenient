import pytest
from httpx import AsyncClient

import routes.campus_bus as campus_bus_routes
from conftest import auth_headers
from database import db

pytestmark = pytest.mark.asyncio


async def test_returns_normalized_nus_bus_stops_and_arrivals(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    campus_bus_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'campus-bus:%%'")

    async def fake_fetch(path, params=None):
        if path == "/api/bus-stops":
            return {"BusStopsResult": {"busstops": [
                {"name": "COM3", "LongName": "COM 3", "ShortName": "COM 3", "latitude": 1.294431, "longitude": 103.775217},
            ]}}
        assert path == "/api/shuttle-service"
        assert params == {"busstopname": "COM3"}
        return {"ShuttleServiceResult": {
            "name": "COM3", "caption": "COM 3", "TimeStamp": "2026-09-01T10:00:00+08:00",
            "shuttles": [
                {"name": "A1", "_etas": [{"eta": 2}, {"eta": "9"}]},
                {"name": "A1", "_etas": [{"eta": 4}]},
                {"name": "D2", "arrivalTime": "0", "nextArrivalTime": "11"},
            ],
        }}

    monkeypatch.setattr(campus_bus_routes, "_fetch_payload", fake_fetch)

    stops_response = await client.get("/campus-bus/stops", headers=auth_headers(token))
    assert stops_response.status_code == 200
    assert stops_response.json() == {"stops": [{"id": "COM3", "name": "COM 3", "short_name": "COM 3", "latitude": 1.294431, "longitude": 103.775217}]}

    arrivals_response = await client.get("/campus-bus/arrivals?stop=COM3", headers=auth_headers(token))
    assert arrivals_response.status_code == 200
    assert arrivals_response.json()["stop"] == {"id": "COM3", "name": "COM 3"}
    assert arrivals_response.json()["arrivals"] == [
        {"service": "A1", "minutes": [2, 9]},
        {"service": "D2", "minutes": [0, 11]},
    ]


async def test_uses_persistent_cache_after_memory_cache_is_cleared(auth, monkeypatch):
    token, _, _ = auth
    cache_key = "arrivals:CACHE_TEST_STOP"
    payload = {"ShuttleServiceResult": {"name": "CACHE_TEST_STOP", "shuttles": []}}
    await db.execute("DELETE FROM native_api_cache WHERE cache_key = :cache_key", {"cache_key": f"campus-bus:{cache_key}"})
    await campus_bus_routes._save_persistent_cache(cache_key, payload)
    campus_bus_routes._cache.clear()

    async def should_not_fetch(*_args, **_kwargs):
        raise AssertionError("A fresh durable cache should avoid an upstream request")

    monkeypatch.setattr(campus_bus_routes, "_fetch_payload", should_not_fetch)

    cached = await campus_bus_routes._cached_payload(
        cache_key,
        "/api/shuttle-service",
        {"busstopname": "CACHE_TEST_STOP"},
    )

    assert cached == payload


async def test_searches_bus_stops_and_nus_campus_locations(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    campus_bus_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'campus-bus:%%'")

    async def fake_fetch(path, params=None):
        assert path == "/api/bus-stops"
        return {"BusStopsResult": {"busstops": [
            {"name": "COM3", "LongName": "COM 3", "ShortName": "COM 3", "latitude": 1.294431, "longitude": 103.775217},
        ]}}

    async def fake_places(query):
        assert query == "School of Computing"
        return [{
            "id": "12", "place_name": "School of Computing", "location_name": "",
            "campus_name": "Kent Ridge Campus", "long": "103.7739567", "lat": "1.2948966",
            "tbl": "building",
        }]

    monkeypatch.setattr(campus_bus_routes, "_fetch_payload", fake_fetch)
    monkeypatch.setattr(campus_bus_routes, "_fetch_place_results", fake_places)

    response = await client.get(
        "/campus-bus/places?q=School%20of%20Computing",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["places"][0] == {
        "id": "building:12",
        "name": "School of Computing",
        "subtitle": "Kent Ridge Campus",
        "latitude": 1.2948966,
        "longitude": 103.7739567,
        "kind": "location",
    }


async def test_plans_direct_route_with_catchable_bus_and_live_travel_time(client: AsyncClient, auth, monkeypatch):
    token, _, _ = auth
    campus_bus_routes._cache.clear()
    await db.execute("DELETE FROM native_api_cache WHERE cache_key LIKE 'campus-bus:%%'")

    async def fake_fetch(path, params=None):
        if path == "/api/bus-stops":
            return {"BusStopsResult": {"busstops": [
                {"name": "COM3", "LongName": "COM 3", "ShortName": "COM 3", "latitude": 1.294431, "longitude": 103.775217},
                {"name": "UTOWN", "LongName": "University Town", "ShortName": "UTown", "latitude": 1.303876, "longitude": 103.774621},
            ]}}
        if path == "/api/service-description":
            return {"ServiceDescriptionResult": {"ServiceDescription": [{"Route": "D2"}]}}
        if path == "/api/pickup-point":
            assert params == {"route_code": "D2"}
            return {"PickupPointResult": {"pickuppoint": [
                {"seq": 1, "busstopcode": "COM3-D2-S", "LongName": "COM 3", "lat": 1.294431, "lng": 103.775217},
                {"seq": 2, "busstopcode": "MUSEUM", "LongName": "Museum", "lat": 1.301081, "lng": 103.77369},
                {"seq": 3, "busstopcode": "UTOWN", "LongName": "University Town", "lat": 1.303876, "lng": 103.774621},
            ]}}
        assert path == "/api/shuttle-service"
        if params == {"busstopname": "COM3"}:
            return {"ShuttleServiceResult": {"shuttles": [{
                "name": "D2", "busstopcode": "COM3-D2-S",
                "_etas": [
                    {"eta": 1, "eta_s": 60, "plate": "EARLY"},
                    {"eta": 6, "eta_s": 360, "plate": "NEXT"},
                ],
            }]}}
        assert params == {"busstopname": "UTOWN"}
        return {"ShuttleServiceResult": {"shuttles": [{
            "name": "D2", "busstopcode": "UTOWN",
            "_etas": [{"eta": 16, "eta_s": 960, "plate": "NEXT"}],
        }]}}

    monkeypatch.setattr(campus_bus_routes, "_fetch_payload", fake_fetch)

    response = await client.post(
        "/campus-bus/trips",
        headers=auth_headers(token),
        json={
            "from_name": "COM 3",
            "from_latitude": 1.294431,
            "from_longitude": 103.775217,
            "to_name": "University Town",
            "to_latitude": 1.303876,
            "to_longitude": 103.774621,
        },
    )

    assert response.status_code == 200
    route = response.json()["routes"][0]
    assert route["service"] == "D2"
    assert route["from_stop"]["id"] == "COM3"
    assert route["to_stop"]["id"] == "UTOWN"
    assert route["next_bus_minutes"] == 6
    assert route["bus_travel_minutes"] == 10
    assert route["travel_time_source"] == "live"
    assert route["stops_count"] == 2
    assert route["stops"] == ["COM 3", "Museum", "University Town"]
    assert route["total_minutes"] == 17
