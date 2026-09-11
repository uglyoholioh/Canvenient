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

export const SEMESTER_STARTS = {
  "2023/2024": { 1: "2023-08-07", 2: "2024-01-15", 3: "2024-05-13", 4: "2024-06-24" },
  "2024/2025": { 1: "2024-08-12", 2: "2025-01-13", 3: "2025-05-12", 4: "2025-06-23" },
  "2025/2026": { 1: "2025-08-11", 2: "2026-01-12", 3: "2026-05-11", 4: "2026-06-22" },
  "2026/2027": { 1: "2026-08-10", 2: "2027-01-11", 3: "2027-05-10", 4: "2027-06-21" },
  "2027/2028": { 1: "2027-08-09", 2: "2028-01-10", 3: "2028-05-08", 4: "2028-06-19" },
};

function parseDateOnly(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getMondayOfDate(date) {
  const d = startOfLocalDay(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function getSemesterStart(academicYear, semester) {
  const known = SEMESTER_STARTS[academicYear]?.[semester];
  if (known) return startOfLocalDay(parseDateOnly(known));
  const startYear = parseInt(academicYear.split("/")[0], 10);
  if (semester === 1) {
    const base = new Date(startYear, 7, 8);
    const offset = (base.getDay() + 6) % 7;
    return getMondayOfDate(new Date(startYear, 7, 8 + ((7 - offset) % 7)));
  }
  if (semester === 2) {
    const base = new Date(startYear + 1, 0, 8);
    const offset = (base.getDay() + 6) % 7;
    return getMondayOfDate(new Date(startYear + 1, 0, 8 + ((7 - offset) % 7)));
  }
  if (semester === 3) {
    const base = new Date(startYear + 1, 4, 8);
    const offset = (base.getDay() + 6) % 7;
    return getMondayOfDate(new Date(startYear + 1, 4, 8 + ((7 - offset) % 7)));
  }
  const base = new Date(startYear + 1, 5, 19);
  const offset = (base.getDay() + 6) % 7;
  return getMondayOfDate(new Date(startYear + 1, 5, 19 + ((7 - offset) % 7)));
}

export function getAcademicWeek(date) {
  const d = startOfLocalDay(date);
  const currentMon = getMondayOfDate(d);
  const year = currentMon.getFullYear();

  const candidateAy = `${year}/${year + 1}`;
  const candidateSem1 = getSemesterStart(candidateAy, 1);
  const candidateOrientationMon = new Date(candidateSem1.getTime() - 7 * 86400000);

  let ayStartYear = currentMon >= candidateOrientationMon ? year : year - 1;
  let ay = `${ayStartYear}/${ayStartYear + 1}`;
  let sem1Start = getSemesterStart(ay, 1);
  let sem2Start = getSemesterStart(ay, 2);
  let st1Start = getSemesterStart(ay, 3);
  let st2Start = getSemesterStart(ay, 4);
  const nextAy = `${ayStartYear + 1}/${ayStartYear + 2}`;
  const nextSem1Start = getSemesterStart(nextAy, 1);
  const nextOrientationMon = new Date(nextSem1Start.getTime() - 7 * 86400000);

  const shortAy = `AY${String(ayStartYear).slice(-2)}/${String(ayStartYear + 1).slice(-2)}`;

  let semester;
  let semesterLabel;
  let shortSemester;
  let label;
  let weekNumber = null;
  let type;

  const diffWeeks = (a, b) => Math.round((a.getTime() - b.getTime()) / (7 * 86400000));

  if (currentMon < sem1Start) {
    semester = 1;
    semesterLabel = "Semester 1";
    shortSemester = "Sem 1";
    const diff = diffWeeks(currentMon, sem1Start);
    if (diff === -1) {
      label = "Orientation Week";
      type = "orientation";
    } else {
      label = "Vacation";
      type = "vacation";
    }
  } else if (currentMon < sem2Start) {
    semester = 1;
    semesterLabel = "Semester 1";
    shortSemester = "Sem 1";
    const diff = diffWeeks(currentMon, sem1Start);
    if (diff >= 0 && diff <= 5) {
      weekNumber = diff + 1;
      label = `Week ${weekNumber}`;
      type = "instructional";
    } else if (diff === 6) {
      label = "Recess Week";
      type = "recess";
    } else if (diff >= 7 && diff <= 13) {
      weekNumber = diff;
      label = `Week ${weekNumber}`;
      type = "instructional";
    } else if (diff === 14) {
      label = "Reading Week";
      type = "reading";
    } else if (diff === 15) {
      label = "Exam Week 1";
      type = "exam";
    } else if (diff === 16) {
      label = "Exam Week 2";
      type = "exam";
    } else {
      label = "Vacation";
      type = "vacation";
    }
  } else if (currentMon < st1Start) {
    semester = 2;
    semesterLabel = "Semester 2";
    shortSemester = "Sem 2";
    const diff = diffWeeks(currentMon, sem2Start);
    if (diff >= 0 && diff <= 5) {
      weekNumber = diff + 1;
      label = `Week ${weekNumber}`;
      type = "instructional";
    } else if (diff === 6) {
      label = "Recess Week";
      type = "recess";
    } else if (diff >= 7 && diff <= 13) {
      weekNumber = diff;
      label = `Week ${weekNumber}`;
      type = "instructional";
    } else if (diff === 14) {
      label = "Reading Week";
      type = "reading";
    } else if (diff === 15) {
      label = "Exam Week 1";
      type = "exam";
    } else if (diff === 16) {
      label = "Exam Week 2";
      type = "exam";
    } else {
      label = "Vacation";
      type = "vacation";
    }
  } else if (currentMon < st2Start) {
    semester = 3;
    semesterLabel = "Special Term I";
    shortSemester = "ST I";
    const diff = diffWeeks(currentMon, st1Start);
    if (diff >= 0 && diff <= 5) {
      weekNumber = diff + 1;
      label = `ST I Week ${weekNumber}`;
      type = "instructional";
    } else {
      label = "Vacation";
      type = "vacation";
    }
  } else if (currentMon < nextOrientationMon) {
    semester = 4;
    semesterLabel = "Special Term II";
    shortSemester = "ST II";
    const diff = diffWeeks(currentMon, st2Start);
    if (diff >= 0 && diff <= 5) {
      weekNumber = diff + 1;
      label = `ST II Week ${weekNumber}`;
      type = "instructional";
    } else {
      label = "Vacation";
      type = "vacation";
    }
  } else {
    return getAcademicWeek(currentMon);
  }

  return {
    academicYear: ay,
    shortAcademicYear: shortAy,
    semester,
    semesterLabel,
    shortSemester,
    weekNumber,
    label,
    type,
    formatted: `${shortAy} ${shortSemester} · ${label}`,
  };
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
  return item?.module_color || (fallbackValue ? `hsl(${moduleHue(fallbackValue)} 64% 58%)` : undefined);
}

export function getTaskModuleColor(task, modules = []) {
  if (!task) return null;
  if (task.module_color) return task.module_color;
  if (task.module_id && Array.isArray(modules) && modules.length > 0) {
    const mod = modules.find((m) => m.id === task.module_id || String(m.id) === String(task.module_id));
    if (mod?.color) return mod.color;
    if (mod?.module_code) return moduleColor(mod, mod.module_code);
  }
  const code = task.module_code || (Array.isArray(modules) && modules.find((m) => m.id === task.module_id || String(m.id) === String(task.module_id))?.module_code);
  if (code) {
    if (Array.isArray(modules) && modules.length > 0) {
      const mod = modules.find((m) => m.module_code === code);
      if (mod?.color) return mod.color;
    }
    return moduleColor(task, code);
  }
  return null;
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

export function formatWeeksLabel(weeks) {
  if (!weeks) return "";
  if (typeof weeks === "string") return weeks;
  if (typeof weeks === "object" && !Array.isArray(weeks)) {
    if (Array.isArray(weeks.weeks)) return formatWeeksLabel(weeks.weeks);
    if (weeks.start && weeks.end) {
      const [sy, sm, sd] = String(weeks.start).split("-").map(Number);
      const [ey, em, ed] = String(weeks.end).split("-").map(Number);
      if (sy && ey) {
        const sDate = new Date(sy, sm - 1, sd);
        const eDate = new Date(ey, em - 1, ed);
        const sStr = sDate.toLocaleDateString([], { day: "numeric", month: "short" });
        const eStr = eDate.toLocaleDateString([], { day: "numeric", month: "short" });
        return `${sStr} – ${eStr}`;
      }
      return `${weeks.start} – ${weeks.end}`;
    }
    return "";
  }
  if (!Array.isArray(weeks) || weeks.length === 0) return "";
  const sorted = Array.from(new Set(weeks.map(Number))).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return `Week ${sorted[0]}`;

  if (sorted.length === 13 && sorted[0] === 1 && sorted[12] === 13) {
    return "Weeks 1–13";
  }

  const isOdd = sorted.every((w) => w % 2 === 1);
  const isStep2 = sorted.slice(1).every((w, i) => w - sorted[i] === 2);
  if (isOdd && isStep2) {
    if (sorted[0] === 1 && sorted[sorted.length - 1] === 13) return "Odd Weeks";
    return `Weeks ${sorted[0]}–${sorted[sorted.length - 1]} (Odd)`;
  }

  const isEven = sorted.every((w) => w % 2 === 0);
  if (isEven && isStep2) {
    if (sorted[0] === 2 && sorted[sorted.length - 1] === 12) return "Even Weeks";
    return `Weeks ${sorted[0]}–${sorted[sorted.length - 1]} (Even)`;
  }

  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : prev === start + 1 ? `${start}, ${prev}` : `${start}–${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : prev === start + 1 ? `${start}, ${prev}` : `${start}–${prev}`);

  return ranges.length === 1 && ranges[0].includes("–")
    ? `Weeks ${ranges[0]}`
    : ranges.length === sorted.length && sorted.length <= 3
    ? `Weeks ${sorted.join(", ")}`
    : `Weeks ${ranges.join(", ")}`;
}

export function isClassHappeningInWeek(item, targetDate) {
  if (item.class_date) {
    return item.class_date === localDateKey(targetDate);
  }
  const numeric = Number(item.day_of_week);
  if (!Number.isFinite(numeric) || numeric % 7 !== targetDate.getDay()) {
    return false;
  }
  const weekInfo = getAcademicWeek(targetDate);
  if (!item.weeks) {
    return weekInfo.type === "instructional" && weekInfo.weekNumber >= 1 && weekInfo.weekNumber <= 13;
  }
  if (weekInfo.type !== "instructional" || !weekInfo.weekNumber) {
    return false;
  }
  if (Array.isArray(item.weeks)) {
    return item.weeks.map(Number).includes(weekInfo.weekNumber);
  }
  if (typeof item.weeks === "object" && item.weeks.start && item.weeks.end) {
    const key = localDateKey(targetDate);
    return key >= item.weeks.start && key <= item.weeks.end;
  }
  return true;
}

function classFallsOnDate(item, selectedDate) {
  return isClassHappeningInWeek(item, selectedDate);
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
      classId: item.id,
      occurrenceDate: localDateKey(selectedDate),
      moduleCode: item.module_code,
      moduleName: item.module_name,
      title: item.module_code,
      subtitle: item.lesson_type,
      classNo: item.class_no,
      venue: item.venue || "Venue not listed",
      start: dateAtTime(selectedDate, item.start_time),
      end: dateAtTime(selectedDate, item.end_time),
      hue: moduleHue(item.module_code),
      color: moduleColor(item, item.module_code),
      ink: moduleCardInk(moduleColor(item, item.module_code)),
      // The backend merges per-date overrides; attend_in_person is effective.
      attendInPerson: item.attend_in_person !== false,
      linkedTaskCount: Number(item.linked_task_count || 0),
      linkedNoteCount: Number(item.linked_note_count || 0),
      linkedFileCount: Number(item.linked_file_count || 0),
      weeks: item.weeks,
      weeksLabel: formatWeeksLabel(item.weeks),
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
    scheduleItemsForDate(schedule, day).filter((item) => item.attendInPerson !== false).forEach((item) => {
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
