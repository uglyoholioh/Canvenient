import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandItem,
  bucketDeadlines,
  freshPostCount,
  groupAnnouncements,
  humanizeLeft,
  parseGradePercent,
  readSelection,
  relativeDay,
  runwayFor,
  upcomingCounts,
  writeSelection,
} from "../model";

const NOW = new Date("2026-09-19T10:00:00");

const iso = (hoursFromNow) => new Date(NOW.getTime() + hoursFromNow * 3600000).toISOString();

const COURSES = [
  { id: 1, course_code: "CS2103", color: "#c2a265" },
  { id: 2, course_code: "GEA1000", color: null },
];

const dueRow = (id, hoursFromNow, courseId = 1, title = `item-${id}`) => ({
  id,
  title,
  course_id: courseId,
  due_at: iso(hoursFromNow),
});

describe("relativeDay", () => {
  it("keeps a late-evening due on today regardless of the hour", () => {
    const tonight = new Date(2026, 8, 19, 23, 59).toISOString();
    const twoAm = new Date(2026, 8, 19, 2, 0);
    expect(relativeDay(tonight, twoAm)).toContain("today");
  });

  it("still reads tomorrow for the next calendar day", () => {
    const tomorrowNight = new Date(2026, 8, 20, 23, 59).toISOString();
    const twoAm = new Date(2026, 8, 19, 2, 0);
    expect(relativeDay(tomorrowNight, twoAm)).toContain("tomorrow");
  });
});

describe("bucketDeadlines", () => {
  it("buckets by distance and enriches course facts", () => {
    const buckets = bucketDeadlines(
      [
        dueRow("a", -30),
        dueRow("b", 3),
        dueRow("c", 30),
        dueRow("d", 72),
        dueRow("e", 24 * 14),
        { id: "f", title: "undated", course_id: 1 },
      ],
      COURSES,
      NOW,
    );
    expect(buckets.overdue.map((r) => r.id)).toEqual(["a"]);
    expect(buckets.today.map((r) => r.id)).toEqual(["b"]);
    expect(buckets.tomorrow.map((r) => r.id)).toEqual(["c"]);
    expect(buckets.week.map((r) => r.id)).toEqual(["d"]);
    expect(buckets.later.map((r) => r.id)).toEqual(["e"]);
    expect(buckets.overdue[0].courseCode).toBe("CS2103");
    expect(buckets.overdue[0].color).toBe("#c2a265");
  });

  it("sorts each bucket soonest-first", () => {
    const buckets = bucketDeadlines([dueRow("late", 5), dueRow("soon", 2)], COURSES, NOW);
    expect(buckets.today.map((r) => r.id)).toEqual(["soon", "late"]);
  });
});

describe("runwayFor", () => {
  it("is depleted and overdue once the date has passed", () => {
    expect(runwayFor(iso(-1), NOW)).toEqual({ fraction: 0, tone: "overdue", left: 0 });
  });

  it("escalates tone as the horizon closes", () => {
    expect(runwayFor(iso(24 * 6), NOW).tone).toBe("calm");
    expect(runwayFor(iso(48), NOW).tone).toBe("soon");
    expect(runwayFor(iso(10), NOW).tone).toBe("urgent");
  });

  it("maps remaining time onto a one-week bar", () => {
    expect(runwayFor(iso(24 * 7), NOW).fraction).toBeCloseTo(1);
    expect(runwayFor(iso(24 * 3.5), NOW).fraction).toBeCloseTo(0.5);
    expect(runwayFor(iso(24), NOW).fraction).toBeLessThan(0.2);
  });
});

describe("humanizeLeft", () => {
  it("picks a readable unit", () => {
    expect(humanizeLeft(30 * 60000)).toBe("30m");
    expect(humanizeLeft(19 * 3600000)).toBe("19h");
    expect(humanizeLeft(6 * 86400000)).toBe("6d");
    expect(humanizeLeft(30 * 86400000)).toBe("4w");
    expect(humanizeLeft(0)).toBeNull();
  });
});

describe("bandItem", () => {
  it("prefers the oldest overdue item over upcoming ones", () => {
    const buckets = bucketDeadlines([dueRow("up", 5), dueRow("od", -40)], COURSES, NOW);
    expect(bandItem(buckets).id).toBe("od");
  });
});

describe("groupAnnouncements", () => {
  it("groups by recency: new, this week, earlier", () => {
    const groups = groupAnnouncements(
      [
        { id: 1, posted_at: iso(-1) },
        { id: 2, posted_at: iso(-24 * 3) },
        { id: 3, posted_at: iso(-24 * 20) },
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["new", "week", "earlier"]);
    expect(groups[0].items[0].id).toBe(1);
  });

  it("drops empty groups and sorts newest first", () => {
    const groups = groupAnnouncements(
      [
        { id: 1, posted_at: iso(-5) },
        { id: 2, posted_at: iso(-1) },
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual([2, 1]);
  });
});

describe("freshPostCount / upcomingCounts", () => {
  it("counts fresh posts within 48h only", () => {
    expect(freshPostCount([{ posted_at: iso(-1) }, { posted_at: iso(-24 * 3) }, {}], NOW)).toBe(1);
  });

  it("counts upcoming per course", () => {
    const counts = upcomingCounts([dueRow("a", 5, 1), dueRow("b", 9, 1), dueRow("c", -2, 2)], NOW);
    expect(counts.get("1")).toBe(2);
    expect(counts.has("2")).toBe(false);
  });
});

describe("parseGradePercent", () => {
  it("reads the number out of canvas grade strings", () => {
    expect(parseGradePercent("87.5%")).toBeCloseTo(87.5);
    expect(parseGradePercent("A- (84)")).toBeCloseTo(84);
    expect(parseGradePercent(null)).toBeNull();
  });
});

describe("selection persistence", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
  });

  afterEach(() => localStorage.clear());

  it("round-trips a selection", () => {
    writeSelection({ kind: "course", courseId: 7 });
    expect(readSelection()).toEqual({ kind: "course", courseId: 7 });
  });

  it("falls back to the semester landing for unknown kinds", () => {
    localStorage.setItem("canvenient.instrument.modules.sel", JSON.stringify({ kind: "nope" }));
    expect(readSelection().kind).toBe("semester");
  });
});
