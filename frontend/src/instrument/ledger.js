// Pure logic behind the Today ledger — the day rail, the fortnight strip,
// the departure ribbon, and the semester runway. No React, no fetches, no
// localStorage: everything here runs on plain data so it can be tested.

import { getAcademicWeek, SEMESTER_STARTS, startOfLocalDay } from "../components/scheduleUtils";

const RAIL_PAD_MIN = 45;
const RAIL_EARLIEST_MIN = 7 * 60;
const RAIL_LATEST_MIN = 24 * 60;

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function addDays(date, days) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseISODate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---- The day rail ---------------------------------------------------------
//
// The rail shows the day's shape: it pads 45 minutes around the first and
// last commitment so blocks never touch the edges, clamped to a 07:00–24:00
// frame. An empty day has no shape, so the scale is null and the caller
// renders the quiet clear-day line instead.

export function railScale(items) {
  if (!items || items.length === 0) return null;
  let startMin = Infinity;
  let endMin = -Infinity;
  for (const item of items) {
    startMin = Math.min(startMin, minutesOfDay(item.start));
    endMin = Math.max(endMin, minutesOfDay(item.end));
    if (minutesOfDay(item.end) === 0 && item.end.getDay() !== item.start.getDay()) {
      endMin = RAIL_LATEST_MIN;
    }
  }
  if (!Number.isFinite(startMin)) return null;
  startMin = Math.max(RAIL_EARLIEST_MIN, startMin - RAIL_PAD_MIN);
  endMin = Math.min(RAIL_LATEST_MIN, Math.max(endMin + RAIL_PAD_MIN, startMin + 120));
  return { startMin, endMin };
}

// Interior gaps between commitments, long enough to be a place rather than a
// hallway crossing.
export function openWindows(items, minGapMin = 25) {
  const windows = [];
  const sorted = [...(items || [])].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    const from = sorted[i - 1].end;
    const until = sorted[i].start;
    const minutes = Math.round((until - from) / 60000);
    if (minutes >= minGapMin) windows.push({ from, until, minutes });
  }
  return windows;
}

// The span the now-dot sits in when it is between commitments — with the one
// number worth saying out loud: how long until the next one starts.
export function gapAround(items, now, scale) {
  if (!scale || !items?.length) return null;
  let from = null;
  let until = null;
  for (const item of items) {
    if (item.start <= now && now < item.end) return null;
    if (item.end <= now && (!from || item.end > from)) from = item.end;
    if (item.start > now && (!until || item.start < until)) until = item.start;
  }
  if (from === null && until === null) return null;
  const dayStart = startOfLocalDay(now);
  const scaleStart = dayStart.getTime() + scale.startMin * 60000;
  const scaleEnd = dayStart.getTime() + scale.endMin * 60000;
  const windowFrom = from ?? new Date(scaleStart);
  const windowUntil = until ?? new Date(scaleEnd);
  if (now < windowFrom || now >= windowUntil) return null;
  return {
    from: windowFrom,
    until: windowUntil,
    minutes: Math.round((windowUntil - windowFrom) / 60000),
    minutesLeft: Math.ceil((windowUntil - now) / 60000),
  };
}

export function windowLabel(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 16) return `${hours}h`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

// The evening fact: tomorrow's first commitment, read from tomorrow's items.
export function tomorrowFirst(items) {
  if (!items || items.length === 0) return null;
  const first = [...items].sort((a, b) => a.start - b.start)[0];
  return { start: first.start, title: first.title, kind: first.kind };
}

// ---- The fortnight strip --------------------------------------------------
//
// Tasks and canvas assignments fuse into one set of dated items. Assignments
// already synced into the task list are dropped — the task is the checkable
// copy. Pure count, no weights: urgency is never fabricated.

export function fuseDueItems(tasks, assignments, courses = []) {
  const courseCode = (courseId) =>
    courses.find((c) => String(c.id) === String(courseId))?.course_code || null;
  const fused = [];
  const syncedIds = new Set(
    (tasks || [])
      .filter((t) => t.source_type === "canvas" && t.source_id != null)
      .map((t) => String(t.source_id)),
  );
  for (const task of tasks || []) {
    if (task.status === "done") continue;
    const due = task.effective_due_at || task.due_at_override || task.source_due_at;
    if (!due) continue;
    const date = new Date(due);
    if (Number.isNaN(date.getTime())) continue;
    fused.push({
      id: `task-${task.id}`,
      kind: "task",
      due: date,
      title: task.title,
      courseCode: task.module_code || null,
    });
  }
  for (const a of assignments || []) {
    if (!a.due_at || syncedIds.has(String(a.id))) continue;
    const date = new Date(a.due_at);
    if (Number.isNaN(date.getTime())) continue;
    fused.push({
      id: `assign-${a.id}`,
      kind: "assignment",
      due: date,
      title: a.title || a.name,
      courseCode: a.course_code || courseCode(a.course_id),
    });
  }
  return fused.sort((a, b) => a.due - b.due);
}

