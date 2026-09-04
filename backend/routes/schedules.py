# pyrefly: ignore [missing-import]
import asyncio
import re
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import parse_qs, quote, urlparse

import httpx
from dateutil.rrule import rruleset, rrulestr
from fastapi import APIRouter, HTTPException, Response, UploadFile, status
from icalendar import Calendar
from pydantic import BaseModel
from zoneinfo import ZoneInfo

from database import db
from dependencies import CurrentUser
from models.schedule import ScheduleOut
from module_colors import ensure_discovered_module_colors, ensure_module_colors

router = APIRouter(prefix="/schedule", tags=["schedule"])

SGT = ZoneInfo("Asia/Singapore")
NUSMODS_HOSTS = {"nusmods.com", "www.nusmods.com"}
NUSMODS_SHORT_HOSTS = {"modsn.us", "www.modsn.us"}
NUSMODS_MODULE_PATTERN = re.compile(r"^[A-Z]{1,6}\d{4}[A-Z]*$")
LESSON_ABBREV_TYPE = {
    "DLEC": "Design Lecture",
    "LAB": "Laboratory",
    "LEC": "Lecture",
    "PLAB": "Packaged Laboratory",
    "PLEC": "Packaged Lecture",
    "PTUT": "Packaged Tutorial",
    "REC": "Recitation",
    "SEC": "Sectional Teaching",
    "SEM": "Seminar-Style Module Class",
    "TUT": "Tutorial",
    "TUT2": "Tutorial Type 2",
    "TUT3": "Tutorial Type 3",
    "WS": "Workshop",
}
DAY_OFFSETS = {
    "Monday": 0,
    "Tuesday": 1,
    "Wednesday": 2,
    "Thursday": 3,
    "Friday": 4,
    "Saturday": 5,
    "Sunday": 6,
}
DAY_ABBREVIATIONS = {
    "MON": "Monday",
    "TUE": "Tuesday",
    "WED": "Wednesday",
    "THU": "Thursday",
    "FRI": "Friday",
    "SAT": "Saturday",
    "SUN": "Sunday",
}

# Official NUSMods semester starts. Older/future years use a conservative Monday fallback.
SEMESTER_STARTS = {
    "2024/2025": {1: date(2024, 8, 12), 2: date(2025, 1, 13), 3: date(2025, 5, 12), 4: date(2025, 6, 23)},
    "2025/2026": {1: date(2025, 8, 11), 2: date(2026, 1, 12), 3: date(2026, 5, 11), 4: date(2026, 6, 22)},
    "2026/2027": {1: date(2026, 8, 10), 2: date(2027, 1, 11), 3: date(2027, 5, 10), 4: date(2027, 6, 21)},
}
NUS_HOLIDAYS = {
    date.fromisoformat(value)
    for value in (
        "2024-08-09", "2024-10-31", "2024-11-01", "2024-12-25",
        "2025-01-01", "2025-01-29", "2025-01-30", "2025-03-31", "2025-04-18",
        "2025-05-01", "2025-05-12", "2025-06-07", "2025-08-09", "2025-10-20",
        "2025-10-21", "2025-12-25", "2026-01-01", "2026-02-17", "2026-02-18",
        "2026-03-21", "2026-04-03", "2026-05-01", "2026-05-27", "2026-06-01",
        "2026-08-09", "2026-08-10", "2026-10-09", "2026-11-08", "2026-11-09",
        "2026-12-25", "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08",
        "2027-03-10", "2027-03-26", "2027-05-01", "2027-05-17", "2027-05-20",
    )
}


class NUSModsImportRequest(BaseModel):
    url: str


def class_occurrence_key(record, occurrence_date: date) -> str:
    return "|".join((
        str(record["module_code"] or "").strip().upper(),
        occurrence_date.isoformat() if hasattr(occurrence_date, "isoformat") else str(occurrence_date),
        str(record["start_time"] or ""),
        str(record["lesson_type"] or "").strip().lower(),
        str(record["class_no"] or "").strip().upper(),
    ))


def class_series_key(record) -> str:
    return "|".join((
        str(record["module_code"] or "").strip().upper(),
        "recurring",
        str(record["start_time"] or ""),
        str(record["lesson_type"] or "").strip().lower(),
        str(record["class_no"] or "").strip().upper(),
    ))


