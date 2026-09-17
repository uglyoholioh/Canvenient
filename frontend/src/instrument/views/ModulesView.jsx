// Modules — the semester, organised by what you do with it.
//
// Smart views answer the cross-course questions: Deadlines (every due date in
// order), Inbox (every announcement), Grades (scores per course). Picking a
// module opens its workspace: assignments, files, its own announcements, and
// an overview. Data types drive the views — never the other way round.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dismissCanvasAnnouncement,
  getCanvasAnnouncements,
  getCanvasAssignments,
  getCanvasCourses,
  getCanvasGrades,
} from "../../api";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import CanvasDrawer from "../../components/drawers/CanvasDrawer";
import { FileBrowser } from "../../components/canvas/FileBrowser";
import "./modules.css";

function relativeDay(iso, now) {
  if (!iso) return "";
  const date = new Date(iso);
  const days = Math.round((date - now) / 86400000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days}d ago`;
  if (days <= 6) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function parseGradePercent(grade) {
  if (grade == null) return null;
  const m = String(grade).match(/([\d.]+)\s*%?/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

const SEL_KEY = "canvenient.instrument.modules.sel";
const DEFAULT_SELECTION = { kind: "deadlines", courseId: null };

function readSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEL_KEY) || "null");
    if (raw && ["deadlines", "inbox", "grades", "course"].includes(raw.kind)) return raw;
  } catch {
    // fall through to the default view
  }
  return DEFAULT_SELECTION;
}

export default function ModulesView({ token }) {
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState(readSelection);
  const [drawerItem, setDrawerItem] = useState(null);
  const [coursePane, setCoursePane] = useState("assignments");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      getCanvasCourses(token),
      getCanvasAssignments(token),
      getCanvasAnnouncements(token),
    ]).then(([coursesRes, assignmentsRes, announcementsRes]) => {
      if (!alive) return;
      setCourses(coursesRes.status === "fulfilled" ? coursesRes.value || [] : []);
      setAssignments(assignmentsRes.status === "fulfilled" ? assignmentsRes.value || [] : []);
      setAnnouncements(announcementsRes.status === "fulfilled" ? announcementsRes.value || [] : []);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const select = useCallback((kind, courseId = null) => {
    setSelection({ kind, courseId });
    localStorage.setItem(SEL_KEY, JSON.stringify({ kind, courseId }));
  }, []);

  const dismiss = useCallback(
    (item) => {
      setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
      dismissCanvasAnnouncement(token, item.id).catch(() => {});
    },
    [token],
  );

  const course = useMemo(
    () => courses.find((c) => String(c.id) === String(selection.courseId)) || null,
    [courses, selection],
  );

  // Grades load only when the Grades view is open — one small call per course.
  const gradeCourseIds = useMemo(
    () => (selection.kind === "grades" ? courses.map((c) => c.id) : []),
    [selection.kind, courses],
  );
  useEffect(() => {
    if (!gradeCourseIds.length) return undefined;
    let alive = true;
    Promise.allSettled(gradeCourseIds.map((id) => getCanvasGrades(token, id))).then((results) => {
      if (!alive) return;
      const merged = [];
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        const value = res.value;
        if (Array.isArray(value)) merged.push(...value);
        else if (value) merged.push(value);
      }
      setGrades(merged);
    });
    return () => {
      alive = false;
    };
  }, [token, gradeCourseIds]);

  const gradeFor = useCallback(
    (courseId) => {
      const entry = (grades || []).find((g) => String(g.course_id ?? g.id) === String(courseId));
      return entry?.grade ?? entry?.current_grade ?? null;
    },
    [grades],
  );

  // Deadlines — every dated assignment across courses, bucketed by distance.
  const deadlineBuckets = useMemo(() => {
    const buckets = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const tomorrowEnd = new Date(dayEnd);
    tomorrowEnd.setDate(dayEnd.getDate() + 1);
    const weekEnd = new Date(dayStart);
    weekEnd.setDate(dayStart.getDate() + 7);
    for (const a of assignments) {
      if (!a.due_at) continue;
      const due = new Date(a.due_at);
      const c = courses.find((x) => String(x.id) === String(a.course_id));
      const row = { ...a, due, courseCode: c?.course_code, color: c?.color };
      if (due < dayStart) buckets.overdue.push(row);
      else if (due < dayEnd) buckets.today.push(row);
      else if (due < tomorrowEnd) buckets.tomorrow.push(row);
      else if (due < weekEnd) buckets.week.push(row);
      else buckets.later.push(row);
    }
    Object.values(buckets).forEach((list) => list.sort((a, b) => a.due - b.due));
    return buckets;
  }, [assignments, courses, now]);

  const upcomingCount = useMemo(() => {
    const counts = new Map();
    for (const a of assignments) {
      if (!a.due_at || new Date(a.due_at) < now) continue;
      counts.set(String(a.course_id), (counts.get(String(a.course_id)) || 0) + 1);
    }
    return counts;
  }, [assignments, now]);

  const nextDeadline = useMemo(
    () =>
      deadlineBuckets.today[0] || deadlineBuckets.tomorrow[0] || deadlineBuckets.week[0] || null,
    [deadlineBuckets],
  );

  const fact = useMemo(() => {
    if (!loaded) return "";
    if (selection.kind === "deadlines") {
      const total =
        deadlineBuckets.overdue.length +
        deadlineBuckets.today.length +
        deadlineBuckets.tomorrow.length;
      if (nextDeadline) return `next due ${relativeDay(nextDeadline.due_at, now)}`;
      return "nothing dated ahead";
    }
    if (selection.kind === "inbox") return `${announcements.length} posts`;
    if (selection.kind === "grades") return `${courses.length} courses`;
    if (course) {
      const upcoming = upcomingCount.get(String(course.id)) || 0;
      return `${course.course_code} · ${upcoming} upcoming`;
    }
    return "";
  }, [
    loaded,
    selection.kind,
    deadlineBuckets,
    nextDeadline,
    announcements.length,
    courses.length,
    course,
    upcomingCount,
    now,
  ]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const openAssignment = (a) =>
    setDrawerItem({
      type: "canvas_resource",
      itemType: "assignment",
      id: a.id,
      course_id: a.course_id,
      title: a.title || a.name,
    });

  const renderBucket = (label, list, red) =>
    list.length > 0 && (
      <div key={label} className="ins-mods-bucket">
        <div className="ins-sec-head">
          <p className={`ins-label${red ? " is-red" : ""}`}>{label}</p>
          <span className="ins-cap ins-mono">{list.length}</span>
        </div>
        {list.map((a) => (
          <button key={a.id} type="button" className="ins-dlrow" onClick={() => openAssignment(a)}>
            <span
              className="ins-tick"
              style={{ "--tick-color": a.color || "var(--ins-ink-faint)", height: 18 }}
            />
            <span className="ins-dlrow-title">{a.title || a.name}</span>
            {a.courseCode && (
              <span className="ins-mono ins-cap ins-dlrow-code">{a.courseCode}</span>
            )}
            <span className={`ins-mono ins-cap ins-dlrow-due${red ? " is-red" : ""}`}>
              {relativeDay(a.due_at, now)}
            </span>
          </button>
        ))}
      </div>
    );

  const renderDeadlines = () => (
    <div className="ins-modspane">
      {renderBucket("Overdue", deadlineBuckets.overdue, true)}
      {renderBucket("Today", deadlineBuckets.today)}
      {renderBucket("Tomorrow", deadlineBuckets.tomorrow)}
      {renderBucket("This week", deadlineBuckets.week)}
      {renderBucket("Later", deadlineBuckets.later.slice(0, 12))}
      {assignments.filter((a) => a.due_at).length === 0 && (
        <div className="ins-empty">No dated assignments posted</div>
      )}
    </div>
  );

  const renderAnnouncements = (list) => (
    <div className="ins-inbox">
      {list.length === 0 && <div className="ins-empty">No announcements</div>}
      {list.map((item) => (
        <div key={item.id} className="ins-annrow">
          {item.course_code && (
            <span className="ins-mono ins-cap ins-annrow-course">{item.course_code}</span>
          )}
          <a
            className="ins-annrow-title"
            href={item.html_url || "#"}
            target="_blank"
            rel="noreferrer"
          >
            {item.title}
          </a>
          <span className="ins-cap ins-annrow-date">
            {relativeDay(item.posted_at || item.created_at, now)}
          </span>
        </div>
      ))}
    </div>
  );

  const renderGrades = () => (
    <div className="ins-modspane">
      {courses.map((c) => {
        const raw = gradeFor(c.id);
        const pct = parseGradePercent(raw);
        return (
          <button
            key={c.id}
            type="button"
            className="ins-graderow"
            onClick={() => select("course", c.id)}
          >
            <span
              className="ins-tick"
              style={{ "--tick-color": c.color || "var(--ins-ink-faint)", height: 22 }}
            />
            <span className="ins-mono ins-graderow-code">{c.course_code}</span>
            <span className="ins-graderow-name">{c.name}</span>
            <div className="ins-graderow-bar">
              <span style={{ width: `${pct ?? 0}%` }} />
            </div>
            <span className="ins-mono ins-graderow-grade">{raw ?? "—"}</span>
          </button>
        );
      })}
      {courses.length > 0 && grades.length === 0 && (
        <p className="ins-cap">Canvas has not posted grades for these courses yet.</p>
      )}
    </div>
  );

  const renderCourse = (c) => {
    const list = assignments
      .filter((a) => String(a.course_id) === String(c.id))
      .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));
    const courseAnnouncements = announcements.filter((a) => String(a.course_id) === String(c.id));
    return (
      <div className="ins-modspane">
        <header className="ins-coursehead">
          <div className="ins-coursehead-id">
            <span
              className="ins-tick"
              style={{ "--tick-color": c.color || "var(--ins-ink-faint)", height: 36 }}
            />
            <div>
              <h2 className="ins-title">{c.name}</h2>
              <p className="ins-cap ins-mono">
                {c.course_code}
                {gradeFor(c.id) != null ? ` · ${gradeFor(c.id)}` : ""}
              </p>
            </div>
          </div>
          <div className="ins-seg">
            {[
              ["assignments", "Assignments"],
              ["announcements", "Posts"],
              ["files", "Files"],
              ["about", "About"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={coursePane === id ? "is-active" : ""}
                onClick={() => setCoursePane(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {coursePane === "assignments" && (
          <div className="ins-mods-list">
            {list.length === 0 && <div className="ins-empty">No assignments posted</div>}
            {list.map((a) => {
              const due = a.due_at ? new Date(a.due_at) : null;
              const isPast = due && due < now;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`ins-asgrow ${isPast ? "is-past" : ""}`}
                  onClick={() => openAssignment(a)}
                >
                  <span className="ins-asgrow-title">{a.title || a.name}</span>
                  <span className={`ins-mono ins-cap${isPast ? " is-muted" : " is-due"}`}>
                    {due ? relativeDay(a.due_at, now) : "no due date"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {coursePane === "announcements" && renderAnnouncements(courseAnnouncements)}

        {coursePane === "files" && (
          <div className="ins-mods-files">
            <FileBrowser token={token} courseId={c.id} />
          </div>
        )}

        {coursePane === "about" && (
          <div className="ins-mods-overview">
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h3 className="ins-label">Assignments</h3>
              </div>
              <p className="ins-mono ins-cap">
                {list.length} total · {upcomingCount.get(String(c.id)) || 0} upcoming
              </p>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h3 className="ins-label">Grade</h3>
              </div>
              <p className="ins-mono ins-cap">
                {gradeFor(c.id) != null ? gradeFor(c.id) : "not posted"}
              </p>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h3 className="ins-label">In Canvas</h3>
              </div>
              <a
                className="ins-btn"
                href={`https://canvas.nus.edu.sg/courses/${c.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open course
              </a>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pane =
    selection.kind === "course" && course
      ? renderCourse(course)
      : selection.kind === "inbox"
        ? renderAnnouncements(announcements)
        : selection.kind === "grades"
          ? renderGrades()
          : renderDeadlines();

  return (
    <div className="ins-mods">
      <nav className="ins-mods-rail" aria-label="Modules">
        <button
          type="button"
          className={`ins-railrow ${selection.kind === "deadlines" ? "is-active" : ""}`}
          onClick={() => select("deadlines")}
        >
          <span className="ins-railrow-label">Deadlines</span>
          <span className="ins-mono ins-cap ins-railrow-count">
            {deadlineBuckets.overdue.length + deadlineBuckets.today.length}
          </span>
        </button>
        <button
          type="button"
          className={`ins-railrow ${selection.kind === "inbox" ? "is-active" : ""}`}
          onClick={() => select("inbox")}
        >
          <span className="ins-railrow-label">Inbox</span>
          <span className="ins-mono ins-cap ins-railrow-count">{announcements.length}</span>
        </button>
        <button
          type="button"
          className={`ins-railrow ${selection.kind === "grades" ? "is-active" : ""}`}
          onClick={() => select("grades")}
        >
          <span className="ins-railrow-label">Grades</span>
        </button>

        <div className="ins-nav-caption">Modules</div>
        {courses.map((c) => {
          const active = selection.kind === "course" && String(c.id) === String(selection.courseId);
          const upcoming = upcomingCount.get(String(c.id)) || 0;
          return (
            <button
              key={c.id}
              type="button"
              className={`ins-railrow ${active ? "is-active" : ""}`}
              onClick={() => select("course", c.id)}
            >
              <span
                className="ins-tick"
                style={{ "--tick-color": c.color || "var(--ins-ink-faint)", height: 30 }}
              />
              <span className="ins-railrow-main">
                <span className="ins-mono ins-railrow-code">{c.course_code}</span>
                <span className="ins-cap ins-railrow-name">{c.name}</span>
              </span>
              {upcoming > 0 && (
                <span className="ins-mono ins-cap ins-railrow-count">{upcoming}</span>
              )}
            </button>
          );
        })}
      </nav>

      {pane}

      {drawerItem && (
        <CanvasDrawer item={drawerItem} token={token} onClose={() => setDrawerItem(null)} />
      )}
    </div>
  );
}
