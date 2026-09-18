// Home — the ledger. The day as a vertical timeline beside a narrow brief,
// dues as weather, the campus as a card. Everything the view draws is a
// fact; everything it hides lives one hover or click away. Customisation
// rides readDashboardConfig — clock, type, layout, and which voices show.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAcademicModules,
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
import {
  clockParts,
  examRows,
  fortnightBuckets,
  fuseDueItems,
  gapAround,
  openWindows,
  railScale,
  runwayPhaseLabel,
  semesterRunway,
  tomorrowFirst,
  windowLabel,
} from "../ledger";
import { DASHBOARD_EVENT, readDashboardConfig } from "../dashboardConfig";
import { loadBrief, readBriefCache } from "../briefCache";
import { BusCard } from "../busCards";
import { DayTimeline, ExamsList, HorizonColumns, HorizonList, HorizonStrip } from "../ledgerViews";
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

function useDashboardConfig() {
  const [config, setConfig] = useState(readDashboardConfig);
  useEffect(() => {
    const onChange = () => setConfig(readDashboardConfig());
    window.addEventListener(DASHBOARD_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(DASHBOARD_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return config;
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

/* The day rail — kept as an option for people who read the day as a shape. */
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
        return (
          <span
            key={index}
            className={`ins-tip ins-rail-window${left > 62 ? " is-flipped" : ""}`}
            style={{ left: `${left}%`, width: `${pctOf(w.until) - left}%` }}
            data-tip={`${windowLabel(w.minutes)} open\n${timeHM(w.from)}–${timeHM(w.until)}`}
          />
        );
      })}
      {items.map((item) => {
        const left = pctOf(item.start);
        const width = Math.max(pctOf(item.end) - left, 0.6);
        const state = now >= item.end ? " is-past" : "";
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
            transform: pctOfMin(nowMin) > 70 ? "translateX(calc(-100% - 6px))" : "translateX(6px)",
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

/* Featured card — the rail's companion when the day reads as a shape. */
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

/* Due rows — tasks check here, Canvas assignments point there. */
function DueRow({
  item,
  tone,
  now,
  onToggleTask,
  onOpenTasks,
  onOpenModules,
  findTask,
  colorFor,
  isDone,
}) {
  const isTask = item.kind === "task";
  const task = isTask ? findTask(item) : null;
  const checked = isTask && Boolean(task && (task.status === "done" || isDone(task)));
  const color = colorFor(item);
  return (
    <div className="ins-duerow">
      {isTask ? (
        <input
          type="checkbox"
          className="ins-check"
          checked={Boolean(checked)}
          onChange={() => task && onToggleTask(task)}
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
        onClick={() => (isTask ? onOpenTasks() : onOpenModules())}
      >
        {item.title}
      </button>
      {item.courseCode && <span className="ins-cap ins-mono">{item.courseCode}</span>}
      <span className={`ins-duerow-due ins-mono${tone === "overdue" ? " is-overdue" : ""}`}>
        {dueLabel(item.due, now)}
      </span>
    </div>
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
  // The brief starts from cache — a tab switch never shows an empty note.
  const [brief, setBrief] = useState(() => readBriefCache()?.brief || null);
  const [journey, setJourney] = useState(null);
  const [completion, setCompletion] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [featuredId, setFeaturedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [bus, setBus] = useState({ arrivals: null, failed: false });
  const journeyTimer = useRef(null);
  const [containerRef, width] = useContainerWidth();
  const config = useDashboardConfig();

  const refreshBrief = useCallback(async () => {
    setRefreshing(true);
    try {
      const { brief: next } = await loadBrief(token, { force: true });
      if (next) setBrief(next);
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
    // A cached brief is already on screen; this only asks again when the
    // cache is worth refreshing.
    loadBrief(token).then(({ brief: next }) => {
      if (alive && next) setBrief(next);
    });
    Promise.allSettled([
      getSchedule(token),
      getTasks(token),
      getCanvasAssignments(token),
      getCanvasCourses(token),
      getAcademicModules(token),
      getCampusBusStops(token),
      getVenueLocations(token),
    ]).then(([scheduleRes, tasksRes, assignmentsRes, coursesRes, modulesRes, stopsRes, locRes]) => {
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
    });
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
  const horizon = useMemo(
    () => fortnightBuckets(fused, now, config.horizon.range),
    [fused, now, config.horizon.range],
  );
  const horizonPhases = useMemo(
    () => horizon.columns.map((col) => getAcademicWeek(col.date)?.type),
    [horizon],
  );
  const exams = useMemo(() => examRows(schedule?.exams, now), [schedule, now]);

  const week = getAcademicWeek(now);

  // The one fact in the title bar.
  const fact = useMemo(() => {
    if (happeningNow) return `${happeningNow.title} · until ${timeHM(happeningNow.end)}`;
    if (nextToday?.dayOffset === 0)
      return `${nextToday.title} ${timeHM(nextToday.start)} · ${nextToday.venue}`;
    if (horizon.overdue.length) return `${horizon.overdue.length} overdue`;
    return week?.formatted || "";
  }, [happeningNow, nextToday, horizon.overdue.length, week]);

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

  const colorFor = useCallback(
    (item) => {
      if (item.kind === "task") {
        const task = tasks.find((t) => `task-${t.id}` === item.id);
        return task ? getTaskModuleColor(task, modules) : null;
      }
      return courses.find((c) => c.course_code === item.courseCode)?.color || null;
    },
    [tasks, modules, courses],
  );

  const findTask = useCallback(
    (item) => {
      const id = item.id.slice(5);
      return tasks.find((t) => String(t.id) === id) || null;
    },
    [tasks],
  );

  const dueRowProps = useMemo(
    () => ({
      now,
      onToggleTask: toggleTask,
      onOpenTasks: () => onNavigate?.("tasks"),
      onOpenModules: () => onNavigate?.("canvas"),
      findTask,
      colorFor,
      isDone: (task) => Boolean(task && completion[task.id]),
    }),
    [now, toggleTask, onNavigate, findTask, colorFor, completion],
  );

  const renderDueRow = (item, tone) => (
    <DueRow key={item.id} item={item} tone={tone} {...dueRowProps} />
  );

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

  const toggleRow = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const openInbox = useCallback(() => {
    localStorage.setItem(
      "canvenient.instrument.modules.sel",
      JSON.stringify({ kind: "inbox", courseId: null }),
    );
    window.dispatchEvent(
      new CustomEvent("canvenient-modules-select", { detail: { kind: "inbox", courseId: null } }),
    );
    onNavigate?.("canvas");
  }, [onNavigate]);

  const openDayItems =
    openDay === "overdue"
      ? horizon.overdue
      : typeof openDay === "number"
        ? horizon.columns[openDay]?.items || []
        : [];
  const openDayDate = typeof openDay === "number" ? horizon.columns[openDay]?.date : null;

  const featured = useMemo(() => {
    if (featuredId) {
      const hit = dayItems.find((item) => item.id === featuredId);
      if (hit) return hit;
    }
    if (happeningNow) return happeningNow;
    return nextToday;
  }, [featuredId, dayItems, happeningNow, nextToday]);
  const featuredIsToday = Boolean(featured && dayItems.some((i) => i.id === featured.id));
  const featuredLabel = !featured
    ? null
    : featured.id === happeningNow?.id
      ? `now · until ${timeHM(featured.end)}`
      : featuredIsToday
        ? `today · ${timeHM(featured.start)}`
        : featured.dayOffset === 1
          ? "tomorrow"
          : featured.start.toLocaleDateString([], { weekday: "short" });

  const clock = clockParts(now, config);
  const dateLabel = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const stop = stops.find((s) => s.id === pinnedStopId);

  const horizonProps = { buckets: horizon, phases: horizonPhases, openDay, onToggle: toggleDay };
  const HorizonView =
    config.horizon.view === "strip"
      ? HorizonStrip
      : config.horizon.view === "list"
        ? HorizonList
        : HorizonColumns;

  const duesSection =
    config.dues && (horizon.overdue.length > 0 || horizon.columns[0]?.items.length > 0) ? (
      <section className="ins-sec">
        {horizon.overdue.length > 0 && (
          <>
            <div className="ins-sec-head">
              <p className="ins-label is-red">Overdue</p>
              <span className="ins-numeral ins-duenum is-red">{horizon.overdue.length}</span>
            </div>
            {renderDayRows(horizon.overdue, "overdue")}
          </>
        )}
        {horizon.columns[0]?.items.length > 0 && (
          <>
            <div className="ins-sec-head">
              <p className="ins-label">Due today</p>
              <span className="ins-numeral ins-duenum">{horizon.columns[0].items.length}</span>
            </div>
            {renderDayRows(horizon.columns[0].items, "today")}
          </>
        )}
      </section>
    ) : null;

  const horizonSection = fused.length > 0 && (
    <section className="ins-sec">
      {config.horizon.label && (
        <div className="ins-sec-head">
          <p className="ins-label">{config.horizon.label}</p>
        </div>
      )}
      <HorizonView {...horizonProps} />
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
          {openDayItems.map((item) =>
            renderDueRow(item, openDay === "overdue" ? "overdue" : "later"),
          )}
        </div>
      )}
    </section>
  );

  const campusSection = (
    <>
      {stops.length > 0 && (
        <section className="ins-sec">
          <BusCard
            variant={config.busCard}
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
        {brief?.new_announcements?.length > 0 && (
          <button type="button" className="ins-inboxline" onClick={openInbox}>
            <span className="ins-inbox-dot" />
            <span className="ins-mono">{brief.new_announcements.length} new</span>
            <span className="ins-inbox-courses ins-mono">
              {[
                ...brief.new_announcements.reduce(
                  (map, a) => map.set(a.course, (map.get(a.course) || 0) + 1),
                  new Map(),
                ),
              ]
                .slice(0, 3)
                .map(([course, count]) => (count > 1 ? `${course} ×${count}` : course))
                .join(" · ")}
            </span>
          </button>
        )}
        {config.exams && exams.length > 0 && (
          <section className="ins-sec ins-examssec">
            <div className="ins-sec-head">
              <p className="ins-label">Exams</p>
            </div>
            <ExamsList exams={exams} compact />
          </section>
        )}
      </section>
    </>
  );

  const daySection =
    config.dayView === "none" ? null : config.dayView === "rail" ? (
      scale ? (
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
          <span>{schedule ? "Clear day" : ""}</span>
          {tomorrow && (
            <span className="ins-mono">
              next tomorrow {timeHM(tomorrow.start)} · {tomorrow.title}
            </span>
          )}
        </div>
      )
    ) : (
      <DayTimeline
        items={dayItems}
        now={now}
        gap={gap}
        tomorrow={tomorrow}
        nextId={nextToday?.id}
        journey={journey}
        expandedId={expandedId}
        onToggle={toggleRow}
      />
    );

  // Body compositions — the same facts, arranged for the window's shape.
  const body =
    config.layout === "columns" ? (
      <div className="ins-home-body is-columns">
        <div className="ins-today-col">{duesSection}</div>
        <div className="ins-today-col">{horizonSection}</div>
        <div className="ins-today-col">{campusSection}</div>
      </div>
    ) : config.layout === "focus" ? (
      <div className="ins-home-body is-focus">
        <div className="ins-today-col">
          {duesSection}
          {horizonSection}
          {campusSection}
        </div>
      </div>
    ) : (
      <div className={`ins-home-body is-ledger${width >= 880 ? " is-wide" : ""}`}>
        <div className="ins-today-col">
          {duesSection}
          {horizonSection}
        </div>
        <div className="ins-today-col">{campusSection}</div>
      </div>
    );

  return (
    <div className="ins-today" ref={containerRef} data-font={config.font}>
      <header className="ins-today-head">
        <div className="ins-today-headline">
          <span className="ins-today-clock">
            {clock.main}
            {clock.tail && <span className="ins-today-sec">{clock.tail}</span>}
          </span>
          <h2 className="ins-display">{dateLabel}</h2>
        </div>
        <SemesterRunway runway={runway} />
      </header>

      <section className="ins-hometop">
        {config.brief && brief?.ai_ok && brief?.summary && (
          <div className="ins-sec ins-briefsection ins-hometop-brief">
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
          </div>
        )}
        <div className="ins-hometop-day ins-sec">{daySection}</div>
      </section>

      {body}
    </div>
  );
}
