import asyncio
import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, HTTPException, Query

from database import db
from dependencies import CurrentUser

router = APIRouter(prefix="/venues", tags=["venues"])

SGT = ZoneInfo("Asia/Singapore")
NUSMODS_API_BASE_URL = os.getenv("NUSMODS_API_BASE_URL", "https://api.nusmods.com/v2").rstrip("/")
NUSMODS_VENUES_LOCATIONS_URL = os.getenv(
    "NUSMODS_VENUES_LOCATIONS_URL",
    "https://raw.githubusercontent.com/nusmodifications/nusmods/master/website/src/data/venues.json",
)

VENUES_CACHE_TTL = timedelta(hours=24)
_cache: dict[str, tuple[datetime, dict]] = {}
_cache_lock = asyncio.Lock()

# Standard time slots from 08:00 to 22:00 in 30-minute intervals
TIME_SLOTS = [
    f"{hour:02d}{minute:02d}"
    for hour in range(8, 22)
    for minute in (0, 30)
]

# Approximate building centroids on NUS Kent Ridge / Bukit Timah campus as fallbacks
BUILDING_CENTROIDS: dict[str, tuple[float, float, str, str]] = {
    # Prefix: (lat, lon, Building Name, Faculty)
    "COM1": (1.29495, 103.77372, "School of Computing 1", "Computing"),
    "COM2": (1.29424, 103.77402, "School of Computing 2", "Computing"),
    "COM3": (1.29443, 103.77284, "School of Computing 3", "Computing"),
    "COM4": (1.29460, 103.77300, "School of Computing 4", "Computing"),
    "AS1": (1.29528, 103.77123, "Faculty of Arts & Social Sciences 1", "Arts & Social Sciences"),
    "AS2": (1.29505, 103.77085, "Faculty of Arts & Social Sciences 2", "Arts & Social Sciences"),
    "AS3": (1.29555, 103.77165, "Faculty of Arts & Social Sciences 3", "Arts & Social Sciences"),
    "AS4": (1.29580, 103.77210, "Faculty of Arts & Social Sciences 4", "Arts & Social Sciences"),
    "AS5": (1.29475, 103.77040, "Faculty of Arts & Social Sciences 5", "Arts & Social Sciences"),
    "AS6": (1.29532, 103.77265, "Faculty of Arts & Social Sciences 6", "Arts & Social Sciences"),
    "AS7": (1.29420, 103.77005, "Faculty of Arts & Social Sciences 7", "Arts & Social Sciences"),
    "AS8": (1.29380, 103.76970, "Faculty of Arts & Social Sciences 8", "Arts & Social Sciences"),
    "BIZ1": (1.29315, 103.77485, "Mochtar Riady Building (BIZ1)", "Business"),
    "BIZ2": (1.29375, 103.77445, "Biz 2 Building", "Business"),
    "E1": (1.30005, 103.77120, "Engineering Block E1", "Engineering"),
    "E2": (1.29975, 103.77160, "Engineering Block E2", "Engineering"),
    "E3": (1.29950, 103.77210, "Engineering Block E3", "Engineering"),
    "E4": (1.29910, 103.77240, "Engineering Block E4", "Engineering"),
    "E5": (1.29875, 103.77280, "Engineering Block E5", "Engineering"),
    "EA": (1.30040, 103.77050, "Engineering Block EA", "Engineering"),
    "EW1": (1.29840, 103.77180, "Engineering Workshop 1", "Engineering"),
    "EW2": (1.29810, 103.77220, "Engineering Workshop 2", "Engineering"),
    "S1": (1.29690, 103.78010, "Science Block S1", "Science"),
    "S2": (1.29650, 103.78040, "Science Block S2", "Science"),
    "S3": (1.29620, 103.78060, "Science Block S3", "Science"),
    "S4": (1.29590, 103.78090, "Science Block S4", "Science"),
    "S16": (1.29740, 103.77970, "Science Block S16", "Science"),
    "S17": (1.29785, 103.78035, "Science Block S17", "Science"),
    "MD1": (1.29540, 103.78180, "Tahir Foundation Building (MD1)", "Medicine"),
    "MD3": (1.29510, 103.78250, "Medicine MD3", "Medicine"),
    "MD6": (1.29470, 103.78310, "Centre for Translational Medicine (MD6)", "Medicine"),
    "MD11": (1.29410, 103.78220, "Medicine MD11", "Medicine"),
    "SDE1": (1.29780, 103.77020, "School of Design & Environment 1", "Design & Environment"),
    "SDE2": (1.29740, 103.77060, "School of Design & Environment 2", "Design & Environment"),
    "SDE3": (1.29710, 103.77090, "School of Design & Environment 3", "Design & Environment"),
    "SDE4": (1.29680, 103.77120, "School of Design & Environment 4", "Design & Environment"),
    "UT": (1.30390, 103.77400, "University Town (UTown)", "University Town"),
    "ERC": (1.30380, 103.77350, "Education Resource Centre (UTown)", "University Town"),
    "CLB": (1.29660, 103.77320, "Central Library", "Central Campus"),
    "YIH": (1.29850, 103.77450, "Yusof Ishak House", "Central Campus"),
    "LT": (1.29600, 103.77300, "Lecture Theatre", "General"),
}


