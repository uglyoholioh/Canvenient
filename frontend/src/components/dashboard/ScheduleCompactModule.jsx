import { useCallback, useEffect, useMemo, useState } from "react";
import { getSchedule, getTasks } from "../../api";
import { dashboardAgendaItems, dashboardAgendaView, getAcademicWeek } from "../scheduleUtils";

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function minutesUntil(date, now) {
  return Math.round((date - now) / 60000);
}

export default function ScheduleCompactModule({ token, onNavigate }) {
  const [schedule, setSchedule] = useState({ classes: [], exams: [], events: [] });
  const [tasks, setTasks] = useState([]);
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState("loading");

  const load = useCallback(() => {
    Promise.allSettled([getSchedule(token), getTasks(token)]).then(
      ([scheduleResult, taskResult]) => {
        if (scheduleResult.status === "rejected" && taskResult.status === "rejected") {
          setStatus("error");
          return;
        }
        setSchedule(
          scheduleResult.status === "fulfilled" && scheduleResult.value
            ? scheduleResult.value
            : { classes: [], exams: [], events: [] }
        );
        setTasks(taskResult.status === "fulfilled" ? taskResult.value || [] : []);
        setStatus("success");
      }
    );
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const todayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const agenda = useMemo(() => dashboardAgendaItems(schedule, tasks, todayStart), [schedule, tasks, todayStart]);
  const visible = useMemo(() => dashboardAgendaView(agenda, todayStart, "today", 50), [agenda, todayStart]);

  const upcoming = useMemo(() => {
    if (!visible.items.length) return [];
    return visible.items
      .filter((item) => {
        const end = item.end || new Date(item.start.getTime() + 20 * 60000);
        return end >= now;
      })
      .slice(0, 3);
  }, [visible.items, now]);

  const weekInfo = useMemo(() => getAcademicWeek(now), [now]);

  return (
    <div className="schedule-compact-module">
      <div className="schedule-compact-meta">
        <span className="schedule-compact-week">{weekInfo.label}</span>
        <time className="schedule-compact-clock">{formatTime(now)}</time>
      </div>

      {status === "loading" ? (
        <div className="schedule-compact-empty">Loading…</div>
      ) : status === "error" ? (
        <div className="schedule-compact-empty">Could not load schedule.</div>
      ) : upcoming.length === 0 ? (
        <div className="schedule-compact-empty">Nothing else scheduled today.</div>
      ) : (
        <div className="schedule-compact-list">
          {upcoming.map((item) => {
            const end = item.end || new Date(item.start.getTime() + 20 * 60000);
            const isNow = item.kind !== "task" && item.start <= now && end > now;
            const minsUntilStart = minutesUntil(item.start, now);

            let timeLabel;
            if (isNow) {
              const minsLeft = minutesUntil(end, now);
              timeLabel = minsLeft <= 0 ? "ending" : minsLeft + "m left";
            } else if (minsUntilStart > 0 && minsUntilStart < 60) {
              timeLabel = "in " + minsUntilStart + "m";
            } else {
              timeLabel = formatTime(item.start);
            }

            return (
              <button
                type="button"
                key={item.id + "-" + item.start.toISOString()}
                className={"schedule-compact-item is-" + item.kind + (isNow ? " is-current" : "")}
                style={item.color ? { "--item-color": item.color } : undefined}
                onClick={() => onNavigate && onNavigate(item.destination)}
                aria-label={item.title + " — " + timeLabel}
              >
                <span className="schedule-compact-dot" aria-hidden="true" />
                <span className="schedule-compact-copy">
                  <strong>{item.title}</strong>
                  {item.venue && <small>{item.venue}</small>}
                </span>
                <span className={"schedule-compact-time" + (isNow ? " is-now" : "")}>{timeLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
