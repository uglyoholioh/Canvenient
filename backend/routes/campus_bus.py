import asyncio
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from database import db
from dependencies import CurrentUser

router = APIRouter(prefix="/campus-bus", tags=["campus-bus"])

# The official uNivUS arrival feed is not publicly documented. This relay is
# configurable so it can be replaced without changing the client contract.
NUS_BUS_API_BASE_URL = os.getenv("NUS_BUS_API_BASE_URL", "https://nusbus.app").rstrip("/")
NUS_MAP_SEARCH_URL = os.getenv(
    "NUS_MAP_SEARCH_URL",
    "https://map.nus.edu.sg/index.php/search/ajax_auto",
)
STOPS_CACHE_TTL = timedelta(hours=24)
ROUTES_CACHE_TTL = timedelta(hours=12)
PLACES_CACHE_TTL = timedelta(minutes=30)
ARRIVALS_CACHE_TTL = timedelta(seconds=20)
# Stops further than this from the user's position are excluded from route candidates.
# NavUS (kleonang/NavUS CalculatePath.py) uses MAX_DIST=0.0015° Euclidean ≈ 167 m.
# We use Haversine, so the equivalent generous threshold is ~400 m. If no stop falls
# within the cutoff the single nearest stop is used as a fallback.
MAX_WALK_METRES = 400
# Number of nearest boarding / alighting stop candidates to consider — matches NavUS's
# NUM_SOURCES = NUM_DESTS = 3.
MAX_STOP_CANDIDATES = 3
# Walking speed per NavUS's get_walking_time(): 4 km/h = 66.67 m/min.
WALK_SPEED_M_PER_MIN: float = 4000 / 60
# Campus bus cruising speed used to estimate in-bus travel time.
BUS_SPEED_M_PER_MIN: float = 18000 / 60

_cache: dict[str, tuple[datetime, dict]] = {}
_cache_lock = asyncio.Lock()


class CampusTripRequest(BaseModel):
    from_name: str = Field(min_length=1, max_length=160)
    from_latitude: float = Field(ge=-90, le=90)
    from_longitude: float = Field(ge=-180, le=180)
    to_name: str = Field(min_length=1, max_length=160)
    to_latitude: float = Field(ge=-90, le=90)
    to_longitude: float = Field(ge=-180, le=180)


async def _fetch_payload(path: str, params: dict[str, str] | None = None) -> dict:
    # The public relay intermittently serves 502s (roughly one call in four),
    # so retry briefly before surfacing an error to clients.
    last_error: Exception | None = None
    for attempt in range(3):
        if attempt:
            await asyncio.sleep(0.5 * attempt)
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(
                    f"{NUS_BUS_API_BASE_URL}{path}",
                    params=params,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                if isinstance(data, dict) and (data.get("result") is False or data.get("error") is not None):
                    raise ValueError(f"API Error: {data.get('message', 'Unknown error')}")
                return data
        except (httpx.HTTPError, ValueError) as error:
            last_error = error
    raise HTTPException(
        status_code=502,
        detail="NUS bus timings are temporarily unavailable. Please try again shortly.",
    ) from last_error


def _cache_ttl(key: str) -> timedelta:
    if key == "stops":
        return STOPS_CACHE_TTL
    if key == "services" or key.startswith("route:"):
        return ROUTES_CACHE_TTL
    if key.startswith("places:"):
        return PLACES_CACHE_TTL
    return ARRIVALS_CACHE_TTL


async def _get_persistent_cache(key: str) -> tuple[dict | None, datetime | None]:
    try:
        row = await db.fetch_one(
            query="""
                SELECT data, fetched_at
                FROM native_api_cache
                WHERE cache_key = :cache_key
            """,
            values={"cache_key": f"campus-bus:{key}"},
        )
        if not row:
            return None, None
        data = json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]
        fetched_at = row["fetched_at"]
        if isinstance(fetched_at, str):
            fetched_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        return data if isinstance(data, dict) else None, fetched_at
    except Exception:
        # Cache persistence must never prevent the live transit feed from loading.
        return None, None


