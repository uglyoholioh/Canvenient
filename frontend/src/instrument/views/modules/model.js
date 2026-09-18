// Pure logic behind the Modules views — bucketing, runway math, inbox
// grouping, selection persistence. No React, no fetches: everything here
// is unit-testable on plain data.

export const SEL_KEY = "canvenient.instrument.modules.sel";
export const SELECTION_KINDS = ["semester", "deadlines", "inbox", "grades", "course"];
export const DEFAULT_SELECTION = { kind: "semester", courseId: null };

export function readSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEL_KEY) || "null");
    if (raw && SELECTION_KINDS.includes(raw.kind)) return raw;
  } catch {
    // fall through to the default view
  }
  return DEFAULT_SELECTION;
}

export function writeSelection(selection) {
  localStorage.setItem(SEL_KEY, JSON.stringify(selection));
}

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function relativeDay(iso, now) {
  if (!iso) return "";
  const date = new Date(iso);
  // Calendar-day difference, not elapsed rounding — a 23:59 due tonight must
  // still read "today" at 02:00.
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (dayDiff === 0) return `today ${time}`;
  if (dayDiff === 1) return `tomorrow ${time}`;
  if (dayDiff === -1) return "yesterday";
  if (dayDiff < 0) return `${-dayDiff}d ago`;
  if (dayDiff <= 6) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function parseGradePercent(grade) {
  if (grade == null) return null;
  const m = String(grade).match(/([\d.]+)\s*%?/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

// Every dated assignment across courses, bucketed by distance from now.
export function bucketDeadlines(assignments, courses, now) {
  const buckets = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);
  const tomorrowEnd = new Date(dayEnd);
  tomorrowEnd.setDate(dayEnd.getDate() + 1);
  const weekEnd = new Date(dayStart);
  weekEnd.setDate(dayStart.getDate() + 7);
  for (const a of assignments || []) {
    if (!a.due_at) continue;
    const due = new Date(a.due_at);
    const c = (courses || []).find((x) => String(x.id) === String(a.course_id));
    const row = { ...a, due, courseCode: c?.course_code, color: c?.color };
    if (due < dayStart) buckets.overdue.push(row);
    else if (due < dayEnd) buckets.today.push(row);
    else if (due < tomorrowEnd) buckets.tomorrow.push(row);
    else if (due < weekEnd) buckets.week.push(row);
    else buckets.later.push(row);
  }
  Object.values(buckets).forEach((list) => list.sort((a, b) => a.due - b.due));
  return buckets;
}

// First thing that should claim the runway band: the oldest overdue item,
// else the nearest upcoming one.
export function bandItem(buckets) {
  return buckets.overdue[0] || buckets.today[0] || buckets.tomorrow[0] || buckets.week[0] || null;
}

const WEEK_MS = 7 * 86400000;

export function humanizeLeft(ms) {
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(ms / 3600000);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(ms / 86400000);
  if (days < 21) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

// Runway: how much of a one-week horizon is left before the due date.
// Length and tone carry the urgency — the caption carries the absolute time.
export function runwayFor(dueIso, now) {
  if (!dueIso) return null;
  const due = new Date(dueIso);
  const left = due - now;
  if (left <= 0) return { fraction: 0, tone: "overdue", left: 0 };
  const fraction = Math.max(0.02, Math.min(1, left / WEEK_MS));
  const tone = left <= 86400000 ? "urgent" : left <= 3 * 86400000 ? "soon" : "calm";
  return { fraction, tone, left };
}

export function upcomingCounts(assignments, now) {
  const counts = new Map();
  for (const a of assignments || []) {
    if (!a.due_at || new Date(a.due_at) < now) continue;
    counts.set(String(a.course_id), (counts.get(String(a.course_id)) || 0) + 1);
  }
  return counts;
}

export function courseNextDue(assignments, courseId, now) {
  let best = null;
  for (const a of assignments || []) {
    if (!a.due_at || String(a.course_id) !== String(courseId)) continue;
    const due = new Date(a.due_at);
    if (due < now) continue;
    if (!best || due < best.due) best = { ...a, due };
  }
  return best;
}

const FRESH_MS = 2 * 86400000;
const WEEK_MS_GROUP = 7 * 86400000;

export function postedAt(item) {
  return item.posted_at || item.created_at || null;
}

// Inbox grouping — New (48h), This week, Earlier — so identical-looking
// rows stop competing for attention.
const postedTs = (item) => {
  const at = postedAt(item);
  return at ? new Date(at).getTime() : 0;
};

export function groupAnnouncements(list, now) {
  const groups = { new: [], week: [], earlier: [] };
  for (const item of list || []) {
    const at = postedAt(item);
    const age = at ? now - new Date(at) : Infinity;
    if (age <= FRESH_MS) groups.new.push(item);
    else if (age <= WEEK_MS_GROUP) groups.week.push(item);
    else groups.earlier.push(item);
  }
  const byNewest = (a, b) => postedTs(b) - postedTs(a);
  return [
    { key: "new", label: "New", items: groups.new.sort(byNewest) },
    { key: "week", label: "This week", items: groups.week.sort(byNewest) },
    { key: "earlier", label: "Earlier", items: groups.earlier.sort(byNewest) },
  ].filter((g) => g.items.length > 0);
}

export function freshPostCount(list, now) {
  return (list || []).filter((item) => {
    const at = postedAt(item);
    return at ? now - new Date(at) <= FRESH_MS : false;
  }).length;
}