def _current_academic_year(today: date | None = None) -> str:
    today = today or datetime.now(SGT).date()
    start_year = today.year if today.month >= 8 else today.year - 1
    return f"{start_year}-{start_year + 1}"


def _current_semester(today: date | None = None) -> int:
    today = today or datetime.now(SGT).date()
    # Sem 1: Aug to Dec, Sem 2: Jan to May, Special Term: Jun to Jul
    if 8 <= today.month <= 12:
        return 1
    elif 1 <= today.month <= 5:
        return 2
    elif today.month == 6:
        return 3
    else:
        return 4


def _distance_in_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _walking_minutes(distance_metres: float) -> int:
    # Average walking speed ~ 80 metres per minute
    return max(1, math.ceil(distance_metres / 80.0))


async def _get_persistent_cache(key: str) -> tuple[dict | None, datetime | None]:
    try:
        row = await db.fetch_one(
            query="""
                SELECT data, fetched_at
                FROM native_api_cache
                WHERE cache_key = :cache_key
            """,
            values={"cache_key": f"venues:{key}"},
        )
        if not row:
            return None, None
        data = json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]
        fetched_at = row["fetched_at"]
        if isinstance(fetched_at, str):
            fetched_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        return data if isinstance(data, dict) else None, fetched_at
    except Exception:
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
            values={"cache_key": f"venues:{key}", "data": json.dumps(payload)},
        )
    except Exception:
        pass


def _is_fresh(fetched_at: datetime | None, ttl: timedelta) -> bool:
    if not fetched_at:
        return False
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched_at < ttl


async def _fetch_venue_info(academic_year: str, semester: int) -> dict:
    key = f"info:{academic_year}:{semester}"
    now = datetime.now(timezone.utc)

    async with _cache_lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < VENUES_CACHE_TTL:
            return cached[1]

    persistent_payload, fetched_at = await _get_persistent_cache(key)
    if persistent_payload is not None and _is_fresh(fetched_at, VENUES_CACHE_TTL):
        async with _cache_lock:
            _cache[key] = (now, persistent_payload)
        return persistent_payload

    # Try requested AY & Semester, fallback to alternate semester or previous AY if 404
    candidate_urls = [
        f"{NUSMODS_API_BASE_URL}/{academic_year}/semesters/{semester}/venueInformation.json",
        f"{NUSMODS_API_BASE_URL}/{academic_year}/semesters/{1 if semester == 2 else 2}/venueInformation.json",
        f"{NUSMODS_API_BASE_URL}/2024-2025/semesters/{semester}/venueInformation.json",
        f"{NUSMODS_API_BASE_URL}/2024-2025/semesters/1/venueInformation.json",
    ]

    payload = None
    async with httpx.AsyncClient(timeout=12.0) as client:
        for url in candidate_urls:
            try:
                response = await client.get(url, headers={"Accept": "application/json"})
                if response.status_code == 200:
                    payload = response.json()
                    break
            except Exception:
                continue

    if payload is None or not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail="NUSMods venue schedule information is temporarily unavailable. Please try again shortly.",
        )

    async with _cache_lock:
        _cache[key] = (now, payload)
    await _save_persistent_cache(key, payload)
    return payload


async def _fetch_venue_locations() -> dict:
    key = "locations"
    now = datetime.now(timezone.utc)

    async with _cache_lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < VENUES_CACHE_TTL:
            return cached[1]

    persistent_payload, fetched_at = await _get_persistent_cache(key)
    if persistent_payload is not None and _is_fresh(fetched_at, VENUES_CACHE_TTL):
        async with _cache_lock:
            _cache[key] = (now, persistent_payload)
        return persistent_payload

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(NUSMODS_VENUES_LOCATIONS_URL, headers={"Accept": "application/json"})
            response.raise_for_status()
            payload = response.json()
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail="NUSMods venue locations data is temporarily unavailable.",
        ) from error

    async with _cache_lock:
        _cache[key] = (now, payload)
    await _save_persistent_cache(key, payload)
    return payload