// One column per day from today, led by an overdue cap when anything is
// overdue. Exams are counted with everything else and flagged so the column
// can carry the amber dot.
export function fortnightBuckets(items, now, days = 14) {
  const today = startOfLocalDay(now);
  const columns = Array.from({ length: days }, (_, index) => ({
    date: addDays(today, index),
    items: [],
    examCount: 0,
  }));
  const overdue = [];
  for (const item of items || []) {
    if (!item.due) continue;
    const dayOffset = Math.round((startOfLocalDay(item.due) - today) / 86400000);
    if (dayOffset < 0) overdue.push(item);
    else if (dayOffset < days) {
      columns[dayOffset].items.push(item);
      if (item.kind === "exam") columns[dayOffset].examCount += 1;
    }
  }
  const byDue = (a, b) => a.due - b.due;
  overdue.sort(byDue);
  columns.forEach((col) => col.items.sort(byDue));
  return { overdue, columns };
}

// Ink bars per column, capped — the "+N" overflow keeps the shape honest
// without growing the strip.
export function barCount(count, cap = 4) {
  return { bars: Math.min(count, cap), overflow: Math.max(0, count - cap) };
}

// ---- The departure ribbon -------------------------------------------------
//
// Every arrival inside the hour becomes one tick at its ETA. The first tick
// is the caption; anything boarding inside three minutes is imminent.

export function ribbonTicks(services, horizonMin = 60, maxTicks = 12) {
  const ticks = [];
  for (const service of services || []) {
    for (const minute of service.minutes || []) {
      if (minute < 0 || minute > horizonMin) continue;
      ticks.push({ service: service.service, minute, imminent: minute <= 3 });
    }
  }
  ticks.sort((a, b) => a.minute - b.minute);
  return { ticks: ticks.slice(0, maxTicks), next: ticks[0] || null };
}

// ---- The semester runway --------------------------------------------------
//
// A hairline spanning orientation week to the eve of the next orientation.
// Segments exist only where life differs from teaching; the now-dot rides the
// span. Labels live in the hover, never in the chrome.

const RUNWAY_LABELS = {
  orientation: "Orientation week",
  instructional: "Teaching",
  recess: "Recess week",
  reading: "Reading week",
  exam: "Exams",
  vacation: "Vacation",
};

export function runwayPhaseLabel(type) {
  return RUNWAY_LABELS[type] || type;
}

// ---- The clock, under user taste ------------------------------------------

export function clockParts(date, { clock = "24h", seconds = true } = {}) {
  const h24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const main =
    clock === "12h" ? `${hour12}:${minutes}` : `${String(h24).padStart(2, "0")}:${minutes}`;
  let tail = "";
  if (seconds) tail += `:${String(date.getSeconds()).padStart(2, "0")}`;
  if (clock === "12h") tail += h24 >= 12 ? " pm" : " am";
  return { main, tail };
}

// ---- Exams, for the dashboard widget and the schedule footer --------------

export function examRows(exams, now, withinDays = 90) {
  const dayStart = startOfLocalDay(now);
  const horizon = dayStart.getTime() + withinDays * 86400000;
  return (exams || [])
    .map((exam) => ({
      id: exam.id,
      moduleCode: exam.module_code,
      title: `${exam.module_code} Exam`,
      start: new Date(exam.start_at),
      end: exam.end_at ? new Date(exam.end_at) : null,
      past: new Date(exam.start_at) < dayStart,
    }))
    .filter((exam) => !Number.isNaN(exam.start.getTime()))
    .filter((exam) => !exam.past && exam.start.getTime() <= horizon)
    .sort((a, b) => a.start - b.start);
}

export function semesterRunway(now) {
  const week = getAcademicWeek(now);
  const semStart = parseISODate(SEMESTER_STARTS[week?.academicYear]?.[week?.semester]);
  if (!semStart) return null;

  const [startYear] = week.academicYear.split("/").map(Number);
  let nextYear = week.academicYear;
  let nextSemester = week.semester + 1;
  if (nextSemester > 4) {
    nextYear = `${startYear + 1}/${startYear + 2}`;
    nextSemester = 1;
  }
  const nextStart = parseISODate(SEMESTER_STARTS[nextYear]?.[nextSemester]);
  if (!nextStart) return null;

  const start = addDays(semStart, -7);
  const end = addDays(nextStart, -7);
  const segments = [];
  const cursor = startOfLocalDay(start);
  while (cursor < end) {
    const type = getAcademicWeek(cursor)?.type || "vacation";
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.end = addDays(cursor, 1);
    } else {
      segments.push({ type, start: new Date(cursor), end: addDays(cursor, 1) });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const spanMs = end.getTime() - start.getTime();
  const todayFrac = Math.max(
    0,
    Math.min(1, (startOfLocalDay(now).getTime() - start.getTime()) / spanMs),
  );
  return { start, end, segments, todayFrac };
}
