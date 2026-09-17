// Schedule — the Registrar look: a print-timetable grid that states the
// week. Phase strip on top, weekend collapsed until it has somewhere to be,
// class sheets open in the context drawer. ←/→ move weeks, T returns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCanvasCalendarEvents, getSchedule, importIcs, importNusmods } from "../../api";
import {
  getAcademicWeek,
  scheduleItemsForDate,
  startOfLocalDay,
  weekDates,
  withCanvasEvents,
  minutesSinceMidnight,
} from "../../components/scheduleUtils";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import ClassContextDrawer from "../../components/drawers/ClassContextDrawer";
import "./schedule.css";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const START_HOUR = 8;
const END_HOUR = 23;
const HOUR_HEIGHT = 52;

function timeHM(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Semester phase model for the strip: a window around the current week,
// collapsed into runs (instructional weeks, recess, reading, exams).
function semesterPhases(now) {
  const segments = [];
  const monday = startOfLocalDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 8 * 7);
  for (let offset = 0; offset <= 22; offset += 1) {
    const probe = new Date(monday);
    probe.setDate(monday.getDate() + offset * 7);
    const week = getAcademicWeek(probe);
    if (!week) continue;
    const last = segments[segments.length - 1];
    if (
      last &&
      last.type === week.type &&
      week.type === "instructional" &&
      last.endWeek + 1 === week.weekNumber
    ) {
      last.endWeek = week.weekNumber;
      last.endDate = probe;
    } else if (last && last.type === week.type && week.type !== "instructional") {
      last.count += 1;
      last.endDate = probe;
    } else {
      segments.push({
        type: week.type,
        label: week.type === "instructional" ? "W" : week.label.replace(" Week", ""),
        startWeek: week.weekNumber ?? 0,
        endWeek: week.weekNumber ?? 0,
        count: 1,
        startDate: new Date(probe),
        endDate: new Date(probe),
      });
    }
  }
  return segments;
}

export default function ScheduleView({ token }) {
  const [schedule, setSchedule] = useState(null);
  const [weekAnchor, setWeekAnchor] = useState(() => startOfLocalDay(new Date()));
  const [selected, setSelected] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [nusmodsUrl, setNusmodsUrl] = useState("");
  const [importState, setImportState] = useState({ busy: false, message: "" });
  const [now, setNow] = useState(() => new Date());
  const [fullWeek, setFullWeek] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
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
  }, [token]);

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener("canvenient-open-schedule-import", () => setImportOpen(true));
    window.addEventListener("canvenient-import-ics-paths", onChanged);
    return () => {
      window.removeEventListener("canvenient-import-ics-paths", onChanged);
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

  const weekendHasItems = weekItems[5].length + weekItems[6].length > 0;
  const showWeekend = fullWeek || weekendHasItems;
  const visibleDays = showWeekend ? days : days.slice(0, 5);
  const visibleItems = showWeekend ? weekItems : weekItems.slice(0, 5);

  const week = getAcademicWeek(weekAnchor);
  const phases = useMemo(() => semesterPhases(new Date()), []);

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

  const nowMinutes = minutesSinceMidnight(now);
  const nowDayIndex = (now.getDay() + 6) % 7;
  const hourRange = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  return (
    <div className="ins-sched">
      <div className="ins-sched-controls">
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
        <div className="ins-sched-weeknav">
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
            className={`ins-btn ${isCurrentWeek ? "" : "is-ghost"}`}
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

      {phases.length > 0 && (
        <div className="ins-phases" role="img" aria-label="Semester phases">
          {phases.map((segment, index) => {
            const isActive =
              week &&
              segment.type === week.type &&
              (segment.type !== "instructional" ||
                (week.weekNumber >= segment.startWeek && week.weekNumber <= segment.endWeek));
            return (
              <button
                key={index}
                type="button"
                className={`ins-phase is-${segment.type} ${isActive ? "is-active" : ""}`}
                onClick={() => setWeekAnchor(new Date(segment.startDate))}
                title={
                  segment.type === "instructional"
                    ? `Weeks ${segment.startWeek}–${segment.endWeek}`
                    : segment.label
                }
              >
                {segment.type === "instructional"
                  ? `W${segment.startWeek}${segment.endWeek !== segment.startWeek ? `–${segment.endWeek}` : ""}`
                  : segment.label}
                {isActive && <span className="ins-phase-marker" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="ins-gridwrap">
        <div className="ins-grid" style={{ "--hour-h": `${HOUR_HEIGHT}px` }}>
          <div className="ins-grid-gutter">
            <div className="ins-grid-dayhead" />
            {hourRange.map((hour) => (
              <div key={hour} className="ins-grid-hour ins-mono">
                {String(hour).padStart(2, "0")}
              </div>
            ))}
          </div>
          {visibleDays.map((day, dayIndex) => {
            const isToday = day.toDateString() === now.toDateString();
            return (
              <div key={dayIndex} className={`ins-grid-day ${isToday ? "is-today" : ""}`}>
                <div className="ins-grid-dayhead">
                  <span className={isToday ? "ins-grid-daynum is-now" : "ins-grid-daynum"}>
                    {DAY_LABELS[(dayIndex + (showWeekend ? 0 : 0)) % 7]} {day.getDate()}
                  </span>
                </div>
                <div className="ins-grid-cells">
                  {hourRange.map((hour) => (
                    <div key={hour} className="ins-grid-cell" />
                  ))}
                </div>
                <div className="ins-grid-blocks">
                  {(visibleItems[dayIndex] || []).map((item) => {
                    const startMin = minutesSinceMidnight(item.start);
                    const endMin = minutesSinceMidnight(item.end);
                    if (endMin <= START_HOUR * 60 || startMin >= END_HOUR * 60) return null;
                    const top =
                      ((Math.max(startMin, START_HOUR * 60) - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      ((Math.min(endMin, END_HOUR * 60) - Math.max(startMin, START_HOUR * 60)) /
                        60) *
                        HOUR_HEIGHT -
                        2,
                      18,
                    );
                    const isSelected = selected?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`ins-block is-${item.kind} ${isSelected ? "is-selected" : ""}`}
                        style={{
                          top,
                          height,
                          "--tick-color": item.color,
                          "--block-tint": `color-mix(in srgb, ${item.color} 13%, transparent)`,
                          "--block-tint-selected": `color-mix(in srgb, ${item.color} 24%, transparent)`,
                        }}
                        onClick={() => item.classId && setSelected(item)}
                        title={`${item.title} ${timeHM(item.start)}–${timeHM(item.end)}`}
                      >
                        <span className="ins-block-time ins-mono">
                          {timeHM(item.start)}–{timeHM(item.end)}
                        </span>
                        <span className="ins-block-title">{item.title}</span>
                        {height > 40 && (
                          <span className="ins-block-meta ins-cap">
                            {[item.subtitle, item.venue !== "Venue not listed" ? item.venue : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {isToday &&
                    isCurrentWeek &&
                    nowMinutes > START_HOUR * 60 &&
                    nowMinutes < END_HOUR * 60 && (
                      <div
                        className="ins-grid-nowline"
                        style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
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

      {schedule && visibleItems.every((items) => items.length === 0) && (
        <div className="ins-empty">No scheduled items this week</div>
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
