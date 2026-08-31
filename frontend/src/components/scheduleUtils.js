export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function weekDates(anchor) {
  const monday = startOfLocalDay(anchor);
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

export function dateAtTime(day, value) {
  const [hours = 0, minutes = 0] = String(value || "00:00").split(":").map(Number);
  const result = startOfLocalDay(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function timelineBlockGeometry(item, startHour, hourHeight = 48, gutter = 2) {
  const startMinutes = minutesSinceMidnight(item.start);
  const endMinutes = minutesSinceMidnight(item.end);
  const rawTop = ((startMinutes - startHour * 60) / 60) * hourHeight;
  const rawHeight = ((endMinutes - startMinutes) / 60) * hourHeight;
  return {
    top: rawTop + gutter / 2,
    height: Math.max(rawHeight - gutter, 44),
  };
}

export function formatScheduleTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function moduleHue(value) {
  let hash = 0;
  for (const character of String(value || "Schedule")) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return 185 + (Math.abs(hash) % 105);
}

export function moduleColor(item, fallbackValue) {
  return item?.module_color || `hsl(${moduleHue(fallbackValue)} 64% 58%)`;
}

export function moduleCardInk(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ""));
  if (!match) return "var(--color-schedule-card-ink-light)";
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  return luminance > 0.18
    ? "var(--color-schedule-card-ink-dark)"
    : "var(--color-schedule-card-ink-light)";
}

function classFallsOnDate(item, selectedDate) {
  if (item.class_date) return item.class_date === localDateKey(selectedDate);
  const numeric = Number(item.day_of_week);
  return Number.isFinite(numeric) && numeric % 7 === selectedDate.getDay();
}

function timedItemOnDate(item, selectedDate) {
  const start = new Date(item.start_at);
  const end = item.end_at ? new Date(item.end_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const dayStart = startOfLocalDay(selectedDate);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  return start < dayEnd && end > dayStart;
}

export function scheduleItemsForDate(schedule, selectedDate) {
  const dayStart = startOfLocalDay(selectedDate);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const items = [];

  for (const item of schedule.classes || []) {
    if (!classFallsOnDate(item, selectedDate)) continue;
    items.push({
      id: `class-${item.id}`,
      kind: "class",
      moduleCode: item.module_code,
      title: item.module_code,
      subtitle: item.lesson_type,
      classNo: item.class_no,
      venue: item.venue || "Venue not listed",
      start: dateAtTime(selectedDate, item.start_time),
      end: dateAtTime(selectedDate, item.end_time),
      hue: moduleHue(item.module_code),
      color: moduleColor(item, item.module_code),
      ink: moduleCardInk(moduleColor(item, item.module_code)),
    });
  }

  for (const item of schedule.events || []) {
    if (!timedItemOnDate(item, selectedDate)) continue;
    const rawStart = new Date(item.start_at);
    const rawEnd = item.end_at ? new Date(item.end_at) : new Date(rawStart.getTime() + 60 * 60 * 1000);
    items.push({
      id: `event-${item.id}`,
      kind: "event",
      title: item.title,
      subtitle: "Event",
      venue: item.venue || "Venue not listed",
      start: rawStart < dayStart ? dayStart : rawStart,
      end: rawEnd > dayEnd ? dayEnd : rawEnd,
      hue: moduleHue(item.title),
      color: "var(--color-schedule-event)",
      ink: "var(--color-schedule-card-ink-light)",
    });
  }

  for (const item of schedule.exams || []) {
    if (!timedItemOnDate(item, selectedDate)) continue;
    const rawStart = new Date(item.start_at);
    const rawEnd = new Date(item.end_at);
    items.push({
      id: `exam-${item.id}`,
      kind: "exam",
      moduleCode: item.module_code,
      title: `${item.module_code} Exam`,
      subtitle: "Exam",
      venue: "Check exam venue",
      start: rawStart,
      end: rawEnd,
      hue: moduleHue(item.module_code),
      color: moduleColor(item, item.module_code),
      ink: moduleCardInk(moduleColor(item, item.module_code)),
    });
  }

  return items.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function describeRelativeStart(item, now) {
  const minutes = Math.round((item.start - now) / 60000);
  if (minutes <= 0 && item.end > now) return "Happening now";
  if (minutes < 60) return `In ${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `In ${hours} hr ${remaining} min` : `In ${hours} hr`;
}

export function taskDueDate(task) {
  const raw = task?.effective_due_at || task?.due_at_override || task?.source_due_at;
  if (!raw) return null;
  const normalized = typeof raw === "string" && !raw.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dashboardAgendaItems(schedule, tasks, now, dayCount = 14) {
  const start = startOfLocalDay(now);
  const agenda = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    scheduleItemsForDate(schedule, day).forEach((item) => {
      agenda.push({ ...item, destination: "schedule" });
    });
  }

  const end = new Date(start);
  end.setDate(start.getDate() + dayCount);
  (tasks || []).forEach((task) => {
    if (task.status === "done") return;
    const due = taskDueDate(task);
    if (!due || due < start || due >= end) return;
    agenda.push({
      id: `task-${task.id}`,
      kind: "task",
      moduleCode: task.module_code,
      title: task.title,
      subtitle: task.module_code ? `${task.module_code} task` : "Task",
      venue: "",
      start: due,
      end: due,
      color: moduleColor(task, task.module_code || task.title),
      destination: "tasks",
    });
  });

  return agenda.sort((left, right) => left.start - right.start || left.title.localeCompare(right.title));
}

export function dashboardAgendaView(items, now, view, limit = 5) {
  const todayStart = startOfLocalDay(now);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);
  const today = items.filter((item) => item.start < tomorrow && item.end >= todayStart);
  const remainingToday = today.filter((item) => item.end >= now);
  const upcoming = items.filter((item) => item.end >= now);

  if (view === "today") return { items: today.slice(0, limit), fallback: false, total: today.length };
  if (view === "upcoming") return { items: upcoming.slice(0, limit), fallback: false, total: upcoming.length };
  if (remainingToday.length) return { items: remainingToday.slice(0, limit), fallback: false, total: remainingToday.length };
  return { items: upcoming.slice(0, limit), fallback: true, total: upcoming.length };
}
