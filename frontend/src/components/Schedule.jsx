import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileUp, Link2, Loader2, MapPin, Upload, X } from "lucide-react";
import { getSchedule, importIcs, importNusmods } from "../api";
import ClassContextDrawer from "./drawers/ClassContextDrawer";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";
import {
  formatScheduleTime,
  getAcademicWeek,
  localDateKey,
  minutesSinceMidnight,
  scheduleItemsForDate,
  startOfLocalDay,
  timelineBlockGeometry,
  weekDates,
} from "./scheduleUtils";

const EMPTY_SCHEDULE = { classes: [], exams: [], events: [] };
const HOUR_HEIGHT = 48;
const WEEK_HOUR_HEIGHT = 72;
const HORIZONTAL_DAY_WIDTH = 64;
const HORIZONTAL_HEADER_HEIGHT = 32;
const WEEK_LAYOUT_STORAGE_KEY = "canvenient-schedule-week-layout";

function classTypeBadge(item) {
  if (item.kind !== "class") return item.subtitle;
  const names = { lecture: "LEC", tutorial: "TUT", laboratory: "LAB", seminar: "SEM", recitation: "REC", sectional: "SEC" };
  const code = names[String(item.subtitle || "").toLowerCase()] || String(item.subtitle || "Class").slice(0, 3).toUpperCase();
  return item.classNo ? `${code} [${item.classNo}]` : code;
}

