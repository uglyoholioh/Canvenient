// Today — the ledger. The day drawn as a shape, dues as weather, the campus
// as a ribbon. Shape first; numbers only when they are live; details on
// demand; nothing spelled out that a high-level user can already infer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAcademicModules,
  getAssistantBrief,
  getCampusBusArrivals,
  getCampusBusStops,
  getCanvasAssignments,
  getCanvasCourses,
  getSchedule,
  getTasks,
  getVenueLocations,
  updateTask,
} from "../../api";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  getAcademicWeek,
  getTaskModuleColor,
  localDateKey,
  scheduleItemsForDate,
  startOfLocalDay,
} from "../../components/scheduleUtils";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import { buildClassJourney, nextClass, resolveOrigin } from "../journey";
import { serviceTone } from "../busTones";
import {
  barCount,
  fortnightBuckets,
  fuseDueItems,
  gapAround,
  openWindows,
  railScale,
  ribbonTicks,
  runwayPhaseLabel,
  semesterRunway,
  tomorrowFirst,
  windowLabel,
} from "../ledger";
import "../views/today.css";

const BUS_REFRESH_MS = 20000;
const JOURNEY_REFRESH_MS = 60000;

function timeHM(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const days = Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / 86400000);
  return `in ${days} days`;
}

function useContainerWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1000,
  );
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/* The semester as a hairline: phases exist only as tints, the name lives in
   the hover, and a coral dot rides the span. */
function SemesterRunway({ runway }) {
  if (!runway) return null;
  const span = runway.end.getTime() - runway.start.getTime();
  if (span <= 0) return null;
  const pct = (date) => ((date.getTime() - runway.start.getTime()) / span) * 100;
  return (
    <div className="ins-semrunway" role="img" aria-label="Semester progress">
      {runway.segments.map((seg, index) => (
        <span
          key={index}
          className={`ins-semrunway-seg is-${seg.type}`}
          style={{ left: `${pct(seg.start)}%`, width: `${pct(seg.end) - pct(seg.start)}%` }}
          title={`${runwayPhaseLabel(seg.type)} · ${seg.start.toLocaleDateString([], {
            day: "numeric",
            month: "short",
          })}`}
        />
      ))}
      <span className="ins-semrunway-dot" style={{ left: `${runway.todayFrac * 100}%` }} />
    </div>
  );
}

/* The day rail — today's shape. Blocks carry code only; the hover carries
   the facts; the now-dot carries the one live caption. */
