"""NUS academic term dates and week arithmetic.

Canonical sibling copy: frontend/src/components/scheduleUtils.js
(`SEMESTER_STARTS`). Both must list the same dates — update BOTH together
each academic year (see docs/runbook). This module exists so backend code
(lesson generation, future term-aware features) never re-derives dates.

Week mapping follows the NUS structure: weeks 1-6, recess week, weeks 7-13,
reading week, two exam weeks.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

SGT = ZoneInfo("Asia/Singapore")

# Official NUSMods semester starts. Older/future years use a conservative
# Monday fallback (see semester_start).
SEMESTER_STARTS: dict[str, dict[int, date]] = {
    "2023/2024": {1: date(2023, 8, 7), 2: date(2024, 1, 15), 3: date(2024, 5, 13), 4: date(2024, 6, 24)},
    "2024/2025": {1: date(2024, 8, 12), 2: date(2025, 1, 13), 3: date(2025, 5, 12), 4: date(2025, 6, 23)},
    "2025/2026": {1: date(2025, 8, 11), 2: date(2026, 1, 12), 3: date(2026, 5, 11), 4: date(2026, 6, 22)},
    "2026/2027": {1: date(2026, 8, 10), 2: date(2027, 1, 11), 3: date(2027, 5, 10), 4: date(2027, 6, 21)},
    "2027/2028": {1: date(2027, 8, 9), 2: date(2028, 1, 10), 3: date(2028, 5, 8), 4: date(2028, 6, 19)},
}

# NUS public holidays that fall on teaching days — lessons are not generated
# on these dates.
NUS_HOLIDAYS: set[date] = {
    date.fromisoformat(value)
    for value in (
        "2024-08-09",
        "2024-10-31",
        "2024-11-01",
        "2024-12-25",
        "2025-01-01",
        "2025-01-29",
        "2025-01-30",
        "2025-03-31",
        "2025-04-18",
        "2025-05-01",
        "2025-05-12",
        "2025-06-07",
        "2025-08-09",
        "2025-10-20",
        "2025-10-21",
        "2025-12-25",
        "2026-01-01",
        "2026-02-17",
        "2026-02-18",
        "2026-03-21",
        "2026-04-03",
        "2026-05-01",
        "2026-05-27",
        "2026-06-01",
        "2026-08-09",
        "2026-08-10",
        "2026-10-09",
        "2026-11-08",
        "2026-11-09",
        "2026-12-25",
        "2027-01-01",
        "2027-02-06",
        "2027-02-07",
        "2027-02-08",
        "2027-03-10",
        "2027-03-26",
        "2027-05-01",
        "2027-05-17",
        "2027-05-20",
    )
}

RECESS_AFTER_WEEK = 6
READING_WEEK = 14
EXAM_WEEKS = (15, 16)


def monday_on_or_after(value: date) -> date:
    return value + timedelta(days=(7 - value.weekday()) % 7)


def current_academic_year(today: date | None = None) -> str:
    today = today or datetime.now(SGT).date()
    start_year = today.year if today.month >= 8 else today.year - 1
    return f"{start_year}/{start_year + 1}"


def semester_start(academic_year: str, semester: int) -> date:
    """Known start date, or a conservative Monday-on-or-after fallback."""
    known = SEMESTER_STARTS.get(academic_year, {}).get(semester)
    if known:
        return known
    start_year = int(academic_year.split("/")[0])
    if semester == 1:
        return monday_on_or_after(date(start_year, 8, 8))
    if semester == 2:
        return monday_on_or_after(date(start_year + 1, 1, 8))
    if semester == 3:
        return monday_on_or_after(date(start_year + 1, 5, 8))
    return monday_on_or_after(date(start_year + 1, 6, 19))


def week_number(target: date, semester_start: date) -> int | None:
    """NUS week number for a date: 1-6 before recess, 7-13 after.

    The recess week itself and anything outside the 13 teaching weeks
    (before week 1, reading week, exams) return None — lesson generation
    relies on that cap.
    """
    diff_days = (target - semester_start).days
    calendar_week = diff_days // 7
    if calendar_week < 0:
        return None
    if calendar_week < RECESS_AFTER_WEEK:
        return calendar_week + 1
    if RECESS_AFTER_WEEK < calendar_week <= 13:
        return calendar_week
    return None
