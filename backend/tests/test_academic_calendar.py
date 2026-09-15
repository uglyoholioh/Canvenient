"""
Tests for backend/academic_calendar.py — NUS term dates and week arithmetic.
These pin the data that lesson generation depends on, and the sibling copy
in frontend/src/components/scheduleUtils.js is asserted to match in the
frontend test suite.
"""

from datetime import date

from academic_calendar import (
    NUS_HOLIDAYS,
    SEMESTER_STARTS,
    current_academic_year,
    monday_on_or_after,
    semester_start,
    week_number,
)


class TestSemesterStarts:
    def test_known_dates(self):
        assert SEMESTER_STARTS["2025/2026"][1] == date(2025, 8, 11)
        assert SEMESTER_STARTS["2025/2026"][2] == date(2026, 1, 12)
        assert SEMESTER_STARTS["2026/2027"][1] == date(2026, 8, 10)

    def test_fallback_for_unknown_year(self):
        # 2029 Aug 8 is a Wednesday; the fallback snaps to the next Monday.
        assert semester_start("2029/2030", 1) == date(2029, 8, 13)
        assert semester_start("2029/2030", 2) == monday_on_or_after(date(2030, 1, 8))

    def test_holidays_parse(self):
        assert date(2025, 12, 25) in NUS_HOLIDAYS
        assert date(2026, 8, 10) in NUS_HOLIDAYS  # AY26/27 Sem 1 week 1 holiday


class TestCurrentAcademicYear:
    def test_wraps_in_august(self):
        assert current_academic_year(date(2026, 8, 1)) == "2026/2027"
        assert current_academic_year(date(2026, 7, 31)) == "2025/2026"


class TestWeekNumber:
    sem1 = date(2025, 8, 11)  # Monday, AY25/26 Sem 1

    def test_weeks_one_through_six(self):
        assert week_number(self.sem1, self.sem1) == 1
        assert week_number(date(2025, 9, 15), self.sem1) == 6  # week 6 Monday

    def test_recess_is_none(self):
        assert week_number(date(2025, 9, 22), self.sem1) is None  # calendar week 6
        assert week_number(date(2025, 9, 25), self.sem1) is None

    def test_weeks_seven_through_thirteen(self):
        assert week_number(date(2025, 9, 29), self.sem1) == 7  # back after recess
        assert week_number(date(2025, 11, 10), self.sem1) == 13  # last teaching Monday

    def test_beyond_teaching_weeks_is_none(self):
        # Reading week (calendar week 14) and exams must return None:
        # lesson generation relies on it.
        assert week_number(date(2025, 11, 17), self.sem1) is None
        assert week_number(date(2025, 12, 1), self.sem1) is None

    def test_before_semester_is_none(self):
        assert week_number(date(2025, 8, 4), self.sem1) is None
