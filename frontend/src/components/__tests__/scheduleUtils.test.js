import { describe, expect, it } from "vitest";
import { dashboardAgendaItems, dashboardAgendaView, getTaskModuleColor, moduleCardInk, scheduleItemsForDate, timelineBlockGeometry } from "../scheduleUtils";

describe("schedule module cards", () => {
  it("extracts task module color from module_color, academic modules, or fallback", () => {
    expect(getTaskModuleColor({ module_color: "#246BFD" })).toBe("#246BFD");
    expect(getTaskModuleColor({ module_id: 5 }, [{ id: 5, color: "#19A974" }])).toBe("#19A974");
    expect(getTaskModuleColor({ module_code: "CS2040S" }, [{ module_code: "CS2040S", color: "#DE7548" }])).toBe("#DE7548");
    expect(getTaskModuleColor({ module_code: "CS2040S" })).toMatch(/hsl\(\d+ 64% 58%\)/);
    expect(getTaskModuleColor({ title: "Personal task" })).toBeNull();
  });

  it("chooses readable ink for light and dark module colours", () => {
    expect(moduleCardInk("#C58B2A")).toBe("var(--color-schedule-card-ink-dark)");
    expect(moduleCardInk("#246BFD")).toBe("var(--color-schedule-card-ink-light)");
  });

  it("keeps the essential class details on each timeline item", () => {
    const date = new Date(2026, 8, 7);
    const [item] = scheduleItemsForDate({
      classes: [{
        id: 1,
        module_code: "CS2040S",
        module_name: "Data Structures and Algorithms",
        lesson_type: "Lecture",
        class_no: "1",
        day_of_week: 1,
        class_date: "2026-09-07",
        start_time: "10:00:00",
        end_time: "12:00:00",
        venue: "LT19",
        module_color: "#246BFD",
        linked_task_count: 1,
        linked_note_count: 2,
        linked_file_count: 1,
      }],
      exams: [],
      events: [],
    }, date);

    expect(item).toMatchObject({
      title: "CS2040S",
      subtitle: "Lecture",
      classNo: "1",
      venue: "LT19",
      color: "#246BFD",
      ink: "var(--color-schedule-card-ink-light)",
      classId: 1,
      occurrenceDate: "2026-09-07",
      linkedTaskCount: 1,
      linkedNoteCount: 2,
      linkedFileCount: 1,
    });
  });

  it("falls forward to the next classes and dated tasks when today is finished", () => {
    const now = new Date(2026, 8, 7, 18, 0);
    const agenda = dashboardAgendaItems({
      classes: [
        { id: 1, module_code: "CS2040S", lesson_type: "Lecture", class_no: "1", class_date: "2026-09-07", start_time: "09:00", end_time: "10:00", venue: "LT19", module_color: "#246BFD" },
        { id: 2, module_code: "ST2334", lesson_type: "Tutorial", class_no: "8", class_date: "2026-09-08", start_time: "10:00", end_time: "11:00", venue: "S16-06118", module_color: "#C58B2A" },
      ],
      exams: [],
      events: [],
    }, [{ id: 3, title: "Tutorial 4", module_code: "CS2040S", status: "open", effective_due_at: "2026-09-08T09:00:00+08:00" }], now);

    const result = dashboardAgendaView(agenda, now, "now");
    expect(result.fallback).toBe(true);
    expect(result.items.map((item) => item.title)).toEqual(["Tutorial 4", "ST2334"]);
  });

  it("keeps today and upcoming as distinct selectable agenda views", () => {
    const now = new Date(2026, 8, 7, 12, 0);
    const items = [
      { id: "past", title: "Past class", start: new Date(2026, 8, 7, 9), end: new Date(2026, 8, 7, 10) },
      { id: "future", title: "Future class", start: new Date(2026, 8, 8, 9), end: new Date(2026, 8, 8, 10) },
    ];

    expect(dashboardAgendaView(items, now, "today").items.map((item) => item.id)).toEqual(["past"]);
    expect(dashboardAgendaView(items, now, "upcoming").items.map((item) => item.id)).toEqual(["future"]);
  });

  it("leaves a visible gutter between consecutive timetable blocks", () => {
    const first = timelineBlockGeometry({ start: new Date(2026, 8, 7, 10), end: new Date(2026, 8, 7, 12) }, 8);
    const second = timelineBlockGeometry({ start: new Date(2026, 8, 7, 12), end: new Date(2026, 8, 7, 14) }, 8);

    expect(second.top - (first.top + first.height)).toBe(2);
  });

  describe("getAcademicWeek", () => {
    it("correctly identifies instructional weeks, recess week, reading week, and exams for Sem 1", async () => {
      const { getAcademicWeek } = await import("../scheduleUtils");

      // AY24/25 Sem 1 Start: 2024-08-12
      // Orientation Week (week before start)
      expect(getAcademicWeek(new Date(2024, 7, 5))).toMatchObject({
        academicYear: "2024/2025",
        shortAcademicYear: "AY24/25",
        shortSemester: "Sem 1",
        label: "Orientation Week",
        type: "orientation",
      });

      // Week 1 (2024-08-12)
      expect(getAcademicWeek(new Date(2024, 7, 12))).toMatchObject({
        academicYear: "2024/2025",
        shortSemester: "Sem 1",
        weekNumber: 1,
        label: "Week 1",
        type: "instructional",
      });

      // Week 6 (2024-09-16)
      expect(getAcademicWeek(new Date(2024, 8, 16))).toMatchObject({
        shortSemester: "Sem 1",
        weekNumber: 6,
        label: "Week 6",
        type: "instructional",
      });

      // Recess Week (2024-09-23)
      expect(getAcademicWeek(new Date(2024, 8, 23))).toMatchObject({
        shortSemester: "Sem 1",
        weekNumber: null,
        label: "Recess Week",
        type: "recess",
      });

      // Week 7 (2024-09-30)
      expect(getAcademicWeek(new Date(2024, 8, 30))).toMatchObject({
        shortSemester: "Sem 1",
        weekNumber: 7,
        label: "Week 7",
        type: "instructional",
      });

      // Week 13 (2024-11-11)
      expect(getAcademicWeek(new Date(2024, 10, 11))).toMatchObject({
        shortSemester: "Sem 1",
        weekNumber: 13,
        label: "Week 13",
        type: "instructional",
      });

      // Reading Week (2024-11-18)
      expect(getAcademicWeek(new Date(2024, 10, 18))).toMatchObject({
        shortSemester: "Sem 1",
        label: "Reading Week",
        type: "reading",
      });

      // Exam Week 1 (2024-11-25)
      expect(getAcademicWeek(new Date(2024, 10, 25))).toMatchObject({
        shortSemester: "Sem 1",
        label: "Exam Week 1",
        type: "exam",
      });

      // Exam Week 2 (2024-12-02)
      expect(getAcademicWeek(new Date(2024, 11, 2))).toMatchObject({
        shortSemester: "Sem 1",
        label: "Exam Week 2",
        type: "exam",
      });

      // Vacation (2024-12-16)
      expect(getAcademicWeek(new Date(2024, 11, 16))).toMatchObject({
        shortSemester: "Sem 1",
        label: "Vacation",
        type: "vacation",
      });
    });

    it("correctly identifies Semester 2 weeks", async () => {
      const { getAcademicWeek } = await import("../scheduleUtils");

      // AY24/25 Sem 2 Start: 2025-01-13
      // Week 1
      expect(getAcademicWeek(new Date(2025, 0, 13))).toMatchObject({
        academicYear: "2024/2025",
        shortSemester: "Sem 2",
        weekNumber: 1,
        label: "Week 1",
      });

      // Recess Week (2025-02-24)
      expect(getAcademicWeek(new Date(2025, 1, 24))).toMatchObject({
        shortSemester: "Sem 2",
        label: "Recess Week",
      });

      // Week 7 (2025-03-03)
      expect(getAcademicWeek(new Date(2025, 2, 3))).toMatchObject({
        shortSemester: "Sem 2",
        weekNumber: 7,
        label: "Week 7",
      });
    });
  });
});
