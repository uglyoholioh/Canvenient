import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileUp, Link2, Loader2, MapPin, Upload, X } from "lucide-react";
import { getSchedule, importIcs, importNusmods } from "../api";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";
import {
  formatScheduleTime,
  localDateKey,
  minutesSinceMidnight,
  scheduleItemsForDate,
  startOfLocalDay,
  timelineBlockGeometry,
  weekDates,
} from "./scheduleUtils";

const EMPTY_SCHEDULE = { classes: [], exams: [], events: [] };
const HOUR_HEIGHT = 48;

function TimelineItem({ item, startHour, now, isToday }) {
  const { top, height } = timelineBlockGeometry(item, startHour, HOUR_HEIGHT);
  const isPast = isToday && item.end <= now;
  const isCurrent = isToday && item.start <= now && item.end > now;

  return (
    <article
      className={`schedule-timeline-item is-${item.kind} ${isPast ? "is-past" : ""} ${isCurrent ? "is-current" : ""}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        "--module-color": item.color,
        "--module-ink": item.ink,
      }}
      aria-label={`${item.title}, ${formatScheduleTime(item.start)} to ${formatScheduleTime(item.end)}, ${item.subtitle}${item.classNo ? ` ${item.classNo}` : ""}, ${item.venue}`}
    >
      <div className="schedule-item-time">
        <strong>{formatScheduleTime(item.start)}</strong>
        <span>to {formatScheduleTime(item.end)}</span>
      </div>
      <div className="schedule-item-copy">
        <div><strong>{item.title}</strong><span>{item.subtitle}{item.classNo ? ` · ${item.classNo}` : ""}</span></div>
        <small><MapPin size={11} />{item.venue}</small>
      </div>
      {(isCurrent || isPast || item.kind === "exam") && (
        <span className="schedule-item-state">{isCurrent ? "Now" : isPast ? "Past" : "Exam"}</span>
      )}
    </article>
  );
}

export default function Schedule({ token }) {
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE);
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [nusmodsUrl, setNusmodsUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const timelineScrollRef = useRef(null);

  const loadSchedule = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setSchedule((await getSchedule(token)) || EMPTY_SCHEDULE);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Could not load your schedule.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSchedule();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSchedule]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const days = useMemo(() => weekDates(selectedDate), [selectedDate]);
  const items = useMemo(() => scheduleItemsForDate(schedule, selectedDate), [schedule, selectedDate]);
  const isToday = localDateKey(selectedDate) === localDateKey(now);
  const selectedDateMinutes = isToday ? minutesSinceMidnight(now) : 12 * 60;
  const earliestMinutes = items.length ? Math.min(...items.map((item) => minutesSinceMidnight(item.start)), selectedDateMinutes) : Math.min(8 * 60, selectedDateMinutes);
  const latestMinutes = items.length ? Math.max(...items.map((item) => minutesSinceMidnight(item.end)), selectedDateMinutes + 60) : Math.max(18 * 60, selectedDateMinutes + 60);
  const startHour = Math.max(0, Math.min(8, Math.floor(earliestMinutes / 60)));
  const endHour = Math.min(24, Math.max(18, Math.ceil(latestMinutes / 60)));
  const timelineHeight = (endHour - startHour) * HOUR_HEIGHT;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const classCount = items.filter((item) => item.kind === "class").length;
  const otherCount = items.length - classCount;

  useEffect(() => {
    if (loading || !timelineScrollRef.current) return;
    if (!isToday) {
      timelineScrollRef.current.scrollTop = 0;
      return;
    }
    const currentTop = ((minutesSinceMidnight(now) - startHour * 60) / 60) * HOUR_HEIGHT;
    timelineScrollRef.current.scrollTop = Math.max(currentTop - 170, 0);
  }, [isToday, loading, now, startHour, timelineHeight]);

  const moveWeek = (direction) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + direction * 7);
    setSelectedDate(startOfLocalDay(next));
  };

  const goToday = () => setSelectedDate(startOfLocalDay(new Date()));

  const finishImport = useCallback(async (result) => {
    await loadSchedule();
    setNotice(`Imported ${result.classes || 0} classes${result.exams ? ` and ${result.exams} exams` : ""}.`);
    setError("");
    setIsImportOpen(false);
  }, [loadSchedule]);

  const importCalendarData = useCallback(async (data, fileName = "timetable.ics") => {
    setImporting(true);
    try {
      await finishImport(await importIcs(token, data, fileName));
    } catch (importError) {
      setError(importError.message || "Could not import that calendar file.");
    } finally {
      setImporting(false);
    }
  }, [finishImport, token]);

  const importCalendarPath = useCallback(async (path) => {
    if (!window.__TAURI_IPC__) return;
    const { invoke } = await import("@tauri-apps/api/tauri");
    const bytes = await invoke("read_calendar_file", { path });
    await importCalendarData(new Uint8Array(bytes), path.split(/[\\/]/).pop() || "timetable.ics");
  }, [importCalendarData]);

  const chooseCalendarFile = async () => {
    if (!window.__TAURI_IPC__) {
      document.getElementById("schedule-ics-fallback")?.click();
      return;
    }
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const path = await open({ multiple: false, filters: [{ name: "iCalendar", extensions: ["ics"] }] });
      if (typeof path === "string") await importCalendarPath(path);
    } catch (importError) {
      setError(importError.message || "Could not open that calendar file.");
    }
  };

  useEffect(() => {
    const openImport = () => { setError(""); setIsImportOpen(true); };
    const importPaths = (event) => {
      const paths = Array.isArray(event.detail) ? event.detail : [];
      if (paths[0]) importCalendarPath(paths[0]).catch((importError) => setError(importError.message || "Could not import that calendar file."));
    };
    const closeImport = (event) => { if (event.key === "Escape") setIsImportOpen(false); };
    window.addEventListener("canvenient-open-schedule-import", openImport);
    window.addEventListener("canvenient-import-ics-paths", importPaths);
    window.addEventListener("keydown", closeImport);
    return () => {
      window.removeEventListener("canvenient-open-schedule-import", openImport);
      window.removeEventListener("canvenient-import-ics-paths", importPaths);
      window.removeEventListener("keydown", closeImport);
    };
  }, [importCalendarPath]);

  const toolbarConfig = useMemo(() => ({
    title: selectedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
    subtitle: items.length ? `${items.length} scheduled ${items.length === 1 ? "item" : "items"}` : "Nothing scheduled",
    actions: (
      <>
        {!isToday && <button type="button" className="mac-toolbar-action" onClick={goToday}>Today</button>}
        <button type="button" className="mac-toolbar-action is-primary" onClick={() => { setError(""); setIsImportOpen(true); }}><Upload size={14} />Import</button>
      </>
    ),
  }), [isToday, items.length, selectedDate]);
  useWorkspaceToolbar(toolbarConfig);

  const handleNusmodsImport = async (event) => {
    event.preventDefault();
    if (!nusmodsUrl.trim()) return;
    setImporting(true);
    try {
      const result = await importNusmods(token, nusmodsUrl.trim());
      setNusmodsUrl("");
      await finishImport(result);
    } catch (importError) {
      setError(importError.message || "Could not import that NUSMods timetable.");
    } finally {
      setImporting(false);
    }
  };

  const handleIcsImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importCalendarData(file, file.name);
    event.target.value = "";
  };

  return (
    <div className="schedule-page">
      <nav className="schedule-week-strip" aria-label="Select schedule date">
        <button type="button" className="schedule-week-arrow" onClick={() => moveWeek(-1)} aria-label="Previous week"><ChevronLeft size={16} /></button>
        <div className="schedule-week-days">
          {days.map((day) => {
            const active = localDateKey(day) === localDateKey(selectedDate);
            const today = localDateKey(day) === localDateKey(now);
            const count = scheduleItemsForDate(schedule, day).length;
            return (
              <button
                type="button"
                key={localDateKey(day)}
                className={`${active ? "is-active" : ""} ${today ? "is-today" : ""}`}
                onClick={() => setSelectedDate(startOfLocalDay(day))}
                aria-pressed={active}
                aria-label={`${day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}${count ? `, ${count} scheduled` : ""}`}
              >
                <span>{day.toLocaleDateString([], { weekday: "short" })}</span>
                <strong>{day.getDate()}</strong>
                <i className={count ? "has-items" : ""}>{count || ""}</i>
              </button>
            );
          })}
        </div>
        <button type="button" className="schedule-week-arrow" onClick={() => moveWeek(1)} aria-label="Next week"><ChevronRight size={16} /></button>
      </nav>

      {notice && <div className="schedule-notice">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss import message"><X size={13} /></button></div>}
      {error && !isImportOpen && <div className="schedule-error">{error}</div>}

      <section className="schedule-workbench">
        <header className="schedule-day-bar">
          <div className="schedule-day-summary">
            <span className="schedule-date-chip">{selectedDate.toLocaleDateString([], { weekday: "short", day: "numeric" })}</span>
            <div>
              <strong>{items.length ? `${items.length} scheduled` : "Clear day"}</strong>
              <span>{classCount} classes · {otherCount} other</span>
            </div>
          </div>
          <div className="schedule-day-meta">
            {isToday && <span className="schedule-current-clock"><i />{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          </div>
        </header>
        <div className="schedule-timeline-panel">
          <div className="schedule-timeline-scroll" ref={timelineScrollRef}>
            {loading ? (
              <div className="schedule-loading"><Loader2 size={18} className="spin" />Loading timetable</div>
            ) : (
              <div className="schedule-timeline" style={{ height: `${timelineHeight}px` }}>
                {hours.map((hour) => {
                  const top = (hour - startHour) * HOUR_HEIGHT;
                  const labelDate = new Date(); labelDate.setHours(hour, 0, 0, 0);
                  return <div className="schedule-hour-line" key={hour} style={{ top: `${top}px` }}><span>{labelDate.toLocaleTimeString([], { hour: "numeric" })}</span><i /></div>;
                })}
                {isToday && minutesSinceMidnight(now) >= startHour * 60 && minutesSinceMidnight(now) <= endHour * 60 && (
                  <div className="schedule-now-line" style={{ top: `${((minutesSinceMidnight(now) - startHour * 60) / 60) * HOUR_HEIGHT}px` }}><span>Now</span><i /></div>
                )}
                <div className="schedule-items-layer">
                  {items.map((item) => <TimelineItem key={item.id} item={item} startHour={startHour} now={now} isToday={isToday} />)}
                </div>
                {!items.length && <div className="schedule-timeline-empty"><CalendarDays size={22} /><strong>Your day is open</strong><span>Import a timetable or choose another date.</span></div>}
              </div>
            )}
          </div>
        </div>
      </section>

      {isImportOpen && (
        <div className="schedule-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsImportOpen(false); }}>
          <div className="schedule-import-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-import-title">
            <header><div><h2 id="schedule-import-title">Import timetable</h2><p>Add classes from NUSMods or an iCalendar file.</p></div><button type="button" onClick={() => setIsImportOpen(false)} aria-label="Close timetable import"><X size={16} /></button></header>
            <form onSubmit={handleNusmodsImport} className="schedule-link-import">
              <label htmlFor="nusmods-url">NUSMods share link</label>
              <span>Paste the URL from “Share timetable” in NUSMods.</span>
              <div>
                <Link2 size={16} aria-hidden="true" />
                <input
                  id="nusmods-url"
                  type="url"
                  value={nusmodsUrl}
                  onChange={(event) => setNusmodsUrl(event.target.value)}
                  placeholder="https://nusmods.com/timetable/sem-1/share?…"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "nusmods-url-error" : "nusmods-url-help"}
                />
                <button type="submit" disabled={importing || !nusmodsUrl.trim()}>{importing ? <Loader2 size={14} className="spin" /> : "Import link"}</button>
              </div>
              <small id="nusmods-url-help">Your imported classes and exams will be replaced.</small>
            </form>
            <div className="schedule-import-divider"><span>or</span></div>
            <button type="button" className="schedule-file-import" onClick={chooseCalendarFile} disabled={importing}>
              <input id="schedule-ics-fallback" type="file" accept=".ics,text/calendar" onChange={handleIcsImport} disabled={importing} tabIndex="-1" />
              <FileUp size={18} aria-hidden="true" />
              <strong>{importing ? "Importing calendar…" : "Choose an .ics file"}</strong>
            </button>
            <small className="schedule-file-help">Choose a file, drop it anywhere on the app, or use Open With in Finder.</small>
            {error && <div id="nusmods-url-error" className="schedule-import-error">{error}</div>}
            <footer>Personal events are always kept.</footer>
          </div>
        </div>
      )}
    </div>
  );
}