def class_summary(record) -> str:
    details = str(record["lesson_type"] or "Class").strip()
    if record["class_no"]:
        details = f"{details} [{record['class_no']}]"
    return f"{record['module_code']} {details}"


async def class_occurrence_for_user(class_id: int, occurrence_date: date, user_id: int):
    record = await db.fetch_one(
        query="""
            SELECT id, module_code, module_name, lesson_type, class_no, start_time, end_time, venue, class_date, attend_in_person
            FROM classes
            WHERE id = :class_id AND user_id = :user_id
        """,
        values={"class_id": class_id, "user_id": user_id},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Class not found.")
    if record["class_date"] is not None and str(record["class_date"]) != occurrence_date.isoformat():
        raise HTTPException(status_code=400, detail="That class does not occur on the selected date.")
    return record


def to_sgt_datetime(value):
    if isinstance(value, datetime):
        return value.replace(tzinfo=SGT) if value.tzinfo is None else value.astimezone(SGT)
    return datetime.combine(value, time.min, tzinfo=SGT)


def summary_parser(summary: str):
    parts = summary.split(" ", 1)
    return (parts[0], parts[1]) if len(parts) == 2 else (summary, "Class")


def parse_desc(desc_text: str, class_type: str):
    lines = desc_text.split("\n")
    module_name = lines[0].strip() if lines else ""
    class_no = None
    for line in lines:
        if class_type.lower() in line.lower():
            match = re.search(r"(?:group|class)\s+([A-Z0-9-]+)", line, re.IGNORECASE)
            class_no = match.group(1) if match else line.strip()
            break
    return module_name, class_no


def _parse_time(raw: str) -> time:
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) != 4:
        raise ValueError(f"Invalid lesson time: {raw}")
    return time(int(digits[:2]), int(digits[2:]))


def _current_academic_year(today: date | None = None) -> str:
    today = today or datetime.now(SGT).date()
    start_year = today.year if today.month >= 8 else today.year - 1
    return f"{start_year}/{start_year + 1}"


def _monday_on_or_after(value: date) -> date:
    return value + timedelta(days=(7 - value.weekday()) % 7)


def _semester_start(academic_year: str, semester: int) -> date:
    known = SEMESTER_STARTS.get(academic_year, {}).get(semester)
    if known:
        return known
    start_year = int(academic_year.split("/")[0])
    if semester == 1:
        return _monday_on_or_after(date(start_year, 8, 8))
    if semester == 2:
        return _monday_on_or_after(date(start_year + 1, 1, 8))
    if semester == 3:
        return _monday_on_or_after(date(start_year + 1, 5, 8))
    return _monday_on_or_after(date(start_year + 1, 6, 19))


def _parse_academic_year(path: str, params: dict[str, list[str]]) -> str:
    explicit = re.search(r"(20\d{2})[-_](20\d{2})", path)
    if explicit:
        return f"{explicit.group(1)}/{explicit.group(2)}"
    query_year = (params.get("academicYear") or params.get("ay") or [""])[-1]
    query_match = re.search(r"(20\d{2})[-_/](20\d{2})", query_year)
    if query_match:
        return f"{query_match.group(1)}/{query_match.group(2)}"
    return _current_academic_year()


def _parse_semester(path: str, params: dict[str, list[str]]) -> int:
    lowered = path.lower()
    patterns = (
        (r"(?:^|/)sem(?:ester)?-?1(?:/|$)", 1),
        (r"(?:^|/)sem(?:ester)?-?2(?:/|$)", 2),
        (r"(?:^|/)(?:st-i|st-1|special-term-i|special-term-1)(?:/|$)", 3),
        (r"(?:^|/)(?:st-ii|st-2|special-term-ii|special-term-2)(?:/|$)", 4),
    )
    for pattern, semester in patterns:
        if re.search(pattern, lowered):
            return semester
    query_semester = (params.get("semester") or params.get("sem") or [""])[-1]
    match = re.search(r"([1-4])", query_semester)
    if match:
        return int(match.group(1))
    raise HTTPException(status_code=400, detail="Could not determine the semester from that NUSMods link.")


