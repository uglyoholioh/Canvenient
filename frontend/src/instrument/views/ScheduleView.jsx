// Schedule — the horizontal timeline: days stack as rows, time flows left
// to right, and the red now-line crosses today where it belongs. Rows sit
// at a fixed height so the week breathes without stretching, the axis hugs
// the timetable, and the exam dates sit below the grid.
//
// Non-instructional weeks say so in words ("Recess Week") and stay meaningful:
// Canvas events and any tasks the user scheduled that week still render on the
// grid. Only a truly empty week shows a note, and it describes, it doesn't
// push. Class cards carry the full facts: type + class number, module name,
// venue, time, in the voice chosen in Settings (slab / registrar / wash).
// ←/→ move weeks, T returns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCanvasCalendarEvents,
  getSchedule,
  getTasks,
  importIcs,
  importNusmods,
  updateTask,
} from "../../api";
import {
  getAcademicWeek,
  scheduleItemsForDate,
  startOfLocalDay,
  taskDueDate,
  weekDates,
  withCanvasEvents,
  minutesSinceMidnight,
} from "../../components/scheduleUtils";
import { getScheduleCardStyle } from "../scheduleCardStyle";
import { examRows } from "../ledger";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import ClassContextDrawer from "../../components/drawers/ClassContextDrawer";
import "./schedule.css";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Fallback day span — a week with nothing on it still shows a full axis.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 23;

