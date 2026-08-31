// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, MapPin, RotateCw } from "lucide-react";
import { getSchedule, getTasks } from "../../api";
import { dashboardAgendaItems, dashboardAgendaView, formatScheduleTime, startOfLocalDay } from "../scheduleUtils";

const VIEWS = [
  { id: "now", label: "Now" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Next" },
];

function dayLabel(date, now) {
  const day = startOfLocalDay(date);
  const today = startOfLocalDay(now);
  const difference = Math.round((day - today) / 86400000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function agendaTime(item) {
  if (item.kind === "task") return formatScheduleTime(item.start);
  return `${formatScheduleTime(item.start)}–${formatScheduleTime(item.end)}`;
}

export default function ScheduleModule({ token, onNavigate }) {
  const [schedule, setSchedule] = useState({ classes: [], exams: [], events: [] });
  const [tasks, setTasks] = useState([]);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState("now");
  const [status, setStatus] = useState("loading");

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

  const agenda = useMemo(() => dashboardAgendaItems(schedule, tasks, now), [schedule, tasks, now]);
  const visible = useMemo(() => dashboardAgendaView(agenda, now, view), [agenda, now, view]);
  const current = visible.items.find((item) => item.kind !== "task" && item.start <= now && item.end > now);
  const summary = view === "today"
    ? `${visible.total} item${visible.total === 1 ? "" : "s"} today`
    : view === "upcoming"
      ? `${visible.total} upcoming`
      : current
        ? "In class now"
        : visible.fallback
          ? "Nothing left today · showing what’s next"
          : `${visible.total} item${visible.total === 1 ? "" : "s"} left today`;

  return (
    <div className="schedule-module schedule-module-agenda" data-state={status}>
      <div className="schedule-module-controls">
        <div className="schedule-module-view-tabs" role="group" aria-label="Schedule card view">
          {VIEWS.map((option) => (
            <button
              type="button"
              aria-pressed={view === option.id}
              className={view === option.id ? "is-active" : ""}
              disabled={status === "loading"}
              key={option.id}
              onClick={() => setView(option.id)}
            >{option.label}</button>
          ))}
        </div>
        <time dateTime={now.toISOString()}>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
      </div>
      {status === "loading" ? <div className="schedule-module-message is-loading" aria-live="polite">Loading your day…</div>
        : status === "error" ? <div className="schedule-module-message is-error" role="alert"><span>Couldn’t load your agenda.</span><button type="button" onClick={retryAgenda}><RotateCw size={12} />Retry</button></div>
          : <>
            <div className="schedule-module-summary"><span className={current ? "is-live" : ""} />{summary}</div>
            {visible.items.length ? (
              <div className="schedule-module-list">
                {visible.items.map((item) => {
                  const happening = item.kind !== "task" && item.start <= now && item.end > now;
                  const past = item.end < now;
                  return (
                    <button
                      type="button"
                      className={`schedule-module-row ${happening ? "is-current" : ""} ${past ? "is-past" : ""}`}
                      style={{ "--module-color": item.color }}
                      key={`${item.id}-${item.start.toISOString()}`}
                      onClick={() => onNavigate?.(item.destination)}
                      aria-label={`Open ${item.kind === "task" ? "task" : "schedule"}: ${item.title}`}
                    >
                      <span className="schedule-module-row-color" aria-hidden="true" />
                      <span className="schedule-module-row-time"><small>{dayLabel(item.start, now)}</small><strong>{agendaTime(item)}</strong></span>
                      <span className="schedule-module-row-copy">
                        <strong>{item.title}</strong>
                        <small>{item.kind === "task" ? <><CheckSquare size={11} />{item.subtitle}</> : <><CalendarDays size={11} />{item.subtitle}{item.classNo ? ` · ${item.classNo}` : ""}{item.venue ? <><span>·</span><MapPin size={11} />{item.venue}</> : null}</>}</small>
                      </span>
                      {happening && <em>Now</em>}
                    </button>
                  );
                })}
              </div>
            ) : <div className="schedule-module-message">No scheduled classes or dated tasks in the next two weeks.</div>}
          </>}
    </div>
  );
}