async def _resolve_nusmods_url(raw_url: str) -> str:
    raw_url = raw_url.strip()
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Enter a complete NUSMods timetable link.")
    hostname = parsed.hostname.lower()
    if hostname in NUSMODS_SHORT_HOSTS:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                response = await client.get(raw_url)
                response.raise_for_status()
                raw_url = str(response.url)
                parsed = urlparse(raw_url)
                hostname = (parsed.hostname or "").lower()
        except httpx.HTTPError as error:
            raise HTTPException(status_code=400, detail="Could not open that shortened NUSMods link.") from error
    if hostname not in NUSMODS_HOSTS:
        raise HTTPException(status_code=400, detail="Only nusmods.com or modsn.us timetable links are supported.")
    if "/timetable/" not in parsed.path.lower():
        raise HTTPException(status_code=400, detail="That link does not point to a NUSMods timetable.")
    return raw_url


def _parse_serialized_weeks(raw: str):
    tokens = raw.split("_") if raw else []
    if len(tokens) >= 2 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", tokens[0]) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", tokens[1]):
        interval = int(tokens[2]) if len(tokens) > 2 and tokens[2].isdigit() and int(tokens[2]) > 0 else 1
        weeks = [int(value) for value in tokens[3:] if value.isdigit()]
        return {"start": tokens[0], "end": tokens[1], "weekInterval": interval, "weeks": weeks or None}
    return [int(value) for value in tokens if value.isdigit()]


def _serialized_lesson(item: str, lesson_type: str):
    parts = item.split("|", 5)
    if len(parts) != 6:
        return None
    class_no, day_abbreviation, start_time, end_time, venue, weeks = parts
    day = DAY_ABBREVIATIONS.get(day_abbreviation.upper())
    if not day:
        return None
    return {
        "classNo": class_no,
        "day": day,
        "startTime": start_time,
        "endTime": end_time,
        "venue": venue,
        "weeks": _parse_serialized_weeks(weeks),
        "lessonType": lesson_type,
    }


def _selected_lessons(serialized: str, timetable: list[dict]) -> list[dict]:
    selected = []
    wrapped = re.findall(r"([A-Z0-9]+):\((.*?)\)(?=;[A-Z0-9]+:\(|$)", serialized)
    if wrapped:
        for abbreviation, raw_items in wrapped:
            lesson_type = LESSON_ABBREV_TYPE.get(abbreviation)
            if not lesson_type:
                continue
            for item in raw_items.split(","):
                if "|" in item:
                    lesson = _serialized_lesson(item, lesson_type)
                    if lesson:
                        selected.append(lesson)
                elif item.isdigit():
                    index = int(item)
                    if 0 <= index < len(timetable) and timetable[index].get("lessonType") == lesson_type:
                        selected.append(timetable[index])
                else:
                    selected.extend(
                        lesson for lesson in timetable
                        if lesson.get("lessonType") == lesson_type and str(lesson.get("classNo")) == item
                    )
    else:
        for token in serialized.split(","):
            if ":" not in token:
                continue
            abbreviation, class_no = token.split(":", 1)
            lesson_type = LESSON_ABBREV_TYPE.get(abbreviation)
            if not lesson_type:
                continue
            selected.extend(
                lesson for lesson in timetable
                if lesson.get("lessonType") == lesson_type and str(lesson.get("classNo")) == class_no
            )

    unique = []
    seen = set()
    for lesson in selected:
        key = (
            lesson.get("lessonType"), lesson.get("classNo"), lesson.get("day"),
            lesson.get("startTime"), lesson.get("endTime"), lesson.get("venue"), str(lesson.get("weeks")),
        )
        if key not in seen:
            seen.add(key)
            unique.append(lesson)
    return unique


def _lesson_dates(lesson: dict, semester_start: date) -> list[date]:
    weeks = lesson.get("weeks") or []
    if isinstance(weeks, list):
        day_offset = DAY_OFFSETS.get(lesson.get("day"))
        if day_offset is None:
            return []
        dates = []
        for week in weeks:
            if not isinstance(week, int) or week < 1:
                continue
            calendar_week = week - 1 if week <= 6 else week
            class_date = semester_start + timedelta(weeks=calendar_week, days=day_offset)
            if class_date not in NUS_HOLIDAYS:
                dates.append(class_date)
        return dates

    if isinstance(weeks, dict) and weeks.get("start") and weeks.get("end"):
        current = date.fromisoformat(weeks["start"])
        end = date.fromisoformat(weeks["end"])
        interval = max(int(weeks.get("weekInterval") or 1), 1)
        included = set(weeks.get("weeks") or [])
        dates = []
        sequence = 1
        while current <= end:
            if (not included or sequence in included) and current not in NUS_HOLIDAYS:
                dates.append(current)
            current += timedelta(weeks=interval)
            sequence += interval
        return dates
    return []


