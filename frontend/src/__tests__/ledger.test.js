import { describe, expect, it } from "vitest";
import {
  barCount,
  fortnightBuckets,
  fuseDueItems,
  gapAround,
  openWindows,
  railScale,
  ribbonTicks,
  runwayPhaseLabel,
  semesterRunway,
  tomorrowFirst,
  windowLabel,
} from "../instrument/ledger";

const D = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

// A real Saturday: AY26/27 Sem 1, week 6 (recess starts 28 Sep).
const NOW = D(2026, 9, 19, 11, 30);

const at = (h, m) => D(2026, 9, 19, h, m);

describe("railScale", () => {
  it("pads 45 minutes around the day's commitments", () => {
    const items = [
      { start: at(9, 0), end: at(10, 30) },
      { start: at(13, 0), end: at(14, 0) },
    ];
    expect(railScale(items)).toEqual({ startMin: 8 * 60 + 15, endMin: 14 * 60 + 45 });
  });

  it("clamps to the 07:00 frame and keeps a rideable width", () => {
    expect(railScale([{ start: at(6, 0), end: at(7, 0) }])).toEqual({
      startMin: 7 * 60,
      endMin: 9 * 60,
    });
  });

  it("is null for an empty day", () => {
    expect(railScale([])).toBeNull();
  });
});

describe("openWindows", () => {
  it("finds interior gaps of 25 minutes or more", () => {
    const items = [
      { start: at(9, 0), end: at(10, 30) },
      { start: at(13, 0), end: at(14, 0) },
    ];
    expect(openWindows(items)).toEqual([{ from: at(10, 30), until: at(13, 0), minutes: 150 }]);
  });

  it("ignores hallway crossings", () => {
    const items = [
      { start: at(10, 0), end: at(11, 0) },
      { start: at(11, 20), end: at(12, 0) },
    ];
    expect(openWindows(items)).toEqual([]);
  });
});

describe("gapAround", () => {
  const scale = railScale([
    { start: at(9, 0), end: at(10, 30) },
    { start: at(13, 0), end: at(14, 0) },
  ]);

  it("reads the span the now-dot sits in, with minutes left", () => {
    expect(
      gapAround(
        [
          { start: at(9, 0), end: at(10, 30) },
          { start: at(13, 0), end: at(14, 0) },
        ],
        NOW,
        scale,
      ),
    ).toMatchObject({ minutes: 150, minutesLeft: 90 });
  });

  it("is null while in class", () => {
    expect(
      gapAround(
        [{ start: at(9, 0), end: at(10, 30) }],
        at(9, 30),
        railScale([{ start: at(9, 0), end: at(10, 30) }]),
      ),
    ).toBeNull();
  });

  it("opens with the rail when nothing has started yet", () => {
    expect(
      gapAround(
        [{ start: at(9, 0), end: at(10, 30) }],
        at(8, 45),
        railScale([{ start: at(9, 0), end: at(10, 30) }]),
      ),
    ).toMatchObject({ minutesLeft: 15 });
  });
});

describe("windowLabel", () => {
  it("says minutes, then hours and minutes", () => {
    expect(windowLabel(45)).toBe("45m");
    expect(windowLabel(60)).toBe("1h");
    expect(windowLabel(80)).toBe("1h 20m");
    expect(windowLabel(600)).toBe("10h");
  });
});

describe("tomorrowFirst", () => {
  it("picks tomorrow's earliest commitment", () => {
    expect(
      tomorrowFirst([
        { start: D(2026, 9, 20, 14, 0), title: "MA1501", kind: "class" },
        { start: D(2026, 9, 20, 10, 0), title: "CS2101", kind: "class" },
      ]),
    ).toEqual({ start: D(2026, 9, 20, 10, 0), title: "CS2101", kind: "class" });
  });
});