async def _save_persistent_cache(key: str, payload: dict) -> None:
    try:
        is_sqlite = "sqlite" in str(db.url).lower()
        timestamp = "CURRENT_TIMESTAMP" if is_sqlite else "NOW()"
        await db.execute(
            query=f"""
                INSERT INTO native_api_cache (cache_key, data, fetched_at)
                VALUES (:cache_key, :data, {timestamp})
                ON CONFLICT (cache_key)
                DO UPDATE SET data = EXCLUDED.data, fetched_at = {timestamp}
            """,
            values={"cache_key": f"campus-bus:{key}", "data": json.dumps(payload)},
        )
    except Exception:
        pass


def _is_fresh(fetched_at: datetime | None, ttl: timedelta) -> bool:
    if not fetched_at:
        return False
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched_at < ttl


async def _cached_payload(key: str, path: str, params: dict[str, str] | None = None) -> dict:
    now = datetime.now(timezone.utc)
    ttl = _cache_ttl(key)
    async with _cache_lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < ttl:
            return cached[1]

    persistent_payload, fetched_at = await _get_persistent_cache(key)
    if persistent_payload is not None and _is_fresh(fetched_at, ttl):
        async with _cache_lock:
            _cache[key] = (now, persistent_payload)
        return persistent_payload

    payload = await _fetch_payload(path, params)
    async with _cache_lock:
        _cache[key] = (now, payload)
    await _save_persistent_cache(key, payload)
    return payload


def _arrival_minutes(raw_eta) -> int | None:
    try:
        return max(0, int(float(raw_eta)))
    except (TypeError, ValueError):
        return None


def _distance_in_metres(latitude: float, longitude: float, stop: dict) -> float:
    stop_latitude = stop.get("latitude")
    stop_longitude = stop.get("longitude")
    if not isinstance(stop_latitude, (int, float)) or not isinstance(stop_longitude, (int, float)):
        return math.inf
    latitude_delta = math.radians(stop_latitude - latitude)
    longitude_delta = math.radians(stop_longitude - longitude)
    origin_latitude = math.radians(latitude)
    destination_latitude = math.radians(stop_latitude)
    a = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(origin_latitude) * math.cos(destination_latitude) * math.sin(longitude_delta / 2) ** 2
    )
    return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalise_stops(payload: dict) -> list[dict]:
    stops = payload.get("BusStopsResult", {}).get("busstops", [])
    return [
        {
            "id": stop["name"],
            "name": stop.get("LongName") or stop.get("caption") or stop["name"],
            "short_name": stop.get("ShortName") or stop["name"],
            "latitude": stop.get("latitude"),
            "longitude": stop.get("longitude"),
        }
        for stop in stops
        if isinstance(stop, dict) and stop.get("name")
    ]


def _normalise_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _route_stop_id(raw_code: object, service: str) -> str:
    code = str(raw_code or "").strip()
    return re.sub(rf"-{re.escape(service)}-[SE]$", "", code, flags=re.IGNORECASE)


def _normalise_route_stops(payload: dict, service: str) -> list[dict]:
    raw_stops = payload.get("PickupPointResult", {}).get("pickuppoint", [])
    stops = []
    for raw_stop in raw_stops:
        if not isinstance(raw_stop, dict):
            continue
        stop_id = _route_stop_id(raw_stop.get("busstopcode"), service)
        latitude = raw_stop.get("lat")
        longitude = raw_stop.get("lng")
        if not stop_id or not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            continue
        stops.append(
            {
                "id": stop_id,
                "name": raw_stop.get("LongName") or raw_stop.get("pickupname") or stop_id,
                "latitude": latitude,
                "longitude": longitude,
                "sequence": int(raw_stop.get("seq") or 0),
            }
        )
    return sorted(stops, key=lambda stop: stop["sequence"])


def _route_segment(route_stops: list[dict], origin_id: str, destination_id: str) -> list[dict] | None:
    best = None
    for origin_index, stop in enumerate(route_stops):
        if stop["id"] != origin_id:
            continue
        for destination_index in range(origin_index + 1, len(route_stops)):
            if route_stops[destination_index]["id"] != destination_id:
                continue
            segment = route_stops[origin_index : destination_index + 1]
            if best is None or len(segment) < len(best):
                best = segment
            break
    return best