async def fetch_nusmods_module(client: httpx.AsyncClient, api_year: str, module_code: str) -> dict:
    response = await client.get(f"https://api.nusmods.com/v2/{api_year}/modules/{module_code}.json")
    response.raise_for_status()
    return response.json()


async def _replace_timetable(user_id: int, classes: list[dict], exams: list[dict]):
    async with db.transaction():
        await db.execute("DELETE FROM classes WHERE user_id = :user_id", values={"user_id": user_id})
        await db.execute("DELETE FROM exams WHERE user_id = :user_id", values={"user_id": user_id})
        if classes:
            await db.execute_many(
                query="""
                    INSERT INTO classes (user_id, module_code, module_name, lesson_type, class_no, day_of_week, start_time, end_time, venue, class_date)
                    VALUES (:user_id, :module_code, :module_name, :lesson_type, :class_no, :day_of_week, :start_time, :end_time, :venue, :class_date)
                """,
                values=classes,
            )
        if exams:
            await db.execute_many(
                query="""
                    INSERT INTO exams (user_id, module_code, module_name, start_at, end_at)
                    VALUES (:user_id, :module_code, :module_name, :start_at, :end_at)
                """,
                values=exams,
            )
        await ensure_module_colors(
            user_id,
            (
                (item["module_code"], item.get("module_name"))
                for item in [*classes, *exams]
            ),
        )