describe("fuseDueItems", () => {
  it("merges tasks and assignments, dropping synced duplicates", () => {
    const tasks = [
      {
        id: 1,
        title: "Report",
        status: "pending",
        module_code: "CS2103",
        source_type: "canvas",
        source_id: 77,
        effective_due_at: "2026-09-24T09:00:00Z",
      },
      { id: 2, title: "Buy litter", status: "pending", effective_due_at: "2026-09-20T05:00:00Z" },
      { id: 3, title: "Done thing", status: "done", effective_due_at: "2026-09-21T05:00:00Z" },
      { id: 4, title: "No date", status: "pending" },
    ];
    const assignments = [
      { id: 77, title: "Report", due_at: "2026-09-24T09:00:00Z", course_id: 9 },
      { id: 88, title: "Quiz 2", due_at: "2026-09-26T13:00:00Z", course_id: 9 },
    ];
    const courses = [{ id: 9, course_code: "CS2103" }];
    const fused = fuseDueItems(tasks, assignments, courses);
    expect(fused.map((item) => item.id)).toEqual(["task-2", "task-1", "assign-88"]);
    expect(fused[2].courseCode).toBe("CS2103");
  });
});

describe("fortnightBuckets", () => {
  const items = [
    { id: "a", due: D(2026, 9, 17, 12, 0) },
    { id: "b", due: D(2026, 9, 19, 8, 0) },
    { id: "c", due: D(2026, 9, 19, 17, 0) },
    { id: "d", due: D(2026, 9, 24, 9, 0) },
    { id: "e", due: D(2026, 10, 2, 9, 0), kind: "exam" },
  ];

  it("caps overdue ahead of today and fills fourteen columns", () => {
    const { overdue, columns } = fortnightBuckets(items, NOW);
    expect(overdue.map((i) => i.id)).toEqual(["a"]);
    expect(columns).toHaveLength(14);
    expect(columns[0].items.map((i) => i.id)).toEqual(["b", "c"]);
    expect(columns[5].items.map((i) => i.id)).toEqual(["d"]);
    expect(columns[13].items.map((i) => i.id)).toEqual(["e"]);
    expect(columns[13].examCount).toBe(1);
  });

  it("caps the ink at four bars with honest overflow", () => {
    expect(barCount(6)).toEqual({ bars: 4, overflow: 2 });
    expect(barCount(2)).toEqual({ bars: 2, overflow: 0 });
  });
});

describe("ribbonTicks", () => {
  it("collects the hour's arrivals, nearest first, and flags boarding", () => {
    const { ticks, next } = ribbonTicks([
      { service: "A1", minutes: [3, 15, 25] },
      { service: "D1", minutes: [0] },
      { service: "K1", minutes: [70] },
    ]);
    expect(ticks).toEqual([
      { service: "D1", minute: 0, imminent: true },
      { service: "A1", minute: 3, imminent: true },
      { service: "A1", minute: 15, imminent: false },
      { service: "A1", minute: 25, imminent: false },
    ]);
    expect(next).toEqual({ service: "D1", minute: 0, imminent: true });
  });
});

describe("semesterRunway", () => {
  const runway = semesterRunway(NOW);

  it("spans orientation week to the eve of the next one", () => {
    expect(runway.start).toEqual(D(2026, 8, 3));
    expect(runway.end).toEqual(D(2027, 1, 4));
  });

  it("walks the phases in order", () => {
    const types = runway.segments.map((s) => s.type);
    expect(types[0]).toBe("orientation");
    expect(types).toContain("recess");
    expect(types[types.length - 1]).toBe("vacation");
    const recess = runway.segments.find((s) => s.type === "recess");
    expect(recess.start).toEqual(D(2026, 9, 21));
    for (let i = 1; i < runway.segments.length; i += 1) {
      expect(runway.segments[i].start).toEqual(runway.segments[i - 1].end);
    }
  });

  it("rides the span", () => {
    expect(runway.todayFrac).toBeGreaterThan(0.25);
    expect(runway.todayFrac).toBeLessThan(0.35);
  });

  it("names phases for the hover", () => {
    expect(runwayPhaseLabel("recess")).toBe("Recess week");
  });
});