def _estimated_travel_minutes(segment: list[dict]) -> int:
    distance = sum(
        _distance_in_metres(stop["latitude"], stop["longitude"], next_stop)
        for stop, next_stop in zip(segment, segment[1:], strict=False)
    )
    moving_minutes = distance / BUS_SPEED_M_PER_MIN
    dwell_minutes = max(0, len(segment) - 2) * 0.55
    return max(2, math.ceil(moving_minutes + dwell_minutes))


def _service_etas(payload: dict, service: str, stop_id: str) -> list[dict]:
    shuttles = payload.get("ShuttleServiceResult", {}).get("shuttles", [])
    matching = []
    fallback = []
    for shuttle in shuttles:
        if not isinstance(shuttle, dict) or str(shuttle.get("name") or "").strip() != service:
            continue
        etas = [eta for eta in shuttle.get("_etas", []) if isinstance(eta, dict)]
        fallback.extend(etas)
        if _route_stop_id(shuttle.get("busstopcode"), service) == stop_id:
            matching.extend(etas)
    return matching or fallback


def _live_travel_minutes(origin_etas: list[dict], destination_etas: list[dict]) -> int | None:
    destination_by_plate = {
        str(eta.get("plate")): eta
        for eta in destination_etas
        if eta.get("plate") and isinstance(eta.get("eta_s"), (int, float))
    }
    durations = []
    for eta in origin_etas:
        plate = str(eta.get("plate") or "")
        destination_eta = destination_by_plate.get(plate)
        if not destination_eta or not isinstance(eta.get("eta_s"), (int, float)):
            continue
        duration_seconds = destination_eta["eta_s"] - eta["eta_s"]
        if 60 <= duration_seconds <= 3600:
            durations.append(math.ceil(duration_seconds / 60))
    return min(durations) if durations else None


async def _fetch_place_results(query: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                NUS_MAP_SEARCH_URL,
                params={"maxrows": "8", "qword": query},
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, list) else []
    except (httpx.HTTPError, ValueError):
        return []


@router.get("/stops")
async def list_bus_stops(_: CurrentUser):
    payload = await _cached_payload("stops", "/api/bus-stops")
    return {"stops": _normalise_stops(payload)}


@router.get("/places")
async def search_campus_places(
    _: CurrentUser,
    q: str = Query(min_length=2, max_length=100),
):
    query = " ".join(q.split())
    stop_payload = await _cached_payload("stops", "/api/bus-stops")
    stops = _normalise_stops(stop_payload)
    normalised_query = _normalise_text(query)

    matching_stops = []
    for stop in stops:
        fields = [stop["id"], stop["name"], stop["short_name"]]
        if any(normalised_query in _normalise_text(str(field)) for field in fields):
            matching_stops.append(
                {
                    "id": f"bus-stop:{stop['id']}",
                    "name": stop["name"],
                    "subtitle": f"NUS ISB stop · {stop['short_name']}",
                    "latitude": stop["latitude"],
                    "longitude": stop["longitude"],
                    "kind": "bus_stop",
                    "stop_id": stop["id"],
                }
            )

    raw_places = await _fetch_place_results(query)
    places = []
    seen = {
        (_normalise_text(place["name"]), round(float(place["latitude"]), 5), round(float(place["longitude"]), 5))
        for place in matching_stops
        if isinstance(place.get("latitude"), (int, float)) and isinstance(place.get("longitude"), (int, float))
    }
    for raw_place in raw_places:
        if not isinstance(raw_place, dict):
            continue
        try:
            latitude = float(raw_place.get("lat"))
            longitude = float(raw_place.get("long"))
        except (TypeError, ValueError):
            continue
        name = str(raw_place.get("place_name") or "").strip()
        if not name or not (1.2 <= latitude <= 1.45 and 103.6 <= longitude <= 104.1):
            continue
        dedupe_key = (_normalise_text(name), round(latitude, 5), round(longitude, 5))
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        subtitle_parts = [
            str(raw_place.get("location_name") or "").strip(),
            str(raw_place.get("campus_name") or "").strip(),
        ]
        places.append(
            {
                "id": f"{raw_place.get('tbl') or 'place'}:{raw_place.get('id') or len(places)}",
                "name": name,
                "subtitle": next((part for part in subtitle_parts if part and part != name), "NUS campus location"),
                "latitude": latitude,
                "longitude": longitude,
                "kind": "location",
            }
        )

    def result_rank(place: dict):
        name = _normalise_text(place["name"])
        return (
            0 if name == normalised_query else 1 if name.startswith(normalised_query) else 2,
            0 if place["kind"] == "bus_stop" else 1,
            len(name),
        )

    return {"places": sorted([*matching_stops, *places], key=result_rank)[:10]}