function DayRail({ items, scale, now, windows, gap, featuredId, onSelect, tomorrow }) {
  const spanMin = scale.endMin - scale.startMin;
  const pctOfMin = (minutes) => ((minutes - scale.startMin) / spanMin) * 100;
  const pctOf = (date) => pctOfMin(date.getHours() * 60 + date.getMinutes());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowOnRail = nowMin >= scale.startMin && nowMin <= scale.endMin;
  const hours = [];
  for (let h = Math.ceil(scale.startMin / 60); h * 60 <= scale.endMin; h += 1) hours.push(h);

  return (
    <div className="ins-rail">
      {hours.map((h) => (
        <span key={h}>
          <span className="ins-rail-hour" style={{ left: `${pctOfMin(h * 60)}%` }} />
          {h % 3 === 0 && (
            <span className="ins-rail-hourlabel" style={{ left: `${pctOfMin(h * 60)}%` }}>
              {String(h).padStart(2, "0")}
            </span>
          )}
        </span>
      ))}
      {windows.map((w, index) => {
        const left = pctOf(w.from);
        const flipped = left > 62;
        return (
          <span
            key={index}
            className={`ins-tip ins-rail-window${flipped ? " is-flipped" : ""}`}
            style={{ left: `${left}%`, width: `${pctOf(w.until) - left}%` }}
            data-tip={`${windowLabel(w.minutes)} open\n${timeHM(w.from)}–${timeHM(w.until)}`}
          />
        );
      })}
      {items.map((item) => {
        const left = pctOf(item.start);
        const width = Math.max(pctOf(item.end) - left, 0.6);
        const state =
          now >= item.end ? " is-past" : now >= item.start ? "" : "";
        return (
          <button
            key={item.id}
            type="button"
            className={`ins-tip ins-rail-block is-${item.kind}${state}${
              featuredId === item.id ? " is-selected" : ""
            }${left + width / 2 > 62 ? " is-flipped" : ""}`}
            style={{ left: `${left}%`, width: `${width}%`, "--tick-color": item.color }}
            onClick={() => onSelect(item.id)}
            data-tip={`${timeHM(item.start)}–${timeHM(item.end)}\n${item.title}${
              item.subtitle ? ` · ${item.subtitle}` : ""
            }${item.classNo ? ` ${item.classNo}` : ""}\n${item.venue}`}
            aria-label={`${item.title} ${timeHM(item.start)}`}
          >
            {width >= 5 && <span className="ins-rail-blockcode">{item.title}</span>}
          </button>
        );
      })}
      {nowOnRail && (
        <span className="ins-rail-now" style={{ left: `${pctOfMin(nowMin)}%` }}>
          <i />
        </span>
      )}
      {gap && nowOnRail && (
        <span
          className="ins-rail-gap ins-mono"
          style={{
            left: `${pctOfMin(nowMin)}%`,
            transform:
              pctOfMin(nowMin) > 70 ? "translateX(calc(-100% - 6px))" : "translateX(6px)",
          }}
        >
          {windowLabel(gap.minutesLeft)}
        </span>
      )}
      {tomorrow && (
        <span
          className="ins-tip ins-rail-tom"
          data-tip={`Tomorrow ${timeHM(tomorrow.start)} · ${tomorrow.title}`}
        />
      )}
    </div>
  );
}

/* The featured card — the rail's detail, on demand. */
function FeaturedCard({ item, now, label, journey }) {
  const upcoming = item.start > now;
  const approachPct = upcoming
    ? Math.max(0, Math.min(100, (1 - (item.start - now) / (8 * 3600 * 1000)) * 100))
    : 0;
  return (
    <div className="ins-next" style={{ "--tick-color": item.color }}>
      <span className="ins-cap">{label}</span>
      <div className="ins-next-main">
        <span className="ins-tick" />
        <div className="ins-next-title">
          <strong>{item.title}</strong>
          <span className="ins-cap">
            {item.subtitle}
            {item.classNo ? ` · ${item.classNo}` : ""}
          </span>
        </div>
        <div className="ins-next-time">
          <span className="ins-mono ins-next-clock">{timeHM(item.start)}</span>
          <span className="ins-cap">{item.venue}</span>
        </div>
      </div>
      {upcoming && (
        <div className="ins-meter ins-next-meter">
          <span style={{ width: `${approachPct}%` }} />
        </div>
      )}
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
  );
}

