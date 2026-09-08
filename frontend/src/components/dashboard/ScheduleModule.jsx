// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import { getSchedule, getTasks, SCHEDULE_CACHE_KEY, TASKS_CACHE_KEY } from "../../api";
import { dashboardAgendaItems, dashboardAgendaView, formatScheduleTime, getAcademicWeek } from "../scheduleUtils";

const PIXELS_PER_HOUR = 52;

function getCachedSchedule() {
  try {
    const raw = window.localStorage.getItem(SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed?.data ?? parsed;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function getCachedTasks() {
  try {
    const raw = window.localStorage.getItem(TASKS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const data = parsed?.data ?? parsed;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function minutesIntoDay(date) {
  return (date.getHours() * 60) + date.getMinutes();
}

function timelineGeometry(items, now, showNow = true) {
  const nowMinutes = minutesIntoDay(now);
  const itemEnds = items.map((item) => item.kind === "task" ? minutesIntoDay(item.start) + 20 : minutesIntoDay(item.end));
  const firstClassStart = items.find((item) => item.kind === "class")?.start;
  const rangeStart = minutesIntoDay(firstClassStart || items[0].start);
  const rangeEnd = Math.min(24 * 60, Math.max(rangeStart + (3 * 60), Math.ceil(Math.max(...itemEnds) / 60) * 60));
  const firstWholeHourAfterStart = Math.ceil(rangeStart / 60) * 60;
  const markers = [rangeStart];
  for (let minute = firstWholeHourAfterStart; minute < rangeEnd; minute += 60) {
    if (minute > rangeStart) markers.push(minute);
  }
  return {
    height: ((rangeEnd - rangeStart) / 60) * PIXELS_PER_HOUR,
    markers,
    rangeStart,
    nowOffset: showNow && nowMinutes >= rangeStart && nowMinutes <= rangeEnd
      ? ((nowMinutes - rangeStart) / 60) * PIXELS_PER_HOUR
      : null,
  };
}

export default function ScheduleModule({ token, onNavigate }) {
  const [schedule, setSchedule] = useState(() => {
    const cached = getCachedSchedule();
    return cached && typeof cached === "object" ? cached : { classes: [], exams: [], events: [] };
  });
  const [tasks, setTasks] = useState(getCachedTasks);
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState(() => {
    const cached = getCachedSchedule();
    return cached ? "success" : "loading";
  });
  const [dayOffset, setDayOffset] = useState(0);

  const loadAgenda = useCallback(() => {
    Promise.allSettled([getSchedule(token), getTasks(token)])
      .then(([scheduleResult, taskResult]) => {
        if (scheduleResult.status === "rejected" && taskResult.status === "rejected") {
          setStatus("error");
          return;
        }
        setSchedule(scheduleResult.status === "fulfilled" && scheduleResult.value
          ? scheduleResult.value
          : { classes: [], exams: [], events: [] });
        setTasks(taskResult.status === "fulfilled" ? taskResult.value || [] : []);
        setStatus("success");
      });
  }, [token]);

  const retryAgenda = () => {
    setStatus("loading");
    loadAgenda();
  };

  useEffect(() => { loadAgenda(); }, [loadAgenda]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const viewDate = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [now, dayOffset]);

  const viewStartOfDay = useMemo(() => {
    const d = new Date(viewDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [viewDate]);

  const agenda = useMemo(() => dashboardAgendaItems(schedule, tasks, viewStartOfDay), [schedule, tasks, viewStartOfDay]);
  const visible = useMemo(() => dashboardAgendaView(agenda, viewStartOfDay, "today", 50), [agenda, viewStartOfDay]);
  const geometry = useMemo(() => visible.items.length ? timelineGeometry(visible.items, dayOffset === 0 ? now : viewStartOfDay, dayOffset === 0) : null, [dayOffset, now, viewStartOfDay, visible.items]);
  const weekInfo = useMemo(() => getAcademicWeek(viewDate), [viewDate]);

  const scrollRef = React.useRef(null);
  const [lastScrolledDay, setLastScrolledDay] = useState(null);

  useEffect(() => {
    if (status === "success" && geometry) {
      if (lastScrolledDay !== dayOffset) {
        if (dayOffset === 0 && geometry.nowOffset !== null && scrollRef.current) {
          scrollRef.current.scrollTop = Math.max(0, geometry.nowOffset - 40);
        } else if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
        setLastScrolledDay(dayOffset);
      }
    }
  }, [status, geometry, dayOffset, lastScrolledDay]);

  return (
    <div className="schedule-module schedule-module-agenda" data-state={status}>
      <div className="schedule-module-controls">
        <span>{weekInfo.label}</span>
        <div className="schedule-module-view-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button type="button" onClick={() => setDayOffset(d => d - 1)} aria-label="Previous day" style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', color: 'inherit' }}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: '0.9em', fontWeight: 500, minWidth: '4.5rem', textAlign: 'center' }}>
            {dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : dayOffset === -1 ? "Yesterday" : viewDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button type="button" onClick={() => setDayOffset(d => d + 1)} aria-label="Next day" style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', color: 'inherit' }}><ChevronRight size={16} /></button>
          {dayOffset !== 0 && (
            <button type="button" onClick={() => setDayOffset(0)} style={{ marginLeft: '4px', fontSize: '0.85em', opacity: 0.8, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit' }}>Today</button>
          )}
        </div>
        <time dateTime={now.toISOString()}>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
      </div>
      {status === "loading" ? (
        <div className="schedule-module-message is-loading" aria-live="polite">Loading your day…</div>
      ) : status === "error" ? (
        <div className="schedule-module-message is-error" role="alert">
          <span>Couldn’t load your agenda.</span>
          <button type="button" onClick={retryAgenda}><RotateCw size={12} />Retry</button>
        </div>
      ) : (
        <>
          {visible.items.length && geometry ? (
            <div className="schedule-timeline-scroll" ref={scrollRef}>
              <div className="schedule-timeline" style={{ "--timeline-height": `${geometry.height}px` }}>
                {geometry.markers.map((minute) => (
                  <div className="schedule-timeline-hour" key={minute} style={{ top: `${((minute - geometry.rangeStart) / 60) * PIXELS_PER_HOUR}px` }}>
                    <time>{new Date(2000, 0, 1, 0, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                    <i />
                  </div>
                ))}
                {geometry.nowOffset !== null && (
                  <div className="schedule-timeline-now" style={{ top: `${geometry.nowOffset}px` }}>
                    <i />
                  </div>
                )}
                {visible.items.map((item) => {
                  const happening = item.kind !== "task" && item.start <= now && item.end > now;
                  const past = item.end < now;
                  const top = ((minutesIntoDay(item.start) - geometry.rangeStart) / 60) * PIXELS_PER_HOUR;
                  const durationMinutes = item.kind === "task" ? 20 : Math.max(20, (item.end - item.start) / 60000);
                  return (
                    <button
                      type="button"
                      className={`schedule-timeline-item is-${item.kind} ${item.kind === "task" ? "is-task" : ""} ${happening ? "is-current" : ""} ${past ? "is-past" : ""}`}
                      style={{ "--module-color": item.color, "--timeline-item-top": `${top}px`, "--timeline-duration": `${Math.max(18, (durationMinutes / 60) * PIXELS_PER_HOUR)}px`, opacity: item.attendInPerson === false ? 0.4 : 1 }}
                      key={`${item.id}-${item.start.toISOString()}`}
                      onClick={() => onNavigate?.(item.destination)}
                      aria-label={`Open ${item.kind === "task" ? "task" : "schedule"}: ${item.title}`}
                    >
                      <span className="schedule-timeline-station" aria-hidden="true" />
                      <span className="schedule-timeline-item-copy">
                        <strong>{item.title}</strong>
                        <small>{formatScheduleTime(item.start)} · {item.subtitle}{item.classNo ? ` · ${item.classNo}` : ""}{item.venue ? ` · ${item.venue}` : ""}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="schedule-module-message">
              {dayOffset === 0
                ? "No scheduled classes or dated tasks today."
                : `No scheduled classes or dated tasks ${dayOffset === 1 ? "tomorrow" : dayOffset === -1 ? "yesterday" : "for this day"}.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