def _infer_faculty_and_building(venue_code: str) -> tuple[str, str, str]:
    """Infers (Building Prefix, Building Name, Faculty) from a venue code."""
    code = venue_code.upper().strip()

    for prefix, (_, _, bldg_name, faculty) in BUILDING_CENTROIDS.items():
        if code.startswith(prefix):
            return prefix, bldg_name, faculty

    if code.startswith("LT"):
        return "LT", f"Lecture Theatre {code[2:]}", "General"
    if code.startswith("E"):
        return "ENG", "Engineering Campus", "Engineering"
    if code.startswith("S"):
        return "SCI", "Science Campus", "Science"
    if code.startswith("MD"):
        return "MED", "Medicine Campus", "Medicine"
    if code.startswith("AS"):
        return "FASS", "Arts & Social Sciences", "Arts & Social Sciences"
    if code.startswith("BIZ"):
        return "BIZ", "Business School", "Business"
    if code.startswith("COM"):
        return "SOC", "School of Computing", "Computing"
    if code.startswith("UT"):
        return "UTOWN", "University Town", "University Town"

    return "OTHER", "NUS Kent Ridge", "General"


def _get_venue_coordinates(venue_code: str, locations: dict) -> tuple[float | None, float | None, str, int | None]:
    loc_entry = locations.get(venue_code)
    if loc_entry and isinstance(loc_entry, dict):
        coords = loc_entry.get("location")
        room_name = loc_entry.get("roomName") or venue_code
        floor = loc_entry.get("floor")
        if coords and isinstance(coords, dict) and "y" in coords and "x" in coords:
            return float(coords["y"]), float(coords["x"]), str(room_name), floor

    # Fallback to building centroid if room coordinate is not individually mapped
    for prefix, (lat, lon, bldg_name, _) in BUILDING_CENTROIDS.items():
        if venue_code.upper().startswith(prefix):
            return lat, lon, f"{venue_code} ({bldg_name})", None

    return None, None, venue_code, None


def _calculate_slot_availability(
    venue_schedule: list[dict],
    target_day: str,
    target_time: str,
) -> dict:
    """Calculates status at target_time, vacancy duration, next class, and full day slots."""
    day_data = next((d for d in venue_schedule if d.get("day", "").lower() == target_day.lower()), None)

    slots: dict[str, str] = {}
    classes = day_data.get("classes", []) if day_data else []
    raw_avail = day_data.get("availability", {}) if day_data else {}

    for slot in TIME_SLOTS:
        slots[slot] = raw_avail.get(slot, "vacant")

    is_currently_vacant = slots.get(target_time, "vacant") == "vacant"
    target_idx = TIME_SLOTS.index(target_time) if target_time in TIME_SLOTS else 0

    # Calculate free until
    free_until = "2200"
    free_minutes = 0
    current_lesson = None
    next_lesson = None

    if is_currently_vacant:
        # Find first occupied slot after target_time
        for i in range(target_idx, len(TIME_SLOTS)):
            slot = TIME_SLOTS[i]
            if slots[slot] == "occupied":
                free_until = slot
                break
        
        # Free minutes calculation
        target_minutes = int(target_time[:2]) * 60 + int(target_time[2:])
        until_minutes = int(free_until[:2]) * 60 + int(free_until[2:])
        free_minutes = max(0, until_minutes - target_minutes)

        # Next upcoming class
        for c in classes:
            c_start = c.get("startTime", "0000")
            if c_start >= target_time:
                if not next_lesson or c_start < next_lesson.get("startTime", "9999"):
                    next_lesson = c
    else:
        # Currently occupied - find when it becomes vacant and current class
        for c in classes:
            c_start = c.get("startTime", "0000")
            c_end = c.get("endTime", "0000")
            if c_start <= target_time < c_end:
                current_lesson = c
                break

        # Next lesson
        for c in classes:
            c_start = c.get("startTime", "0000")
            if c_start > target_time:
                if not next_lesson or c_start < next_lesson.get("startTime", "9999"):
                    next_lesson = c

    return {
        "is_free": is_currently_vacant,
        "free_until": free_until if is_currently_vacant else None,
        "free_minutes": free_minutes if is_currently_vacant else 0,
        "current_lesson": current_lesson,
        "next_lesson": next_lesson,
        "slots": slots,
        "classes_today": classes,
    }


@router.get("/info")
async def get_venues_info(
    _: CurrentUser,
    academic_year: str | None = Query(None, pattern=r"^\d{4}-\d{4}$"),
    semester: int | None = Query(None, ge=1, le=4),
):
    ay = academic_year or _current_academic_year()
    sem = semester or _current_semester()
    info = await _fetch_venue_info(ay, sem)
    return {
        "academic_year": ay,
        "semester": sem,
        "total_venues": len(info),
        "venues": info,
    }