function TimelineItem({ item, startHour, hourHeight = HOUR_HEIGHT, now, isToday, compact = false, onOpenClass }) {
  const { top, height } = timelineBlockGeometry(item, startHour, hourHeight);
  const isPast = isToday && item.end <= now;
  const linkCount = item.linkedTaskCount + item.linkedNoteCount + item.linkedFileCount;
  const isLinkable = item.kind === "class";
  const openClass = () => { if (isLinkable) onOpenClass?.(item); };

  return (
    <article
      className={`schedule-timeline-item is-${item.kind} ${isPast ? "is-past" : ""} ${isLinkable ? "is-linkable" : ""}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        "--module-color": item.color,
        "--module-ink": item.ink,
        opacity: item.attendInPerson === false ? 0.4 : 1
      }}
      role={isLinkable ? "button" : undefined}
      tabIndex={isLinkable ? 0 : undefined}
      onClick={openClass}
      onKeyDown={(event) => { if (isLinkable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openClass(); } }}
      aria-label={`${item.title}, ${formatScheduleTime(item.start)} to ${formatScheduleTime(item.end)}, ${item.subtitle}${item.classNo ? ` ${item.classNo}` : ""}, ${item.venue}${linkCount ? `, ${linkCount} linked item${linkCount === 1 ? "" : "s"}` : ""}`}
    >
      <div className="schedule-item-copy">
        <div><strong>{item.title}</strong><span className="schedule-class-type">{classTypeBadge(item)}</span></div>
        <small><MapPin size={11} />{item.venue}</small>
        {isLinkable && linkCount > 0 && <small className="schedule-linked-count">{linkCount} linked</small>}
      </div>
      {!compact && (isPast || item.kind === "exam") && (
        <span className="schedule-item-state">{isPast ? "Past" : "Exam"}</span>
      )}
    </article>
  );
}

function HorizontalScheduleItem({ item, startHour, totalHours, now, isToday, row, dayWidth = HORIZONTAL_DAY_WIDTH, headerHeight = HORIZONTAL_HEADER_HEIGHT, onOpenClass }) {
  const startMins = minutesSinceMidnight(item.start);
  const endMins = minutesSinceMidnight(item.end);
  const totalMins = totalHours * 60;
  const leftPercent = Math.max(0, (startMins - startHour * 60) / totalMins);
  const widthPercent = Math.max(0.01, (endMins - startMins) / totalMins);
  const isPast = isToday && item.end <= now;
  const linkCount = item.linkedTaskCount + item.linkedNoteCount + item.linkedFileCount;
  const isLinkable = item.kind === "class";
  const openClass = () => { if (isLinkable) onOpenClass?.(item); };

  return (
    <article
      className={`schedule-horizontal-item is-${item.kind} ${isPast ? "is-past" : ""} ${isLinkable ? "is-linkable" : ""}`}
      style={{
        left: `calc(${dayWidth}px + ${leftPercent} * (100% - ${dayWidth}px) + 2px)`,
        width: `calc(${widthPercent} * (100% - ${dayWidth}px) - 4px)`,
        top: `calc(${headerHeight}px + ${row} * ((100% - ${headerHeight}px) / 7) + 2px)`,
        height: `calc((100% - ${headerHeight}px) / 7 - 4px)`,
        "--module-color": item.color,
        "--module-ink": item.ink,
        opacity: item.attendInPerson === false ? 0.4 : 1
      }}
      role={isLinkable ? "button" : undefined}
      tabIndex={isLinkable ? 0 : undefined}
      onClick={openClass}
      onKeyDown={(event) => { if (isLinkable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openClass(); } }}
      aria-label={`${item.title}, ${formatScheduleTime(item.start)} to ${formatScheduleTime(item.end)}, ${item.subtitle}${item.classNo ? ` ${item.classNo}` : ""}, ${item.venue}${linkCount ? `, ${linkCount} linked item${linkCount === 1 ? "" : "s"}` : ""}`}
    >
      <div className="schedule-item-copy">
        <div className="schedule-item-heading">
          <strong>{item.title}</strong>
          <span className="schedule-class-type">{classTypeBadge(item)}</span>
        </div>
        {item.venue && <small><MapPin size={10} />{item.venue}</small>}
        {isLinkable && linkCount > 0 && <small className="schedule-linked-count">{linkCount} linked</small>}
      </div>
    </article>
  );
}

function monthDates(anchor) {
  const first = startOfLocalDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const offset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

const VIEWS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export default function Schedule({ token }) {
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE);
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [view, setView] = useState("week");
  const [weekLayout, setWeekLayout] = useState(() => window.localStorage.getItem(WEEK_LAYOUT_STORAGE_KEY) === "vertical" ? "vertical" : "horizontal");
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [nusmodsUrl, setNusmodsUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
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
  useEffect(() => { window.localStorage.setItem(WEEK_LAYOUT_STORAGE_KEY, weekLayout); }, [weekLayout]);

  const days = useMemo(() => weekDates(selectedDate), [selectedDate]);
  const items = useMemo(() => scheduleItemsForDate(schedule, selectedDate), [schedule, selectedDate]);
  const weekItems = useMemo(() => days.map((day) => ({ day, items: scheduleItemsForDate(schedule, day) })), [days, schedule]);
  const weeklyTimelineItems = useMemo(() => weekItems.flatMap(({ items: dayItems }) => dayItems), [weekItems]);
  const weekInfo = useMemo(() => getAcademicWeek(selectedDate), [selectedDate]);
  const isHorizontalWeek = view === "week" && weekLayout === "horizontal";
  const timelineItems = view === "week" ? weeklyTimelineItems : items;
  const horizontalItems = useMemo(() => weekItems.flatMap(({ day, items: dayItems }, row) => dayItems.map((item) => ({ ...item, day, row }))), [weekItems]);
  const monthDays = useMemo(() => monthDates(selectedDate), [selectedDate]);
  const isToday = localDateKey(selectedDate) === localDateKey(now);
  const earliestMinutes = timelineItems.length ? Math.min(...timelineItems.map((item) => minutesSinceMidnight(item.start))) : 8 * 60;
  const latestMinutes = timelineItems.length ? Math.max(...timelineItems.map((item) => minutesSinceMidnight(item.end))) : 18 * 60;
  const startHour = Math.max(0, Math.floor(earliestMinutes / 60));
  const endHour = Math.min(24, Math.max(18, Math.ceil(latestMinutes / 60)));
  const totalHours = Math.max(endHour - startHour, 1);
  const hourHeight = view === "week" && weekLayout === "vertical" ? WEEK_HOUR_HEIGHT : HOUR_HEIGHT;
  const timelineHeight = (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);

  useEffect(() => {
    if (loading || !timelineScrollRef.current) return;
    const currentMinutes = minutesSinceMidnight(now);
    if (!isToday || currentMinutes < startHour * 60 || currentMinutes > endHour * 60) {
      timelineScrollRef.current.scrollTop = 0;
      return;
    }
    const currentTop = ((currentMinutes - startHour * 60) / 60) * hourHeight;
    timelineScrollRef.current.scrollTop = Math.max(currentTop - 170, 0);
  }, [endHour, hourHeight, isToday, loading, now, startHour, timelineHeight]);

  const movePeriod = (direction) => {
    const next = new Date(selectedDate);
    if (view === "day") next.setDate(next.getDate() + direction);
    else if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * 7);
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
    title: view === "month" ? selectedDate.toLocaleDateString([], { month: "long", year: "numeric" }) : view === "week" ? `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString([], { month: "short", day: "numeric" })}` : selectedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
    subtitle: view === "week" ? `${weekInfo.label} · ${timelineItems.length} scheduled this week` : items.length ? `${weekInfo.label} · ${items.length} scheduled ${items.length === 1 ? "item" : "items"}` : `${weekInfo.label} · Nothing scheduled`,
    actions: (
      <>
        {!isToday && <button type="button" className="mac-toolbar-action" onClick={goToday}>Today</button>}
        <button type="button" className="mac-toolbar-action is-primary" onClick={() => { setError(""); setIsImportOpen(true); }}><Upload size={14} />Import</button>
      </>
    ),
  }), [days, isToday, items.length, selectedDate, timelineItems.length, view, weekInfo]);
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
      <nav className="schedule-week-strip" aria-label="Schedule controls">
        <button type="button" className="schedule-week-arrow" onClick={() => movePeriod(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={16} /></button>
        <div className="schedule-week-info" title={weekInfo.formatted}>
          <span className="schedule-week-label">{weekInfo.label}</span>
          <span className="schedule-week-ay">{weekInfo.shortAcademicYear} {weekInfo.shortSemester}</span>
        </div>
        {view === "day" ? (
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
                  onClick={() => {
                    setSelectedDate(startOfLocalDay(day));
                    if (view !== "day") setView("day");
                  }}
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
        ) : (
          <div style={{ flex: 1, background: "var(--color-schedule-paper)" }} />
        )}
        <div className="schedule-view-tabs" role="group" aria-label="Schedule view">
          {VIEWS.map((option) => <button type="button" key={option.id} className={view === option.id ? "is-active" : ""} aria-pressed={view === option.id} onClick={() => setView(option.id)}>{option.label}</button>)}
        </div>
        {view === "week" && <div className="schedule-week-layout-toggle" role="group" aria-label="Week layout"><button type="button" className={weekLayout === "horizontal" ? "is-active" : ""} aria-pressed={weekLayout === "horizontal"} onClick={() => setWeekLayout("horizontal")}>Horizontal</button><button type="button" className={weekLayout === "vertical" ? "is-active" : ""} aria-pressed={weekLayout === "vertical"} onClick={() => setWeekLayout("vertical")}>Vertical</button></div>}
        <button type="button" className="schedule-week-arrow" onClick={() => movePeriod(1)} aria-label={`Next ${view}`}><ChevronRight size={16} /></button>
      </nav>

      {notice && <div className="schedule-notice">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss import message"><X size={13} /></button></div>}
      {error && !isImportOpen && <div className="schedule-error">{error}</div>}

      <section className={`schedule-workbench is-${view}-view ${isHorizontalWeek ? "is-horizontal-week" : ""}`}>
        <div className="schedule-timeline-panel">
          <div className={`schedule-timeline-scroll ${isHorizontalWeek ? "is-horizontal" : ""}`} ref={timelineScrollRef}>
            {loading ? (
              <div className="schedule-loading"><Loader2 size={18} className="spin" />Loading timetable</div>
            ) : (
              view === "month" ? (
                <div className="schedule-month-grid" role="grid" aria-label={selectedDate.toLocaleDateString([], { month: "long", year: "numeric" })}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => <strong key={label}>{label}</strong>)}
                  {monthDays.map((day) => {
                    const dayItems = scheduleItemsForDate(schedule, day);
                    const inMonth = day.getMonth() === selectedDate.getMonth();
                    const today = localDateKey(day) === localDateKey(now);
                    return <button type="button" key={localDateKey(day)} className={`${inMonth ? "" : "is-outside"} ${today ? "is-today" : ""}`} onClick={() => { setSelectedDate(startOfLocalDay(day)); setView("day"); }}>
                      <span>{day.getDate()}</span>
                      {dayItems.slice(0, 3).map((item) => <small key={item.id} style={{ "--module-color": item.color, opacity: item.attendInPerson === false ? 0.4 : 1 }}>{formatScheduleTime(item.start)} {item.title}</small>)}
                      {dayItems.length > 3 && <em>+{dayItems.length - 3} more</em>}
                    </button>;
                  })}
                </div>
              ) : isHorizontalWeek ? (
                <div className="schedule-horizontal-timeline">
                  {hours.map((hour) => {
                    const percent = (hour - startHour) / totalHours;
                    const labelDate = new Date(); labelDate.setHours(hour, 0, 0, 0);
                    const isLast = hour === endHour;
                    return (
                      <div
                        className={`schedule-horizontal-hour ${isLast ? "is-last" : ""}`}
                        key={hour}
                        style={{ left: `calc(${HORIZONTAL_DAY_WIDTH}px + ${percent} * (100% - ${HORIZONTAL_DAY_WIDTH}px))` }}
                      >
                        <span style={isLast ? { right: "6px", left: "auto" } : { left: "6px" }}>
                          {labelDate.toLocaleTimeString([], { hour: "numeric" })}
                        </span>
                        <i />
                      </div>
                    );
                  })}
                  {isToday && minutesSinceMidnight(now) >= startHour * 60 && minutesSinceMidnight(now) <= endHour * 60 && (
                    <div
                      className="schedule-horizontal-now"
                      style={{ left: `calc(${HORIZONTAL_DAY_WIDTH}px + ${((minutesSinceMidnight(now) - startHour * 60) / (totalHours * 60))} * (100% - ${HORIZONTAL_DAY_WIDTH}px))` }}
                    />
                  )}
                  {weekItems.map(({ day }, row) => (
                    <div
                      className={`schedule-horizontal-day ${localDateKey(day) === localDateKey(now) ? "is-today" : ""}`}
                      key={localDateKey(day)}
                      style={{
                        top: `calc(${HORIZONTAL_HEADER_HEIGHT}px + ${row} * ((100% - ${HORIZONTAL_HEADER_HEIGHT}px) / 7))`,
                        height: `calc((100% - ${HORIZONTAL_HEADER_HEIGHT}px) / 7)`,
                      }}
                    >
                      <div className="schedule-horizontal-day-label">
                        <span>{day.toLocaleDateString([], { weekday: "short" })}</span>
                        <strong>{day.getDate()}</strong>
                      </div>
                    </div>
                  ))}
                  {horizontalItems.map((item) => (
                    <HorizontalScheduleItem
                      key={item.id}
                      item={item}
                      startHour={startHour}
                      totalHours={totalHours}
                      now={now}
                      isToday={localDateKey(item.day) === localDateKey(now)}
                      row={item.row}
                      dayWidth={HORIZONTAL_DAY_WIDTH}
                      headerHeight={HORIZONTAL_HEADER_HEIGHT}
                      onOpenClass={setSelectedClass}
                    />
                  ))}
                  {!horizontalItems.length && (
                    <div className="schedule-horizontal-empty">
                      <CalendarDays size={22} />
                      <strong>Your week is open</strong>
                      <span>Choose another week or import a timetable.</span>
                    </div>
                  )}
                </div>
              ) : (
              <div className={`schedule-timeline ${view === "week" ? "schedule-week-timeline" : ""}`} style={{ height: `${timelineHeight}px` }}>
                {hours.map((hour) => {
                  const top = (hour - startHour) * hourHeight;
                  const labelDate = new Date(); labelDate.setHours(hour, 0, 0, 0);
                  return <div className="schedule-hour-line" key={hour} style={{ top: `${top}px` }}><span>{labelDate.toLocaleTimeString([], { hour: "numeric" })}</span><i /></div>;
                })}
                {isToday && minutesSinceMidnight(now) >= startHour * 60 && minutesSinceMidnight(now) <= endHour * 60 && (
                  <div className="schedule-now-line" style={{ top: `${((minutesSinceMidnight(now) - startHour * 60) / 60) * hourHeight}px` }}><i /></div>
                )}
                {view === "week" ? <div className="schedule-week-columns">{weekItems.map(({ day, items: dayItems }) => {
                  const dayToday = localDateKey(day) === localDateKey(now);
                  return <div className="schedule-week-column" key={localDateKey(day)}><header className={dayToday ? "is-today" : ""}><span>{day.toLocaleDateString([], { weekday: "short" })}</span><strong>{day.getDate()}</strong></header><div className="schedule-items-layer">{dayItems.map((item) => <TimelineItem key={item.id} item={item} startHour={startHour} hourHeight={hourHeight} now={now} isToday={dayToday} compact onOpenClass={setSelectedClass} />)}</div></div>;
                })}</div> : <><div className="schedule-items-layer">{items.map((item) => <TimelineItem key={item.id} item={item} startHour={startHour} hourHeight={hourHeight} now={now} isToday={isToday} onOpenClass={setSelectedClass} />)}</div>{!items.length && <div className="schedule-timeline-empty"><CalendarDays size={22} /><strong>Your day is open</strong><span>Import a timetable or choose another date.</span></div>}</>}
              </div>
              )
            )}
          </div>
        </div>
      </section>

      {selectedClass && <ClassContextDrawer key={`${selectedClass.classId}-${selectedClass.occurrenceDate}`} item={selectedClass} token={token} onClose={() => setSelectedClass(null)} onContextChanged={loadSchedule} />}

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