@router.get("/arrivals")
async def list_bus_arrivals(
    _: CurrentUser,
    stop: str = Query(min_length=1, max_length=80),
):
    stop_id = stop.strip()
    payload = await _cached_payload(
        f"arrivals:{stop_id}",
        "/api/shuttle-service",
        {"busstopname": stop_id},
    )
    result = payload.get("ShuttleServiceResult", {})
    arrivals = []
    seen_services = set()
    for shuttle in result.get("shuttles", []):
        if not isinstance(shuttle, dict):
            continue
        service = str(shuttle.get("name") or "").strip()
        if not service or service in seen_services:
            continue
        seen_services.add(service)
        minutes = [
            minute
            for eta in shuttle.get("_etas", [])[:3]
            if (minute := _arrival_minutes(eta.get("eta") if isinstance(eta, dict) else None)) is not None
        ]
        if not minutes:
            minutes = [
                minute
                for eta in (shuttle.get("arrivalTime"), shuttle.get("nextArrivalTime"))
                if (minute := _arrival_minutes(eta)) is not None
            ]
        arrivals.append({"service": service, "minutes": minutes})

    return {
        "stop": {
            "id": result.get("name") or stop_id,
            "name": result.get("caption") or stop_id,
        },
        "arrivals": arrivals,
        "updated_at": result.get("TimeStamp"),
    }


