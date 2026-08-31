import { describe, expect, it } from "vitest";
import { dashboardAgendaItems, dashboardAgendaView, moduleCardInk, scheduleItemsForDate, timelineBlockGeometry } from "../scheduleUtils";

describe("schedule module cards", () => {
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
});
