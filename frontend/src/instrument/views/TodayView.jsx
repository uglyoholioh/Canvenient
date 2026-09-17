// Today — the editorial brief. One glance states where you are: the date,
// the NUS week, what's happening, what's next (with the bus facts that get
// you there), and what's due. Everything declarative; nothing pushes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAcademicModules,
  getAssistantBrief,
  getCampusBusArrivals,
  getCampusBusStops,
  getSchedule,
  getTasks,
  getVenueLocations,
  updateTask,
} from "../../api";
import {
  getAcademicWeek,
  getTaskModuleColor,
  scheduleItemsForDate,
  startOfLocalDay,
  taskDueDate,
} from "../../components/scheduleUtils";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import { buildClassJourney, nextClass, resolveOrigin } from "../journey";
import "../views/today.css";

const BUS_REFRESH_MS = 20000;
const JOURNEY_REFRESH_MS = 60000;

function timeHM(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Departure ETAs read as minutes up close, as clock times once the wait is
// long enough that minutes stop meaning anything.
function etaLabel(minutes, now) {
  if (minutes <= 0) return "now";
  if (minutes < 180) return `${minutes} min`;
  return timeHM(new Date(now.getTime() + minutes * 60000));
}

function dueLabel(due, now) {
  const diffMin = Math.round((due - now) / 60000);
  if (diffMin < 0) {
    const days = Math.ceil(-diffMin / 1440);
    if (days <= 1) return "overdue by a few hours";
    return `overdue by ${days} days`;
  }
  if (diffMin < 60) return `in ${diffMin} min`;
  const todayEnd = new Date(startOfLocalDay(now));
  todayEnd.setDate(todayEnd.getDate() + 1);
  if (due < todayEnd) return `today ${timeHM(due)}`;
  const tomorrow = new Date(todayEnd);
  tomorrow.setDate(todayEnd.getDate() + 1);
  if (due < tomorrow) return `tomorrow ${timeHM(due)}`;
  const days = Math.round((new Date(startOfLocalDay(due)) - startOfLocalDay(now)) / 86400000);
  return `in ${days} days`;
}

// Days until the semester's next phase (recess, reading, exams, vacation).
function phaseAhead(now) {
  const current = getAcademicWeek(now);
  if (!current) return null;
  const probe = startOfLocalDay(now);
  for (let offset = 1; offset <= 200; offset += 1) {
    probe.setDate(probe.getDate() + 1);
    const week = getAcademicWeek(probe);
    if (week?.type !== current.type) {
      const labels = {
        recess: "Recess",
        reading: "Reading week",
        exam: "Exams",
        vacation: "Vacation",
        instructional: "Classes",
        orientation: "Orientation",
      };
      return {
        label: labels[week.type] || week.label,
        inDays: offset,
      };
    }
  }
  return null;
}

// Compact departures board for one stop.
function BusStrip({ token, stops, stopId, onSelectStop }) {
  const [arrivals, setArrivals] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(() => new Date());

  useEffect(() => {
    if (!stopId) return undefined;
    let alive = true;
    const load = () => {
      getCampusBusArrivals(token, stopId)
        .then((data) => {
          if (!alive) return;
          setArrivals(data);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    };
    load();
    const timer = window.setInterval(load, BUS_REFRESH_MS);
    const minuteTimer = window.setInterval(() => setTick(new Date()), 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.clearInterval(minuteTimer);
    };
  }, [token, stopId]);

  const stop = stops.find((s) => s.id === stopId);
  const services = (arrivals?.arrivals || []).filter(
    (entry) => Array.isArray(entry.minutes) && entry.minutes.length > 0,
  );

  return (
    <div className="ins-busstrip">
      <div className="ins-busstrip-head">
        <span className="ins-cap">{stop?.name || "Bus stop"}</span>
        <button type="button" className="ins-btn is-ghost" onClick={onSelectStop}>
          Change
        </button>
      </div>
      {failed && !arrivals && <p className="ins-cap">Departures unavailable right now.</p>}
      {arrivals && services.length === 0 && <p className="ins-cap">No departures in the feed.</p>}
      {services.length > 0 && (
        <div className="ins-busstrip-rows">
          {services.slice(0, 4).map((service) => (
            <div key={service.service} className="ins-busstrip-row">
              <span className="ins-busstrip-route ins-mono">{service.service}</span>
              <span className="ins-busstrip-etas ins-mono">
                {service.minutes
                  .slice(0, 3)
                  .map((m) => etaLabel(m, tick))
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TodayView({ token, user, onNavigate }) {
  const [now, setNow] = useState(() => new Date());
  const [schedule, setSchedule] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [modules, setModules] = useState([]);
  const [stops, setStops] = useState([]);
  const [locations, setLocations] = useState({});
  const [centroids, setCentroids] = useState({});
  const [brief, setBrief] = useState(null);
  const [journey, setJourney] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [completion, setCompletion] = useState({});
  const journeyTimer = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    // Essentials paint the page as soon as they land; the brief is optional
    // and may think for a while, so it never blocks the view.
    Promise.allSettled([
      getSchedule(token),
      getTasks(token),
      getAcademicModules(token),
      getCampusBusStops(token),
      getVenueLocations(token),
    ]).then(([scheduleRes, tasksRes, modulesRes, stopsRes, locRes]) => {
      if (!alive) return;
      if (scheduleRes.status === "fulfilled") setSchedule(scheduleRes.value);
      if (tasksRes.status === "fulfilled") setTasks(tasksRes.value || []);
      if (modulesRes.status === "fulfilled") setModules(modulesRes.value || []);
      if (stopsRes.status === "fulfilled") setStops(stopsRes.value?.stops || []);
      if (locRes.status === "fulfilled") {
        setLocations(locRes.value?.locations || {});
        setCentroids(locRes.value?.building_centroids || {});
      }
      setLoaded(true);
    });
    getAssistantBrief(token)
      .then((data) => {
        if (alive) setBrief(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  const pinnedStopId = useMemo(() => {
    const stored = localStorage.getItem("canvenient-isb-stop");
    if (stored && stops.some((s) => s.id === stored)) return stored;
    const kr = stops.find((s) => /kr.*bus/i.test(s.id) || /kr.*bus/i.test(s.name || ""));
    return kr?.id || stops[0]?.id || null;
  }, [stops]);

  const next = useMemo(() => (schedule ? nextClass(schedule, now, 2) : null), [schedule, now]);

  const happeningNow = useMemo(() => {
    if (!schedule) return null;
    const items = scheduleItemsForDate(schedule, now);
    return items.find((item) => item.start <= now && now < item.end) || null;
  }, [schedule, now]);

  // Journey facts refresh on a slower clock than the clock tick.
  useEffect(() => {
    if (!schedule || !stops.length) return undefined;
    let alive = true;
    const build = () => {
      const origin = resolveOrigin({
        schedule,
        now: new Date(),
        stops,
        pinnedStopId,
        locations,
        centroids,
      });
      const target = nextClass(schedule, new Date(), 2);
      if (!origin?.coord || !target) {
        setJourney(null);
        return;
      }
      buildClassJourney({
        token,
        cls: target,
        origin,
        stops,
        locations,
        centroids,
        now: new Date(),
      }).then((facts) => {
        if (alive) setJourney(facts);
      });
    };
    build();
    journeyTimer.current = window.setInterval(build, JOURNEY_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(journeyTimer.current);
    };
  }, [token, schedule, stops, locations, centroids, pinnedStopId]);

  const dayStart = startOfLocalDay(now);
  const dayEnd = useMemo(() => {
    const end = new Date(dayStart);
    end.setDate(dayStart.getDate() + 1);
    return end;
  }, [dayStart]);
  const weekEnd = useMemo(() => {
    const end = new Date(dayStart);
    end.setDate(dayStart.getDate() + 7);
    return end;
  }, [dayStart]);

  const { overdue, dueToday, dueSoon } = useMemo(() => {
    const buckets = { overdue: [], dueToday: [], dueSoon: [] };
    for (const task of tasks) {
      if (task.status === "done" || completion[task.id]) continue;
      const due = taskDueDate(task);
      if (!due) continue;
      if (due < dayStart) buckets.overdue.push(task);
      else if (due < dayEnd) buckets.dueToday.push(task);
      else if (due < weekEnd) buckets.dueSoon.push(task);
    }
    buckets.overdue.sort((a, b) => taskDueDate(a) - taskDueDate(b));
    buckets.dueToday.sort((a, b) => taskDueDate(a) - taskDueDate(b));
    buckets.dueSoon.sort((a, b) => taskDueDate(a) - taskDueDate(b));
    return buckets;
  }, [tasks, completion, dayStart, dayEnd, weekEnd]);

  const todayClasses = useMemo(() => {
    if (!schedule) return [];
    return scheduleItemsForDate(schedule, now).filter((item) => item.kind === "class");
  }, [schedule, now]);

  const phase = useMemo(() => phaseAhead(now), [now]);
  const week = getAcademicWeek(now);

  const nextToday = useMemo(() => {
    if (!next) return null;
    const nextStart = startOfLocalDay(next.start);
    const todayStart = startOfLocalDay(now);
    const dayOffset = Math.round((nextStart - todayStart) / 86400000);
    return { ...next, dayOffset };
  }, [next, now]);

  // The one fact in the title bar.
  const fact = useMemo(() => {
    if (happeningNow) return `${happeningNow.title} · until ${timeHM(happeningNow.end)}`;
    if (nextToday?.dayOffset === 0)
      return `${nextToday.title} ${timeHM(nextToday.start)} · ${nextToday.venue}`;
    if (overdue.length) return `${overdue.length} overdue`;
    return week?.formatted || "";
  }, [happeningNow, nextToday, overdue.length, week]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const toggleTask = useCallback(
    async (task) => {
      const done = task.status !== "done";
      setCompletion((prev) => ({ ...prev, [task.id]: done }));
      try {
        await updateTask(token, task.id, { status: done ? "done" : "pending" });
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: done ? "done" : "pending" } : t)),
        );
        window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
      } catch {
        setCompletion((prev) => ({ ...prev, [task.id]: !done }));
      }
    },
    [token],
  );

  const renderTaskRow = (task, tone) => {
    const due = taskDueDate(task);
    const color = getTaskModuleColor(task, modules);
    return (
      <div key={task.id} className="ins-duerow">
        <input
          type="checkbox"
          className="ins-check"
          checked={false}
          onChange={() => toggleTask(task)}
          aria-label={`Mark ${task.title} done`}
        />
        <span
          className="ins-tick"
          style={{ "--tick-color": color || "var(--ins-ink-faint)", height: 16 }}
        />
        <button type="button" className="ins-duerow-title" onClick={() => onNavigate?.("tasks")}>
          {task.title}
        </button>
        {task.module_code && <span className="ins-cap ins-mono">{task.module_code}</span>}
        <span className={`ins-duerow-due ins-mono${tone === "overdue" ? " is-overdue" : ""}`}>
          {due ? dueLabel(due, now) : ""}
        </span>
      </div>
    );
  };

  const dateLabel = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const everythingEmpty =
    loaded && !happeningNow && !nextToday && overdue.length === 0 && dueToday.length === 0;

  return (
    <div className="ins-today">
      <header className="ins-today-head">
        <h2 className="ins-display">{dateLabel}</h2>
        <p className="ins-sub ins-mono">
          {week?.formatted || ""}
          {phase ? ` · ${phase.label} in ${phase.inDays} day${phase.inDays === 1 ? "" : "s"}` : ""}
        </p>
      </header>

      {everythingEmpty && (
        <div className="ins-empty ins-today-empty">
          <span>No classes on the timetable</span>
          <span>
            Import one with <kbd className="ins-kbd">⌘O</kbd>
          </span>
        </div>
      )}

      {happeningNow && (
        <section className="ins-sec">
          <div className="ins-nowline">
            <span className="ins-now-dot" />
            <span className="ins-nowline-title">{happeningNow.title}</span>
            {happeningNow.subtitle && <span className="ins-cap">{happeningNow.subtitle}</span>}
            <span className="ins-cap">{happeningNow.venue}</span>
            <span className="ins-mono ins-nowline-until">until {timeHM(happeningNow.end)}</span>
          </div>
        </section>
      )}

      {nextToday && (
        <section className="ins-sec">
          <div className="ins-sec-head">
            <h2>Next</h2>
            <span className="ins-cap ins-mono">
              {nextToday.dayOffset === 0
                ? "today"
                : nextToday.dayOffset === 1
                  ? "tomorrow"
                  : now.toLocaleDateString([], { weekday: "short" })}
            </span>
          </div>
          <div className="ins-next" style={{ "--tick-color": nextToday.color }}>
            <div className="ins-next-main">
              <span className="ins-tick" style={{ "--tick-color": nextToday.color }} />
              <div className="ins-next-title">
                <strong>{nextToday.title}</strong>
                <span className="ins-cap">
                  {nextToday.subtitle}
                  {nextToday.classNo ? ` · ${nextToday.classNo}` : ""}
                </span>
              </div>
              <div className="ins-next-time">
                <span className="ins-mono ins-next-clock">{timeHM(nextToday.start)}</span>
                <span className="ins-cap">{nextToday.venue}</span>
              </div>
            </div>
            {journey?.best && (
              <div className="ins-next-journey">
                <span className="ins-mono ins-next-route">
                  {journey.best.service} from {journey.best.fromStopName}
                </span>
                <span className="ins-cap">
                  {journey.best.nextBusMinutes != null
                    ? journey.best.nextBusMinutes < 180
                      ? `bus in ${journey.best.nextBusMinutes} min`
                      : `bus at ${timeHM(new Date(now.getTime() + journey.best.nextBusMinutes * 60000))}`
                    : "bus awaiting feed"}
                  {" · arrives "}
                  {timeHM(journey.best.arrivesAt)} · then {journey.best.walkFromStopMin} min walk
                  {journey.best.travelSource === "live" ? "" : " · est"}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {(overdue.length > 0 || dueToday.length > 0 || dueSoon.length > 0) && (
        <section className="ins-sec">
          {overdue.length > 0 && (
            <>
              <div className="ins-sec-head">
                <h2>
                  Overdue <span className="ins-mono ins-count is-overdue">{overdue.length}</span>
                </h2>
              </div>
              {overdue.slice(0, 5).map((task) => renderTaskRow(task, "overdue"))}
              {overdue.length > 5 && (
                <button
                  type="button"
                  className="ins-btn is-ghost"
                  onClick={() => onNavigate?.("tasks")}
                >
                  All {overdue.length} in Tasks
                </button>
              )}
            </>
          )}
          {dueToday.length > 0 && (
            <>
              <div className="ins-sec-head">
                <h2>
                  Due today <span className="ins-mono ins-count">{dueToday.length}</span>
                </h2>
              </div>
              {dueToday.slice(0, 6).map((task) => renderTaskRow(task))}
            </>
          )}
          {dueSoon.length > 0 && (
            <>
              <div className="ins-sec-head">
                <h2>
                  This week <span className="ins-mono ins-count">{dueSoon.length}</span>
                </h2>
              </div>
              {dueSoon.slice(0, 5).map((task) => renderTaskRow(task))}
            </>
          )}
        </section>
      )}

      {todayClasses.length > 0 && (
        <section className="ins-sec">
          <div className="ins-sec-head">
            <h2>Classes</h2>
            <span className="ins-cap ins-mono">{todayClasses.length} today</span>
          </div>
          <div className="ins-classlist">
            {todayClasses.map((item) => {
              const state =
                now >= item.start && now < item.end ? "is-now" : now >= item.end ? "is-past" : "";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ins-classrow ${state}`}
                  onClick={() => onNavigate?.("schedule")}
                >
                  <span className="ins-tick" style={{ "--tick-color": item.color }} />
                  <span className="ins-mono ins-classrow-time">{timeHM(item.start)}</span>
                  <span className="ins-classrow-title">{item.title}</span>
                  <span className="ins-cap">{item.subtitle}</span>
                  <span className="ins-cap ins-classrow-venue">{item.venue}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {stops.length > 0 && (
        <section className="ins-sec">
          <div className="ins-sec-head">
            <h2>Departures</h2>
          </div>
          <BusStrip
            token={token}
            stops={stops}
            stopId={pinnedStopId}
            onSelectStop={() => onNavigate?.("venues")}
          />
        </section>
      )}

      {brief?.new_announcements?.length > 0 && (
        <section className="ins-sec">
          <div className="ins-sec-head">
            <h2>Announcements</h2>
            <span className="ins-cap ins-mono">{brief.new_announcements.length} new</span>
          </div>
          {brief.new_announcements.slice(0, 4).map((a) => (
            <button
              key={a.id}
              type="button"
              className="ins-duerow as-button"
              onClick={() => onNavigate?.("canvas")}
            >
              <span className="ins-cap ins-mono ins-duerow-course">{a.course}</span>
              <span className="ins-duerow-title">{a.title}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