@router.get("/locations")
async def get_venues_locations(_: CurrentUser):
    locations = await _fetch_venue_locations()
    return {
        "total_locations": len(locations),
        "locations": locations,
        "building_centroids": BUILDING_CENTROIDS,
    }


@router.get("/availability")
async def search_free_venues(
    _: CurrentUser,
    day: str | None = Query(None, description="Day of week, e.g. Monday"),
    time_str: str | None = Query(None, alias="time", pattern=r"^\d{4}$", description="Time slot, e.g. 1130"),
    lat: float | None = Query(None, ge=-90, le=90, description="User latitude"),
    lon: float | None = Query(None, ge=-180, le=180, description="User longitude"),
    faculty: str | None = Query(None, description="Filter by faculty name"),
    building: str | None = Query(None, description="Filter by building prefix, e.g. COM1"),
    query: str | None = Query(None, max_length=100, description="Search room name or code"),
    min_free_minutes: int | None = Query(None, ge=0, description="Minimum free duration in minutes"),
    only_free: bool = Query(True, description="Only return currently free rooms"),
    sort: str = Query("distance", pattern=r"^(distance|duration|name)$"),
    academic_year: str | None = Query(None, pattern=r"^\d{4}-\d{4}$"),
    semester: int | None = Query(None, ge=1, le=4),
):
    now_sgt = datetime.now(SGT)
    target_day = day or now_sgt.strftime("%A")

    if not time_str:
        rounded_min = 30 if now_sgt.minute >= 30 else 0
        hour = min(max(now_sgt.hour, 8), 21)
        target_time = f"{hour:02d}{rounded_min:02d}"
    else:
        target_time = time_str

    ay = academic_year or _current_academic_year()
    sem = semester or _current_semester()

    info_payload, locations_payload = await asyncio.gather(
        _fetch_venue_info(ay, sem),
        _fetch_venue_locations(),
    )

    results = []
    normalised_query = query.lower().strip() if query else ""
    normalised_faculty = faculty.lower().strip() if faculty else ""
    normalised_building = building.upper().strip() if building else ""

    for venue_code, schedule in info_payload.items():
        v_lat, v_lon, room_name, floor = _get_venue_coordinates(venue_code, locations_payload)
        bldg_prefix, bldg_name, v_faculty = _infer_faculty_and_building(venue_code)

        # Filters
        if normalised_faculty and normalised_faculty not in v_faculty.lower():
            continue
        if normalised_building and not venue_code.upper().startswith(normalised_building):
            continue
        if normalised_query:
            match_code = normalised_query in venue_code.lower()
            match_room = normalised_query in room_name.lower()
            match_bldg = normalised_query in bldg_name.lower()
            if not (match_code or match_room or match_bldg):
                continue

        # Availability
        avail = _calculate_slot_availability(schedule, target_day, target_time)

        if only_free and not avail["is_free"]:
            continue
        if min_free_minutes and avail["free_minutes"] < min_free_minutes:
            continue

        # Distance calculation if user coords provided
        distance_m = None
        walking_mins = None
        if lat is not None and lon is not None and v_lat is not None and v_lon is not None:
            distance_m = round(_distance_in_metres(lat, lon, v_lat, v_lon))
            walking_mins = _walking_minutes(distance_m)

        results.append({
            "venue_code": venue_code,
            "room_name": room_name,
            "floor": floor,
            "building_prefix": bldg_prefix,
            "building_name": bldg_name,
            "faculty": v_faculty,
            "latitude": v_lat,
            "longitude": v_lon,
            "distance_metres": distance_m,
            "walking_minutes": walking_mins,
            "is_free": avail["is_free"],
            "free_until": avail["free_until"],
            "free_minutes": avail["free_minutes"],
            "current_lesson": avail["current_lesson"],
            "next_lesson": avail["next_lesson"],
            "slots": avail["slots"],
            "classes_count": len(avail["classes_today"]),
        })

    # Sort results
    if sort == "distance":
        results.sort(
            key=lambda r: (
                r["distance_metres"] is None,
                r["distance_metres"] if r["distance_metres"] is not None else float("inf"),
                -r["free_minutes"],
                r["venue_code"],
            )
        )
    elif sort == "duration":
        results.sort(
            key=lambda r: (
                -r["free_minutes"],
                r["distance_metres"] if r["distance_metres"] is not None else float("inf"),
                r["venue_code"],
            )
        )
    elif sort == "name":
        results.sort(key=lambda r: r["venue_code"])

    return {
        "day": target_day,
        "time": target_time,
        "academic_year": ay,
        "semester": sem,
        "total_matches": len(results),
        "results": results,
    }