function timeHM(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function ScheduleView({ token }) {
  const [schedule, setSchedule] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [weekAnchor, setWeekAnchor] = useState(() => startOfLocalDay(new Date()));
  const [selected, setSelected] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [nusmodsUrl, setNusmodsUrl] = useState("");
  const [importState, setImportState] = useState({ busy: false, message: "" });
  const [now, setNow] = useState(() => new Date());
  const [fullWeek, setFullWeek] = useState(false);
  const [cardStyle, setCardStyle] = useState(getScheduleCardStyle());
  const fileRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onSettings = () => setCardStyle(getScheduleCardStyle());
    window.addEventListener("settings-updated", onSettings);
    return () => window.removeEventListener("settings-updated", onSettings);
  }, []);

  const load = useCallback(async () => {
    try {
      const base = await getSchedule(token);
      let merged = base;
      try {
        const canvasEvents = await getCanvasCalendarEvents(token);
        merged = withCanvasEvents(base, canvasEvents);
      } catch {
        // Calendar events are additive; the timetable stands alone.
      }
      setSchedule(merged);
    } catch {
      setSchedule({ classes: [], events: [], exams: [] });
    }
    try {
      setTasks((await getTasks(token)) || []);
    } catch {
      setTasks([]);
    }
  }, [token]);

  useEffect(() => {
    load();
    window.addEventListener("canvenient-open-schedule-import", () => setImportOpen(true));
    window.addEventListener("canvenient-import-ics-paths", load);
    return () => {
      window.removeEventListener("canvenient-import-ics-paths", load);
    };
  }, [load]);

  const days = useMemo(() => weekDates(weekAnchor), [weekAnchor]);
  const currentWeekMonday = useMemo(() => {
    const monday = startOfLocalDay(new Date());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
  }, []);
  const isCurrentWeek = days[0].getTime() === currentWeekMonday.getTime();

  const weekItems = useMemo(
    () =>
      days.map((day) =>
        scheduleItemsForDate(schedule || { classes: [], events: [], exams: [] }, day),
      ),
    [schedule, days],
  );

  // Tasks the user scheduled inside the visible week render on the grid too.
  const weekTasks = useMemo(() => {
    const buckets = days.map(() => []);
    for (const task of tasks) {
      if (task.status === "done" || task.status === "completed") continue;
      const due = taskDueDate(task);
      if (!due) continue;
      const dayIndex = days.findIndex(
        (day) =>
          due >= startOfLocalDay(day) &&
          due < new Date(startOfLocalDay(day)).setDate(startOfLocalDay(day).getDate() + 1),
      );
      if (dayIndex >= 0) buckets[dayIndex].push({ ...task, due });
    }
    return buckets;
  }, [tasks, days]);

  const weekendHasItems = weekItems[5].length + weekItems[6].length > 0;
  const weekendHasTasks = weekTasks[5].length + weekTasks[6].length > 0;
  const showWeekend = fullWeek || weekendHasItems || weekendHasTasks;
  const visibleDays = showWeekend ? days : days.slice(0, 5);
  const visibleItems = showWeekend ? weekItems : weekItems.slice(0, 5);
  const visibleTasks = showWeekend ? weekTasks : weekTasks.slice(0, 5);

  // The axis hugs the timetable: an hour of pad around the earliest and
  // latest block, clamped to the day. Empty weeks fall back to the full span.
  const axis = useMemo(() => {
    let earliest = Infinity;
    let latest = -Infinity;
    for (const items of visibleItems) {
      for (const item of items) {
        const startMin = minutesSinceMidnight(item.start);
        const endMin = minutesSinceMidnight(item.end);
        if (endMin <= DEFAULT_START_HOUR * 60 || startMin >= DEFAULT_END_HOUR * 60) continue;
        earliest = Math.min(earliest, startMin);
        latest = Math.max(latest, endMin);
      }
    }
    if (!Number.isFinite(earliest)) {
      return { start: DEFAULT_START_HOUR, end: DEFAULT_END_HOUR };
    }
    return {
      start: Math.max(DEFAULT_START_HOUR, Math.floor(earliest / 60) - 1),
      end: Math.min(DEFAULT_END_HOUR, Math.ceil(latest / 60) + 1),
    };
  }, [visibleItems]);

  const week = getAcademicWeek(weekAnchor);

  const fact = useMemo(() => {
    const range = `${days[0].getDate()}–${days[days.length - 1].getDate()} ${days[days.length - 1].toLocaleDateString([], { month: "short" })}`;
    return `${week?.label || ""} · ${range}`;
  }, [days, week]);

  const toolbarActions = useMemo(
    () => (
      <button
        type="button"
        className="ins-btn"
        onClick={() => setImportOpen(true)}
        title="Import .ics or NUSMods"
      >
        Import
      </button>
    ),
    [],
  );

  const toolbarConfig = useMemo(() => ({ fact, actions: toolbarActions }), [fact, toolbarActions]);
  useWorkspaceToolbar(toolbarConfig);

  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowLeft") {
        setWeekAnchor((prev) => {
          const next = new Date(prev);
          next.setDate(prev.getDate() - 7);
          return next;
        });
      } else if (e.key === "ArrowRight") {
        setWeekAnchor((prev) => {
          const next = new Date(prev);
          next.setDate(prev.getDate() + 7);
          return next;
        });
      } else if (e.key.toLowerCase() === "t") {
        setWeekAnchor(startOfLocalDay(new Date()));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const runImport = async ({ file, url }) => {
    setImportState({ busy: true, message: "" });
    try {
      if (file) {
        await importIcs(token, file, file.name || "timetable.ics");
      } else {
        await importNusmods(token, url);
      }
      setImportState({ busy: false, message: "Imported." });
      setImportOpen(false);
      await load();
      window.dispatchEvent(
        new CustomEvent("canvenient-toast", { detail: { message: "Timetable imported." } }),
      );
    } catch (err) {
      setImportState({ busy: false, message: err.message || "Import failed." });
    }
  };

  const toggleTask = async (task) => {
    const done = task.status === "done" || task.status === "completed";
    const nextStatus = done ? "pending" : "done";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await updateTask(token, task.id, { status: nextStatus });
      window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  };

  const nowMinutes = minutesSinceMidnight(now);
  const upcomingExams = useMemo(() => examRows(schedule?.exams, now), [schedule, now]);
  const axisStartMin = axis.start * 60;
  const axisMinutes = (axis.end - axis.start) * 60;
  const hours = Array.from({ length: axis.end - axis.start }, (_, i) => axis.start + i);
  const axisPct = (minutes) => ((minutes - axisStartMin) / axisMinutes) * 100;

  return (
    <div className="ins-sched">
      <div className="ins-sched-controls">
        <div className="ins-sched-phase">
          <span className="ins-sched-weeklabel">{week?.label || ""}</span>
          <span className="ins-cap ins-mono ins-sched-range">
            {days[0].toLocaleDateString([], { day: "numeric", month: "short" })} –{" "}
            {days[days.length - 1].toLocaleDateString([], { day: "numeric", month: "short" })}
          </span>
        </div>
        <div className="ins-sched-weeknav">
          <div className="ins-seg">
            <button
              type="button"
              className={showWeekend ? "" : "is-active"}
              onClick={() => setFullWeek(false)}
            >
              Mon–Fri
            </button>
            <button
              type="button"
              className={showWeekend ? "is-active" : ""}
              onClick={() => setFullWeek(true)}
            >
              Full week
            </button>
          </div>
          <button
            type="button"
            className="ins-iconbtn"
            onClick={() =>
              setWeekAnchor((prev) => {
                const next = new Date(prev);
                next.setDate(prev.getDate() - 7);
                return next;
              })
            }
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            type="button"
            className={`ins-btn ${isCurrentWeek ? "is-primary" : "is-ghost"}`}
            onClick={() => setWeekAnchor(currentWeekMonday)}
          >
            This week
          </button>
          <button
            type="button"
            className="ins-iconbtn"
            onClick={() =>
              setWeekAnchor((prev) => {
                const next = new Date(prev);
                next.setDate(prev.getDate() + 7);
                return next;
              })
            }
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className={`ins-hgridwrap cards-${cardStyle}`}>
        <div className="ins-hgrid">
          <div className="ins-hgrid-corner" />
          <div className="ins-hgrid-hours">
            {hours.map((hour) => (
              <span
                key={hour}
                className="ins-mono ins-hgrid-hour"
                style={{ left: `${axisPct(hour * 60)}%` }}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>

          {visibleDays.map((day, dayIndex) => {
            const isToday = day.toDateString() === now.toDateString();
            return (
              <div key={dayIndex} className={`ins-hgrid-row ${isToday ? "is-today" : ""}`}>
                <div className="ins-hgrid-dayhead">
                  <span className={`ins-hgrid-dayname ${isToday ? "is-now" : ""}`}>
                    {DAY_LABELS[dayIndex]}
                  </span>
                  <span className="ins-mono ins-hgrid-daydate">{day.getDate()}</span>
                </div>
                <div className="ins-hgrid-track">
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="ins-hgrid-line"
                      style={{ left: `${axisPct(hour * 60)}%` }}
                    />
                  ))}
                  {(visibleItems[dayIndex] || []).map((item) => {
                    const startMin = minutesSinceMidnight(item.start);
                    const endMin = minutesSinceMidnight(item.end);
                    if (endMin <= axisStartMin || startMin >= axis.end * 60) return null;
                    const left = axisPct(Math.max(startMin, axisStartMin));
                    const width =
                      ((Math.min(endMin, axis.end * 60) - Math.max(startMin, axisStartMin)) /
                        axisMinutes) *
                      100;
                    const isSelected = selected?.id === item.id;
                    const typeName = [item.subtitle, item.classNo].filter(Boolean).join(" ");
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`ins-block is-${item.kind} ${isSelected ? "is-selected" : ""}`}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 3.5)}%`,
                          "--tick-color": item.color,
                          // Exam voices re-assert their own ink; drop the
                          // module-coloured one so the class fallback wins.
                          "--block-ink": item.kind === "exam" ? undefined : item.ink,
                        }}
                        onClick={() => item.classId && setSelected(item)}
                        title={`${item.title} — ${typeName || item.subtitle || ""} · ${item.venue} · ${timeHM(item.start)}–${timeHM(item.end)}`}
                      >
                        <span className="ins-block-time ins-mono">
                          {timeHM(item.start)}–{timeHM(item.end)}
                        </span>
                        <span className="ins-block-title">
                          {item.title}
                          {typeName ? ` · ${typeName}` : ""}
                        </span>
                        <span className="ins-block-name ins-cap">{item.moduleName || ""}</span>
                        <span className="ins-block-venue ins-cap">
                          {item.venue !== "Venue not listed" ? item.venue : ""}
                        </span>
                      </button>
                    );
                  })}
                  {(visibleTasks[dayIndex] || []).map((task) => {
                    const due = taskDueDate(task);
                    if (!due) return null;
                    const dueMin = minutesSinceMidnight(due);
                    const left = axisPct(Math.max(dueMin, axisStartMin));
                    return (
                      <button
                        key={`task-${task.id}`}
                        type="button"
                        className="ins-taskblock"
                        style={{ left: `${left}%` }}
                        title={`Task due ${timeHM(due)} — ${task.title}`}
                        onClick={() => toggleTask(task)}
                      >
                        <span className="ins-taskblock-time ins-mono">{timeHM(due)}</span>
                        <span className="ins-taskblock-title">{task.title}</span>
                      </button>
                    );
                  })}
                  {isToday &&
                    isCurrentWeek &&
                    nowMinutes > axisStartMin &&
                    nowMinutes < axis.end * 60 && (
                      <div
                        className="ins-hgrid-nowline"
                        style={{ left: `${axisPct(nowMinutes)}%` }}
                      >
                        <span className="ins-now-dot" />
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {upcomingExams.length > 0 && (
        <section className="ins-sec ins-sched-exams">
          <div className="ins-sec-head">
            <p className="ins-label">Exams</p>
            <span className="ins-mono ins-cap">{upcomingExams.length}</span>
          </div>
          {upcomingExams.map((exam) => (
            <div key={exam.id} className="ins-examrow">
              <span className="ins-vt-title">{exam.moduleCode}</span>
              <span className="ins-mono ins-cap ins-examrow-when">
                {exam.start.toLocaleDateString([], {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
                {" · "}
                {timeHM(exam.start)}
                {exam.end ? `–${timeHM(exam.end)}` : ""}
              </span>
            </div>
          ))}
        </section>
      )}

      {schedule &&
        visibleItems.every((items) => items.length === 0) &&
        visibleTasks.every((tasks) => tasks.length === 0) && (
          <div className="ins-empty ins-sched-empty">
            {week?.type === "recess" || week?.type === "vacation" ? (
              <span>{week.label} — no classes scheduled</span>
            ) : week?.type === "exam" ? (
              <span>No exams scheduled this week</span>
            ) : (
              <span>No classes this week</span>
            )}
          </div>
        )}

      {selected && (
        <ClassContextDrawer
          item={selected}
          token={token}
          onClose={() => setSelected(null)}
          onContextChanged={load}
        />
      )}

      {importOpen && (
        <div
          className="ins-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setImportOpen(false);
          }}
        >
          <section
            className="ins-sheet ins-import"
            role="dialog"
            aria-modal="true"
            aria-label="Import timetable"
          >
            <header className="ins-import-head">
              <h2 className="ins-title">Timetable</h2>
              <button
                type="button"
                className="ins-iconbtn"
                onClick={() => setImportOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="ins-import-body">
              <div className="ins-import-row">
                <span className="ins-sub">From NUSMods share link</span>
                <div className="ins-import-inline">
                  <input
                    className="ins-input"
                    placeholder="https://nusmods.com/timetable/sem-1/share?…"
                    value={nusmodsUrl}
                    onChange={(e) => setNusmodsUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ins-btn is-primary"
                    disabled={!nusmodsUrl.trim() || importState.busy}
                    onClick={() => runImport({ url: nusmodsUrl.trim() })}
                  >
                    Import
                  </button>
                </div>
              </div>
              <div className="ins-import-row">
                <span className="ins-sub">From an .ics file</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ics,text/calendar"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) runImport({ file });
                  }}
                />
                <button type="button" className="ins-btn" onClick={() => fileRef.current?.click()}>
                  Choose file…
                </button>
              </div>
              {importState.message && <p className="ins-cap">{importState.message}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