@router.post("/import/ics", status_code=status.HTTP_201_CREATED)
async def import_ics(file: UploadFile, current_user: CurrentUser):
    filename = file.filename or ""
    if not filename.lower().endswith(".ics"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an .ics file.")

    cal_data = await file.read()
    if len(cal_data) > 5_000_000:
        raise HTTPException(status_code=400, detail="The calendar file is too large.")
    try:
        calendar = Calendar.from_ical(cal_data.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="That file is not a valid iCalendar file.") from error

    classes = []
    exams = []
    for component in calendar.walk():
        if component.name != "VEVENT":
            continue
        summary = str(component.get("SUMMARY", "")).strip()
        dtstart_property = component.get("DTSTART")
        if not summary or not dtstart_property:
            continue
        module_code, class_type = summary_parser(summary)
        module_name, class_no = parse_desc(str(component.get("DESCRIPTION", "")), class_type)
        dtstart = dtstart_property.dt
        dtend_property = component.get("DTEND")
        dtend = dtend_property.dt if dtend_property else to_sgt_datetime(dtstart) + timedelta(hours=1)

        if "exam" in class_type.lower() or "exam" in summary.lower():
            start_sgt = to_sgt_datetime(dtstart)
            end_sgt = to_sgt_datetime(dtend)
            exams.append({
                "user_id": current_user.id, "module_code": module_code,
                "module_name": module_name, "start_at": start_sgt, "end_at": end_sgt,
            })
            continue

        exdates = component.get("EXDATE")
        exdate_list = []
        for exdate in exdates if isinstance(exdates, list) else ([exdates] if exdates else []):
            if hasattr(exdate, "dts"):
                exdate_list.extend(item.dt for item in exdate.dts)
            elif hasattr(exdate, "dt"):
                exdate_list.append(exdate.dt)

        rrule = component.get("RRULE")
        if rrule:
            start_value = datetime.combine(dtstart, time.min) if type(dtstart) is date else dtstart
            rule_set = rruleset()
            rule_set.rrule(rrulestr(rrule.to_ical().decode("utf-8"), dtstart=start_value))
            for excluded in exdate_list:
                excluded_value = datetime.combine(excluded, time.min) if type(excluded) is date else excluded
                if start_value.tzinfo and not excluded_value.tzinfo:
                    excluded_value = excluded_value.replace(tzinfo=timezone.utc)
                elif not start_value.tzinfo and excluded_value.tzinfo:
                    excluded_value = excluded_value.replace(tzinfo=None)
                rule_set.exdate(excluded_value)
            occurrences = list(rule_set[:200])
        else:
            occurrences = [dtstart]

        duration = to_sgt_datetime(dtend) - to_sgt_datetime(dtstart)
        for occurrence in occurrences:
            start_sgt = to_sgt_datetime(occurrence)
            end_sgt = start_sgt + duration
            classes.append({
                "user_id": current_user.id, "module_code": module_code,
                "module_name": module_name, "lesson_type": class_type or "Class",
                "class_no": class_no, "day_of_week": start_sgt.isoweekday(),
                "start_time": start_sgt.time(), "end_time": end_sgt.time(),
                "venue": str(component.get("LOCATION") or ""), "class_date": start_sgt.date(),
            })

    await _replace_timetable(current_user.id, classes, exams)
    return {"source": "ics", "classes": len(classes), "exams": len(exams)}


@router.post("/import/nusmods", status_code=status.HTTP_201_CREATED)
async def import_nusmods(payload: NUSModsImportRequest, current_user: CurrentUser):
    resolved_url = await _resolve_nusmods_url(payload.url)
    parsed = urlparse(resolved_url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    academic_year = _parse_academic_year(parsed.path, params)
    semester = _parse_semester(parsed.path, params)
    hidden = set(",".join(params.get("hidden", [])).split(","))
    module_configs = {
        key.upper(): values[-1]
        for key, values in params.items()
        if NUSMODS_MODULE_PATTERN.fullmatch(key.upper()) and key.upper() not in hidden
    }
    if not module_configs:
        raise HTTPException(status_code=400, detail="No modules were found in that NUSMods timetable link.")

    api_year = academic_year.replace("/", "-")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            module_data = await asyncio.gather(*(
                fetch_nusmods_module(client, api_year, module_code) for module_code in module_configs
            ))
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Could not load one or more modules from NUSMods.") from error

    classes = []
    exams = []
    semester_start = _semester_start(academic_year, semester)
    seen_classes = set()
    for module_code, module in zip(module_configs, module_data):
        semester_data = next((item for item in module.get("semesterData", []) if item.get("semester") == semester), None)
        if not semester_data:
            continue
        title = module.get("title") or module_code
        for lesson in _selected_lessons(module_configs[module_code], semester_data.get("timetable") or []):
            try:
                start_time = _parse_time(lesson.get("startTime", ""))
                end_time = _parse_time(lesson.get("endTime", ""))
            except ValueError:
                continue
            for class_date in _lesson_dates(lesson, semester_start):
                key = (
                    module_code, lesson.get("lessonType"), lesson.get("classNo"), class_date,
                    start_time, end_time, lesson.get("venue") or "",
                )
                if key in seen_classes:
                    continue
                seen_classes.add(key)
                classes.append({
                    "user_id": current_user.id, "module_code": module_code, "module_name": title,
                    "lesson_type": lesson.get("lessonType") or "Class",
                    "class_no": str(lesson.get("classNo") or "") or None,
                    "day_of_week": class_date.isoweekday(), "start_time": start_time,
                    "end_time": end_time, "venue": lesson.get("venue") or "",
                    "class_date": class_date,
                })

        exam_date = semester_data.get("examDate")
        if exam_date:
            start_at = datetime.fromisoformat(exam_date.replace("Z", "+00:00"))
            duration = int(semester_data.get("examDuration") or 120)
            exams.append({
                "user_id": current_user.id, "module_code": module_code, "module_name": title,
                "start_at": start_at, "end_at": start_at + timedelta(minutes=duration),
            })

    if not classes and not exams:
        raise HTTPException(status_code=400, detail="No selected lessons or exams could be read from that timetable.")
    await _replace_timetable(current_user.id, classes, exams)
    return {
        "source": "nusmods", "academic_year": academic_year, "semester": semester,
        "modules": len(module_configs), "classes": len(classes), "exams": len(exams),
    }


@router.get("/classes/{class_id}/context")
async def get_class_context(
    class_id: int,
    occurrence_date: date,
    current_user: CurrentUser,
):
    class_record = await class_occurrence_for_user(class_id, occurrence_date, current_user.id)
    occurrence_key = class_occurrence_key(class_record, occurrence_date)
    series_key = class_series_key(class_record)
    tasks = await db.fetch_all(
        query="""
            SELECT t.id, t.title, t.status, t.due_at_override, t.source_due_at, ctl.relation,
                   ctl.occurrence_date AS class_occurrence_date,
                   ctl.class_occurrence_key
            FROM class_task_links ctl
            JOIN tasks t ON t.id = ctl.task_id
            WHERE ctl.user_id = :user_id AND ctl.class_occurrence_key IN (:occurrence_key, :series_key)
            ORDER BY CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
                     COALESCE(t.due_at_override, t.source_due_at) ASC NULLS LAST, t.created_at DESC
        """,
        values={"user_id": current_user.id, "occurrence_key": occurrence_key, "series_key": series_key},
    )
    notes = await db.fetch_all(
        query="""
            SELECT n.id, n.title, n.updated_at,
                   cnl.occurrence_date AS class_occurrence_date,
                   cnl.class_occurrence_key
            FROM class_note_links cnl
            JOIN notes n ON n.id = cnl.note_id
            WHERE cnl.user_id = :user_id AND cnl.class_occurrence_key IN (:occurrence_key, :series_key)
            ORDER BY n.updated_at DESC
        """,
        values={"user_id": current_user.id, "occurrence_key": occurrence_key, "series_key": series_key},
    )
    files = await db.fetch_all(
        query="""
            SELECT id, filename, media_type, byte_size, created_at,
                   occurrence_date,
                   class_occurrence_key
            FROM class_files
            WHERE user_id = :user_id AND class_occurrence_key IN (:occurrence_key, :series_key)
            ORDER BY created_at DESC
        """,
        values={"user_id": current_user.id, "occurrence_key": occurrence_key, "series_key": series_key},
    )
    def _with_recurring(records):
        out = []
        for r in records:
            d = dict(r)
            d["is_recurring"] = bool("|recurring|" in (d.get("class_occurrence_key") or ""))
            out.append(d)
        return out

    return {
        "class": {
            "id": class_record["id"],
            "module_code": class_record["module_code"],
            "module_name": class_record["module_name"],
            "lesson_type": class_record["lesson_type"],
            "class_no": class_record["class_no"],
            "start_time": class_record["start_time"],
            "end_time": class_record["end_time"],
            "venue": class_record["venue"],
            "occurrence_date": occurrence_date,
            "summary": class_summary(class_record),
            "attend_in_person": class_record.get("attend_in_person", True),
        },
        "tasks": _with_recurring(tasks),
        "notes": _with_recurring(notes),
        "files": _with_recurring(files),
    }

class ClassUpdate(BaseModel):
    attend_in_person: bool

@router.patch("/classes/{class_id}")
async def update_class(class_id: int, payload: ClassUpdate, current_user: CurrentUser):
    record = await db.fetch_one(
        "UPDATE classes SET attend_in_person = :attend_in_person WHERE id = :class_id AND user_id = :user_id RETURNING id",
        {"attend_in_person": payload.attend_in_person, "class_id": class_id, "user_id": current_user.id}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Class not found.")
    return {"status": "ok"}

@router.post("/classes/{class_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_class_file(
    class_id: int,
    occurrence_date: date,
    file: UploadFile,
    is_recurring: bool = False,
    current_user: CurrentUser = None,
):
    class_record = await class_occurrence_for_user(class_id, occurrence_date, current_user.id)
    filename = (file.filename or "attachment").strip()[:255]
    if not filename:
        raise HTTPException(status_code=400, detail="Choose a file to attach.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(content) > 15_000_000:
        raise HTTPException(status_code=400, detail="Files must be 15 MB or smaller.")
    key = class_series_key(class_record) if is_recurring else class_occurrence_key(class_record, occurrence_date)
    record = await db.fetch_one(
        query="""
            INSERT INTO class_files (
                user_id, class_occurrence_key, occurrence_date, class_summary,
                filename, media_type, byte_size, content
            )
            VALUES (
                :user_id, :class_occurrence_key, :occurrence_date, :class_summary,
                :filename, :media_type, :byte_size, :content
            )
            RETURNING id, filename, media_type, byte_size, created_at
        """,
        values={
            "user_id": current_user.id,
            "class_occurrence_key": key,
            "occurrence_date": occurrence_date,
            "class_summary": class_summary(class_record),
            "filename": filename,
            "media_type": file.content_type or "application/octet-stream",
            "byte_size": len(content),
            "content": content,
        },
    )
    result = dict(record)
    result["is_recurring"] = is_recurring
    return result


@router.get("/class-files/{file_id}")
async def download_class_file(file_id: int, current_user: CurrentUser):
    record = await db.fetch_one(
        query="""
            SELECT filename, media_type, content
            FROM class_files
            WHERE id = :file_id AND user_id = :user_id
        """,
        values={"file_id": file_id, "user_id": current_user.id},
    )
    if not record:
        raise HTTPException(status_code=404, detail="File not found.")
    return Response(
        content=record["content"],
        media_type=record["media_type"] or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(record['filename'])}"},
    )


@router.get("", response_model=ScheduleOut)
async def list_schedule(current_user: CurrentUser):
    await ensure_discovered_module_colors(current_user.id)
    classes = await db.fetch_all(
        query="""
            SELECT c.*, mc.color AS module_color
            FROM classes c
            LEFT JOIN module_colors mc
              ON mc.user_id = c.user_id
             AND mc.module_code = UPPER(TRIM(c.module_code))
            WHERE c.user_id = :user_id
            ORDER BY c.class_date, c.start_time
        """,
        values={"user_id": current_user.id},
    )
    exams = await db.fetch_all(
        query="""
            SELECT e.*, mc.color AS module_color
            FROM exams e
            LEFT JOIN module_colors mc
              ON mc.user_id = e.user_id
             AND mc.module_code = UPPER(TRIM(e.module_code))
            WHERE e.user_id = :user_id
            ORDER BY e.start_at
        """,
        values={"user_id": current_user.id},
    )
    events = await db.fetch_all(
        query="""
            SELECT DISTINCT e.*, mc.color AS module_color,
                   CASE WHEN ea.is_attending IS NOT NULL THEN ea.is_attending
                        WHEN e.user_id = :user_id THEN TRUE
                        ELSE FALSE
                   END AS is_attending
            FROM events e
            LEFT JOIN g_members gm ON gm.g_id = e.g_id
            LEFT JOIN groups g ON g.c_id = e.c_id
            LEFT JOIN g_members gm_comm ON gm_comm.g_id = g.id
            LEFT JOIN event_attendance ea ON ea.e_id = e.id AND ea.user_id = :user_id
            LEFT JOIN module_colors mc
              ON mc.user_id = :user_id
             AND mc.module_code = UPPER(TRIM(e.module_code))
            WHERE e.user_id = :user_id
               OR gm.user_id = :user_id
               OR gm_comm.user_id = :user_id
            ORDER BY e.start_at
        """,
        values={"user_id": current_user.id},
    )
    task_counts = {
        item["class_occurrence_key"]: item["total"]
        for item in await db.fetch_all(
            query="""
                SELECT class_occurrence_key, COUNT(*) AS total
                FROM class_task_links WHERE user_id = :user_id
                GROUP BY class_occurrence_key
            """,
            values={"user_id": current_user.id},
        )
    }
    note_counts = {
        item["class_occurrence_key"]: item["total"]
        for item in await db.fetch_all(
            query="""
                SELECT class_occurrence_key, COUNT(*) AS total
                FROM class_note_links WHERE user_id = :user_id
                GROUP BY class_occurrence_key
            """,
            values={"user_id": current_user.id},
        )
    }
    file_counts = {
        item["class_occurrence_key"]: item["total"]
        for item in await db.fetch_all(
            query="""
                SELECT class_occurrence_key, COUNT(*) AS total
                FROM class_files WHERE user_id = :user_id
                GROUP BY class_occurrence_key
            """,
            values={"user_id": current_user.id},
        )
    }
    class_results = []
    for record in classes:
        item = dict(record)
        key = class_occurrence_key(record, record["class_date"]) if record["class_date"] else None
        skey = class_series_key(record)
        item["linked_task_count"] = (task_counts.get(key, 0) if key else 0) + task_counts.get(skey, 0)
        item["linked_note_count"] = (note_counts.get(key, 0) if key else 0) + note_counts.get(skey, 0)
        item["linked_file_count"] = (file_counts.get(key, 0) if key else 0) + file_counts.get(skey, 0)
        class_results.append(item)
    return {"classes": class_results, "exams": exams, "events": events}