/* The fortnight — dues as weather. Hover reads a column, click expands it. */
function FortnightStrip({ buckets, phases, openDay, onToggle }) {
  const tipFor = (col) => {
    if (col.items.length === 0) return "Nothing due";
    const lines = col.items
      .slice(0, 3)
      .map((item) => `${item.courseCode ? `${item.courseCode} ` : ""}${item.title}`);
    if (col.items.length > 3) lines.push(`+${col.items.length - 3} more`);
    return lines.join("\n");
  };

  return (
    <div className="ins-fortnight">
      {buckets.overdue.length > 0 && (
        <button
          type="button"
          className={`ins-tip ins-fncol is-cap${openDay === "overdue" ? " is-open" : ""}`}
          data-tip={`Overdue · ${buckets.overdue.length}`}
          onClick={() => onToggle("overdue")}
        >
          <span className="ins-fncap">{buckets.overdue.length}</span>
        </button>
      )}
      {buckets.columns.map((col, index) => {
        const { bars, overflow } = barCount(col.items.length);
        const phase = phases[index];
        const phaseClass = ["recess", "reading", "exam"].includes(phase) ? ` is-${phase}` : "";
        return (
          <button
            key={index}
            type="button"
            className={`ins-tip ins-fncol${phaseClass}${index === 0 ? " is-today" : ""}${
              openDay === index ? " is-open" : ""
            }`}
            data-tip={`${col.date.toLocaleDateString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}\n${tipFor(col)}`}
            onClick={() => onToggle(index)}
          >
            {col.examCount > 0 && <i className="ins-fnexam" />}
            <span className="ins-fnbars">
              {Array.from({ length: bars }, (_, bar) => (
                <i key={bar} style={{ height: `${10 + bar * 5}px` }} />
              ))}
              {overflow > 0 && <em className="ins-fnoverflow ins-mono">+{overflow}</em>}
            </span>
            <span className="ins-fnlabel">
              {index === 0 ? "today" : col.date.toLocaleDateString([], { weekday: "narrow" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* The departure ribbon — the hour as ticks in route tones. */
function DepartureRibbon({ arrivals, failed, stopName, onOpen }) {
  const { ticks, next } = ribbonTicks(arrivals?.arrivals || []);
  return (
    <button
      type="button"
      className={`ins-ribbon${failed ? " is-stale" : ""}`}
      onClick={onOpen}
      title="Open Campus · Bus"
    >
      <div className="ins-ribbon-head">
        <span className="ins-label">{stopName}</span>
        <span className="ins-mono ins-ribbon-next">
          {next
            ? `${next.service} · ${next.minute === 0 ? "now" : `${next.minute} min`}`
            : "no departures in the hour"}
        </span>
      </div>
      {ticks.length > 0 ? (
        <div className="ins-ribbon-track">
          {[0, 25, 50, 75, 100].map((p) => (
            <i key={p} className="ins-ribbon-rule" style={{ left: `${p}%` }} />
          ))}
          {ticks.map((tick, index) => (
            <i
              key={index}
              className={`ins-tip ins-ribbontick${tick.imminent ? " is-imminent" : ""}`}
              style={{ left: `${(tick.minute / 60) * 100}%`, "--tone": serviceTone(tick.service) }}
              data-tip={`${tick.service} · ${tick.minute === 0 ? "boarding" : `${tick.minute} min`}`}
            />
          ))}
        </div>
      ) : (
        <p className="ins-cap">
          {arrivals ? "No departures in the feed." : "Departures unavailable right now."}
        </p>
      )}
    </button>
  );
}

/* The inbox — one line, only when there is news. */
function InboxLine({ announcements, onOpen }) {
  if (!announcements?.length) return null;
  const byCourse = new Map();
  for (const a of announcements) {
    byCourse.set(a.course, (byCourse.get(a.course) || 0) + 1);
  }
  const courses = [...byCourse.entries()]
    .slice(0, 3)
    .map(([course, count]) => (count > 1 ? `${course} ×${count}` : course))
    .join(" · ");
  return (
    <button type="button" className="ins-inboxline" onClick={onOpen}>
      <span className="ins-inbox-dot" />
      <span className="ins-mono">{announcements.length} new</span>
      <span className="ins-inbox-courses ins-mono">{courses}</span>
    </button>
  );
}

export default function TodayView({ token, onNavigate }) {
  const [now, setNow] = useState(() => new Date());
  const [schedule, setSchedule] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [stops, setStops] = useState([]);
  const [locations, setLocations] = useState({});
  const [centroids, setCentroids] = useState({});
  const [brief, setBrief] = useState(null);
  const [journey, setJourney] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [completion, setCompletion] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [featuredId, setFeaturedId] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [bus, setBus] = useState({ arrivals: null, failed: false });
  const journeyTimer = useRef(null);
  const [containerRef, width] = useContainerWidth();
  const wide = width >= 880;

  const refreshBrief = useCallback(async () => {
    setRefreshing(true);
    try {
      setBrief(await getAssistantBrief(token, true));
    } catch {
      // The previous brief, or none, stays on screen.
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  // The clock ticks every second; the page breathes with it.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      getSchedule(token),
      getTasks(token),
      getCanvasAssignments(token),
      getCanvasCourses(token),
      getAcademicModules(token),
      getCampusBusStops(token),
      getVenueLocations(token),
    ]).then(
      ([
        scheduleRes,
        tasksRes,
        assignmentsRes,
        coursesRes,
        modulesRes,
        stopsRes,
        locRes,
      ]) => {
        if (!alive) return;
        if (scheduleRes.status === "fulfilled") setSchedule(scheduleRes.value);
        if (tasksRes.status === "fulfilled") setTasks(tasksRes.value || []);
        if (assignmentsRes.status === "fulfilled") setAssignments(assignmentsRes.value || []);
        if (coursesRes.status === "fulfilled") setCourses(coursesRes.value || []);
        if (modulesRes.status === "fulfilled") setModules(modulesRes.value || []);
        if (stopsRes.status === "fulfilled") setStops(stopsRes.value?.stops || []);
        if (locRes.status === "fulfilled") {
          setLocations(locRes.value?.locations || {});
          setCentroids(locRes.value?.building_centroids || {});
        }
        setLoaded(true);
      },
    );
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

  useEffect(() => {
    if (!pinnedStopId) return undefined;
    let alive = true;
    const load = () => {
      getCampusBusArrivals(token, pinnedStopId)
        .then((data) => {
          if (!alive) return;
          setBus({ arrivals: data, failed: false });
        })
        .catch(() => {
          if (alive) setBus((prev) => ({ ...prev, failed: true }));
        });
    };
    load();
    const timer = window.setInterval(load, BUS_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token, pinnedStopId]);

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

  const dayKey = localDateKey(now);
  const dayItems = useMemo(
    () => (schedule ? scheduleItemsForDate(schedule, now) : []),
    [schedule, now],
  );
  const scale = useMemo(() => railScale(dayItems), [dayItems]);
  const windows = useMemo(() => openWindows(dayItems), [dayItems]);
  const gap = useMemo(() => gapAround(dayItems, now, scale), [dayItems, now, scale]);
  const tomorrowItems = useMemo(() => {
    if (!schedule) return [];
    const day = new Date(now);
    day.setDate(day.getDate() + 1);
    return scheduleItemsForDate(schedule, day);
  }, [schedule, now]);
  const tomorrow = useMemo(() => tomorrowFirst(tomorrowItems), [tomorrowItems]);

  const nextToday = useMemo(() => {
    if (!next) return null;
    const nextStart = startOfLocalDay(next.start);
    const todayStart = startOfLocalDay(now);
    return { ...next, dayOffset: Math.round((nextStart - todayStart) / 86400000) };
  }, [next, now]);

  // The runway walks the whole semester; rebuild it when the day turns,
  // not on every clock tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runway = useMemo(() => semesterRunway(new Date()), [dayKey]);
  const fused = useMemo(
    () => fuseDueItems(tasks, assignments, courses),
    [tasks, assignments, courses],
  );
  const fortnight = useMemo(() => fortnightBuckets(fused, now), [fused, now]);
  const fortnightPhases = useMemo(
    () => fortnight.columns.map((col) => getAcademicWeek(col.date)?.type),
    [fortnight],
  );

  // The featured card defaults to now/next and follows the user's clicks.
  const featured = useMemo(() => {
    if (featuredId) {
      const hit = dayItems.find((item) => item.id === featuredId);
      if (hit) return hit;
    }
    if (happeningNow) return happeningNow;
    return nextToday;
  }, [featuredId, dayItems, happeningNow, nextToday]);

  const week = getAcademicWeek(now);

  // The one fact in the title bar.
  const fact = useMemo(() => {
    if (happeningNow) return `${happeningNow.title} · until ${timeHM(happeningNow.end)}`;
    if (nextToday?.dayOffset === 0)
      return `${nextToday.title} ${timeHM(nextToday.start)} · ${nextToday.venue}`;
    if (fortnight.overdue.length) return `${fortnight.overdue.length} overdue`;
    return week?.formatted || "";
  }, [happeningNow, nextToday, fortnight.overdue.length, week]);

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

  const fusedColor = useCallback(
    (item) => {
      if (item.kind === "task") {
        const task = tasks.find((t) => String(t.id) === item.id.slice(5));
        return task ? getTaskModuleColor(task, modules) : null;
      }
      return courses.find((c) => c.course_code === item.courseCode)?.color || null;
    },
    [tasks, modules, courses],
  );

  const renderDueRow = (item, tone) => {
    const isTask = item.kind === "task";
    const task = isTask ? tasks.find((t) => String(t.id) === item.id.slice(5)) : null;
    const checked = isTask && (task?.status === "done" || completion[task?.id]);
    const color = fusedColor(item);
    return (
      <div key={item.id} className="ins-duerow">
        {isTask ? (
          <input
            type="checkbox"
            className="ins-check"
            checked={Boolean(checked)}
            onChange={() => task && toggleTask(task)}
            aria-label={`Mark ${item.title} done`}
          />
        ) : (
          <span className="ins-canvaschip" title="Canvas assignment">
            <ExternalLink size={12} strokeWidth={1.8} />
          </span>
        )}
        <span
          className="ins-tick"
          style={{ "--tick-color": color || "var(--ins-ink-faint)", height: 16 }}
        />
        <button
          type="button"
          className="ins-duerow-title"
          onClick={() => onNavigate?.(isTask ? "tasks" : "canvas")}
        >
          {item.title}
        </button>
        {item.courseCode && <span className="ins-cap ins-mono">{item.courseCode}</span>}
        <span className={`ins-duerow-due ins-mono${tone === "overdue" ? " is-overdue" : ""}`}>
          {dueLabel(item.due, now)}
        </span>
      </div>
    );
  };

  const renderDayRows = (items, tone) => {
    const visible = tone === "overdue" ? items.slice(0, 5) : items.slice(0, 6);
    return (
      <>
        {visible.map((item) => renderDueRow(item, tone))}
        {tone === "overdue" && items.length > 5 && (
          <button type="button" className="ins-btn is-ghost" onClick={() => onNavigate?.("tasks")}>
            All {items.length} in Tasks
          </button>
        )}
      </>
    );
  };

  const toggleDay = useCallback((day) => {
    setOpenDay((prev) => (prev === day ? null : day));
  }, []);

  const openDayItems =
    openDay === "overdue"
      ? fortnight.overdue
      : typeof openDay === "number"
        ? fortnight.columns[openDay]?.items || []
        : [];
  const openDayDate =
    typeof openDay === "number" ? fortnight.columns[openDay]?.date : null;

  const featuredIsToday = featured && dayItems.includes(featured);
  const featuredLabel = !featured
    ? null
    : featured === happeningNow
      ? `now · until ${timeHM(featured.end)}`
      : featuredIsToday
        ? `today · ${timeHM(featured.start)}`
        : featured.dayOffset === 1
          ? "tomorrow"
          : featured.start.toLocaleDateString([], { weekday: "short" });

  const dateLabel = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const clockHM = timeHM(now);
  const clockSS = String(now.getSeconds()).padStart(2, "0");
  const stop = stops.find((s) => s.id === pinnedStopId);

  return (
    <div className="ins-today" ref={containerRef}>
      <header className="ins-today-head">
        <div className="ins-today-headline">
          <span className="ins-today-clock">
            {clockHM}
            <span className="ins-today-sec">:{clockSS}</span>
          </span>
          <h2 className="ins-display">{dateLabel}</h2>
        </div>
        <SemesterRunway runway={runway} />
      </header>

      {brief?.ai_ok && brief?.summary && (
        <section className="ins-sec ins-briefsection">
          <div className="ins-sec-head">
            <p className="ins-label">My Day</p>
            <div className="ins-briefsection-meta">
              <span className="ins-tag">AI</span>
              <button
                type="button"
                className="ins-iconbtn ins-briefsection-refresh"
                onClick={refreshBrief}
                disabled={refreshing}
                aria-label="Refresh brief"
                title="Refresh"
              >
                <RefreshCw size={13} className={refreshing ? "is-spinning" : ""} />
              </button>
            </div>
          </div>
          <p className="ins-briefsection-lead">{brief.summary}</p>
          {brief.attention?.length > 0 && (
            <div className="ins-briefsection-facts">
              {brief.attention.slice(0, 3).map((item, index) => (
                <div key={index} className="ins-brief-row">
                  <span className="ins-brief-dot" />
                  <span>{item.text || item}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="ins-sec">
        {scale ? (
          <>
            <DayRail
              items={dayItems}
              scale={scale}
              now={now}
              windows={windows}
              gap={gap}
              featuredId={featuredIsToday ? featured?.id : null}
              onSelect={setFeaturedId}
              tomorrow={tomorrow}
            />
            {featured && (
              <FeaturedCard
                item={featured}
                now={now}
                label={featuredLabel}
                journey={featured.id === nextToday?.id ? journey : null}
              />
            )}
          </>
        ) : (
          <div className="ins-clearline">
            <span>{loaded ? "Clear day" : ""}</span>
            {tomorrow && (
              <span className="ins-mono">
                next tomorrow {timeHM(tomorrow.start)} · {tomorrow.title}
              </span>
            )}
          </div>
        )}
      </section>

      <div className={`ins-today-body${wide ? " is-wide" : ""}`}>
        <div className="ins-today-col">
          {(fortnight.overdue.length > 0 || fortnight.columns[0]?.items.length > 0) && (
            <section className="ins-sec">
              {fortnight.overdue.length > 0 && (
                <>
                  <div className="ins-sec-head">
                    <p className="ins-label is-red">Overdue</p>
                    <span className="ins-numeral ins-duenum is-red">
                      {fortnight.overdue.length}
                    </span>
                  </div>
                  {renderDayRows(fortnight.overdue, "overdue")}
                </>
              )}
              {fortnight.columns[0]?.items.length > 0 && (
                <>
                  <div className="ins-sec-head">
                    <p className="ins-label">Due today</p>
                    <span className="ins-numeral ins-duenum">
                      {fortnight.columns[0].items.length}
                    </span>
                  </div>
                  {renderDayRows(fortnight.columns[0].items, "today")}
                </>
              )}
            </section>
          )}

          {fused.length > 0 && (
            <section className="ins-sec">
              <div className="ins-sec-head">
                <p className="ins-label">Fortnight</p>
              </div>
              <FortnightStrip
                buckets={fortnight}
                phases={fortnightPhases}
                openDay={openDay}
                onToggle={toggleDay}
              />
              {openDay !== null && (
                <div className="ins-fnlist">
                  <p className="ins-cap ins-mono ins-fnlist-head">
                    {openDay === "overdue"
                      ? "Overdue"
                      : openDayDate?.toLocaleDateString([], {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                    {" · "}
                    {openDayItems.length}
                  </p>
                  {openDayItems.map((item) => renderDueRow(item, openDay === "overdue" ? "overdue" : "later"))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="ins-today-col">
          {stops.length > 0 && (
            <section className="ins-sec">
              <DepartureRibbon
                arrivals={bus.arrivals}
                failed={bus.failed}
                stopName={stop?.name || "Bus stop"}
                onOpen={() => {
                  localStorage.setItem("canvenient.campus.page", "bus");
                  onNavigate?.("venues");
                }}
              />
            </section>
          )}
          <section className="ins-sec">
            <InboxLine
              announcements={brief?.new_announcements}
              onOpen={() => onNavigate?.("canvas")}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