@router.post("/trips")
async def plan_campus_trip(payload: CampusTripRequest, _: CurrentUser):
    stop_payload, services_payload = await asyncio.gather(
        _cached_payload("stops", "/api/bus-stops"),
        _cached_payload("services", "/api/service-description"),
    )
    stops = _normalise_stops(stop_payload)
    if not stops:
        raise HTTPException(status_code=502, detail="NUS bus stops are temporarily unavailable.")

    services = [
        str(service.get("Route") or "").strip()
        for service in services_payload.get("ServiceDescriptionResult", {}).get("ServiceDescription", [])
        if isinstance(service, dict) and service.get("Route")
    ]
    if not services:
        raise HTTPException(status_code=502, detail="NUS bus routes are temporarily unavailable.")

    route_payloads = await asyncio.gather(
        *[_cached_payload(f"route:{service}", "/api/pickup-point", {"route_code": service}) for service in services]
    )
    routes = {
        service: _normalise_route_stops(route_payload, service)
        for service, route_payload in zip(services, route_payloads, strict=False)
    }

    all_origins = sorted(
        (
            {**stop, "distance": _distance_in_metres(payload.from_latitude, payload.from_longitude, stop)}
            for stop in stops
        ),
        key=lambda stop: stop["distance"],
    )
    all_destinations = sorted(
        ({**stop, "distance": _distance_in_metres(payload.to_latitude, payload.to_longitude, stop)} for stop in stops),
        key=lambda stop: stop["distance"],
    )
    # Restrict candidates to stops within walking distance. Always keep the
    # nearest stop as a fallback so a cutoff never produces an empty result.
    # MAX_STOP_CANDIDATES = 3 matches NavUS's NUM_SOURCES / NUM_DESTS.
    nearest_origins = [s for s in all_origins[:MAX_STOP_CANDIDATES] if s["distance"] <= MAX_WALK_METRES] or all_origins[
        :1
    ]
    nearest_destinations = [
        s for s in all_destinations[:MAX_STOP_CANDIDATES] if s["distance"] <= MAX_WALK_METRES
    ] or all_destinations[:1]

    candidates = []
    for service, route_stops in routes.items():
        for origin in nearest_origins:
            for destination in nearest_destinations:
                if origin["id"] == destination["id"]:
                    continue
                segment = _route_segment(route_stops, origin["id"], destination["id"])
                if not segment:
                    continue
                route_distance = sum(
                    _distance_in_metres(stop["latitude"], stop["longitude"], next_stop)
                    for stop, next_stop in zip(segment, segment[1:], strict=False)
                )
                candidates.append(
                    {
                        "service": service,
                        "origin": origin,
                        "destination": destination,
                        "segment": segment,
                        "route_distance": route_distance,
                        # Destination proximity is weighted 1.5× — passengers care more
                        # about where they get off than where they board. The final sort
                        # by total_minutes naturally handles cases where the closest
                        # destination stop has a significantly worse bus wait time.
                        # The bus-distance multiplier converts route metres to an equivalent
                        # walk-metre cost using the speed ratio (walk ÷ bus).
                        "geometric_score": origin["distance"]
                        + destination["distance"] * 1.5
                        + route_distance * (WALK_SPEED_M_PER_MIN / BUS_SPEED_M_PER_MIN),
                    }
                )

    candidates.sort(key=lambda candidate: candidate["geometric_score"])
    unique_candidates = []
    seen_candidates = set()
    for candidate in candidates:
        key = (candidate["service"], candidate["origin"]["id"], candidate["destination"]["id"])
        if key in seen_candidates:
            continue
        seen_candidates.add(key)
        unique_candidates.append(candidate)
        if len(unique_candidates) == 8:
            break

    if not unique_candidates:
        return {
            "from": payload.from_name,
            "to": payload.to_name,
            "routes": [],
            "message": "No direct NUS ISB route was found between nearby stops.",
        }

    arrival_stop_ids = sorted(
        {candidate[side]["id"] for candidate in unique_candidates for side in ("origin", "destination")}
    )
    arrival_payloads = await asyncio.gather(
        *[
            _cached_payload(
                f"arrivals:{stop_id}",
                "/api/shuttle-service",
                {"busstopname": stop_id},
            )
            for stop_id in arrival_stop_ids
        ]
    )
    arrivals_by_stop = dict(zip(arrival_stop_ids, arrival_payloads, strict=False))

    now = datetime.now(timezone.utc)
    planned_routes = []
    for candidate in unique_candidates:
        service = candidate["service"]
        origin = candidate["origin"]
        destination = candidate["destination"]
        origin_etas = _service_etas(arrivals_by_stop[origin["id"]], service, origin["id"])
        destination_etas = _service_etas(arrivals_by_stop[destination["id"]], service, destination["id"])
        live_travel_minutes = _live_travel_minutes(origin_etas, destination_etas)
        bus_travel_minutes = live_travel_minutes or _estimated_travel_minutes(candidate["segment"])
        walk_to_stop_minutes = max(1, math.ceil(origin["distance"] / WALK_SPEED_M_PER_MIN))
        walk_from_stop_minutes = max(1, math.ceil(destination["distance"] / WALK_SPEED_M_PER_MIN))
        arrival_minutes = sorted(
            minute for eta in origin_etas if (minute := _arrival_minutes(eta.get("eta"))) is not None
        )
        wait_minutes = next(
            (minute for minute in arrival_minutes if minute >= walk_to_stop_minutes + 1),
            None,
        )
        effective_wait = wait_minutes if wait_minutes is not None else max(15, walk_to_stop_minutes + 5)
        stop_arrival_minutes = effective_wait + bus_travel_minutes
        total_minutes = stop_arrival_minutes + walk_from_stop_minutes
        planned_routes.append(
            {
                "service": service,
                "from_stop": {"id": origin["id"], "name": origin["name"]},
                "to_stop": {"id": destination["id"], "name": destination["name"]},
                "walking_to_stop_metres": round(origin["distance"]),
                "walking_from_stop_metres": round(destination["distance"]),
                "next_bus_minutes": wait_minutes,
                "bus_travel_minutes": bus_travel_minutes,
                "travel_time_source": "live" if live_travel_minutes else "estimated",
                "stops_count": len(candidate["segment"]) - 1,
                "stops": [stop["name"] for stop in candidate["segment"]],
                "stop_arrival_at": (now + timedelta(minutes=stop_arrival_minutes)).isoformat(),
                "destination_arrival_at": (now + timedelta(minutes=total_minutes)).isoformat(),
                "total_minutes": total_minutes,
            }
        )

    planned_routes.sort(
        key=lambda route: (
            route["next_bus_minutes"] is None,
            route["total_minutes"],
            route["stops_count"],
        )
    )
    return {
        "from": payload.from_name,
        "to": payload.to_name,
        "routes": planned_routes[:3],
        "updated_at": now.isoformat(),
    }
