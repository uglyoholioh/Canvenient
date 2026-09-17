// Modules — the semester as three quiet columns: the module rail, the
// selected module's record, and the announcement inbox. j/k move, d dismisses,
// ↵ opens — all available, none demanded.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dismissCanvasAnnouncement,
  getCanvasAnnouncements,
  getCanvasAssignments,
  getCanvasCourses,
  getCanvasFiles,
  getCanvasGrades,
} from "../../api";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import CanvasDrawer from "../../components/drawers/CanvasDrawer";
import { FileBrowser } from "../../components/canvas/FileBrowser";
import "./modules.css";

const COURSE_KEY = "canvenient.instrument.course";

function relativeDay(iso, now) {
  if (!iso) return "";
  const date = new Date(iso);
  const days = Math.round((new Date(date) - now) / 86400000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days === -1) return `yesterday`;
  if (days < 0) return `${-days} days ago`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function ModulesView({ token }) {
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [grades, setGrades] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(
    () => localStorage.getItem(COURSE_KEY) || null,
  );
  const [pane, setPane] = useState("assignments");
  const [drawerItem, setDrawerItem] = useState(null);
  const [inboxIndex, setInboxIndex] = useState(0);
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
      const courseList = coursesRes.status === "fulfilled" ? coursesRes.value || [] : [];
      setCourses(courseList);
      setAssignments(assignmentsRes.status === "fulfilled" ? assignmentsRes.value || [] : []);
      setAnnouncements(announcementsRes.status === "fulfilled" ? announcementsRes.value || [] : []);
      setLoaded(true);
      setSelectedCourseId((current) => {
        if (current && courseList.some((c) => String(c.id) === String(current))) return current;
        localStorage.setItem(COURSE_KEY, String(courseList[0]?.id ?? ""));
        return courseList[0]?.id ? String(courseList[0].id) : null;
      });
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const course = useMemo(
    () => courses.find((c) => String(c.id) === String(selectedCourseId)) || null,
    [courses, selectedCourseId],
  );

  const courseAssignments = useMemo(
    () =>
      assignments
        .filter((a) => String(a.course_id) === String(selectedCourseId))
        .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0)),
    [assignments, selectedCourseId],
  );

  // Grades load when a course is selected (small endpoint, per-course).
  useEffect(() => {
    if (!course) return undefined;
    let alive = true;
    getCanvasGrades(token, course.id)
      .then((data) => {
        if (alive) setGrades(data || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, course]);

  const selectCourse = useCallback((id) => {
    setSelectedCourseId(String(id));
    localStorage.setItem(COURSE_KEY, String(id));
    setInboxIndex(0);
  }, []);

  const upcoming = useMemo(
    () => courseAssignments.filter((a) => a.due_at && new Date(a.due_at) >= now),
    [courseAssignments, now],
  );

  const inbox = useMemo(() => announcements.slice(0, 30), [announcements]);

  // Inbox keyboard: j/k move, d dismisses, ↵ opens — only when this view is
  // mounted and no field has focus.
  useEffect(() => {
    const handler = (e) => {
      if (e.target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "j") setInboxIndex((i) => Math.min(i + 1, inbox.length - 1));
      else if (e.key === "k") setInboxIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "d") {
        const item = inbox[inboxIndex];
        if (!item) return;
        setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
        setInboxIndex((i) => Math.max(0, Math.min(i, inbox.length - 2)));
        dismissCanvasAnnouncement(token, item.id).catch(() => {});
      } else if (e.key === "Enter") {
        const item = inbox[inboxIndex];
        if (item?.html_url) window.open(item.html_url, "_blank", "noreferrer");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inbox, inboxIndex, token]);

  const fact = useMemo(() => {
    if (!loaded) return "";
    const bits = [`${courses.length} modules`];
    if (announcements.length) bits.push(`${announcements.length} new posts`);
    if (upcoming.length) bits.push(`next due ${relativeDay(upcoming[0].due_at, now)}`);
    return bits.join(" · ");
  }, [loaded, courses.length, announcements.length, upcoming, now]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const courseGrade = useMemo(() => {
    const entry = grades.find(
      (g) => String(g.course_id ?? g.id) === String(selectedCourseId) && g.grade != null,
    );
    return entry?.grade ?? entry?.current_grade ?? null;
  }, [grades, selectedCourseId]);

  if (loaded && courses.length === 0) {
    return (
      <div className="ins-empty" style={{ minHeight: "40vh" }}>
        <span>Modules appear here once Canvas is connected</span>
        <span>
          Connect in{" "}
          <button
            type="button"
            className="ins-btn is-ghost"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("canvenient-open-settings", { detail: { pane: "connections" } }),
              )
            }
          >
            Settings
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="ins-mods">
      <nav className="ins-mods-rail" aria-label="Modules">
        {courses.map((c) => {
          const active = String(c.id) === String(selectedCourseId);
          const count = assignments.filter(
            (a) => String(a.course_id) === String(c.id) && a.due_at && new Date(a.due_at) >= now,
          ).length;
          return (
            <button
              key={c.id}
              type="button"
              className={`ins-modrow ${active ? "is-active" : ""}`}
              onClick={() => selectCourse(c.id)}
            >
              <span
                className="ins-tick"
                style={{ "--tick-color": c.color || "var(--ins-ink-faint)", height: "100%" }}
              />
              <span className="ins-modrow-main">
                <span className="ins-mono ins-modrow-code">{c.course_code}</span>
                <span className="ins-cap ins-modrow-name">{c.name}</span>
              </span>
              {count > 0 && <span className="ins-mono ins-cap ins-modrow-count">{count}</span>}
            </button>
          );
        })}
      </nav>

      <section className="ins-mods-pane">
        {course ? (
          <>
            <header className="ins-mods-coursehead">
              <div>
                <h2 className="ins-title">{course.name}</h2>
                <p className="ins-cap ins-mono">
                  {course.course_code}
                  {courseGrade != null ? ` · ${courseGrade}` : ""}
                </p>
              </div>
              <div className="ins-seg">
                {[
                  ["assignments", "Assignments"],
                  ["files", "Files"],
                  ["overview", "Overview"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={pane === id ? "is-active" : ""}
                    onClick={() => setPane(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>

            {pane === "assignments" && (
              <div className="ins-mods-list">
                {courseAssignments.length === 0 && (
                  <div className="ins-empty">No assignments posted</div>
                )}
                {courseAssignments.map((a) => {
                  const due = a.due_at ? new Date(a.due_at) : null;
                  const isPast = due && due < now;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`ins-asgrow ${isPast ? "is-past" : ""}`}
                      onClick={() =>
                        setDrawerItem({
                          type: "canvas_resource",
                          itemType: "assignment",
                          id: a.id,
                          course_id: a.course_id,
                          title: a.title || a.name,
                        })
                      }
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

            {pane === "files" && (
              <div className="ins-mods-files">
                <FileBrowser token={token} courseId={course.id} />
              </div>
            )}

            {pane === "overview" && (
              <div className="ins-mods-overview">
                <div className="ins-sec">
                  <div className="ins-sec-head">
                    <h3 className="ins-sub">Assignments</h3>
                  </div>
                  <p className="ins-mono ins-cap">
                    {courseAssignments.length} total · {upcoming.length} upcoming
                  </p>
                </div>
                <div className="ins-sec">
                  <div className="ins-sec-head">
                    <h3 className="ins-sub">Grade</h3>
                  </div>
                  <p className="ins-mono ins-cap">
                    {courseGrade != null ? courseGrade : "not posted"}
                  </p>
                </div>
                <div className="ins-sec">
                  <div className="ins-sec-head">
                    <h3 className="ins-sub">In Canvas</h3>
                  </div>
                  <a
                    className="ins-btn"
                    href={`https://canvas.nus.edu.sg/courses/${course.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open course
                  </a>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="ins-empty">Select a module</div>
        )}
      </section>

      <aside className="ins-mods-inbox" aria-label="Announcements">
        <div className="ins-sec-head">
          <h2>Announcements</h2>
          <span className="ins-cap ins-mono">{inbox.length} · j/k/d</span>
        </div>
        {inbox.length === 0 && <div className="ins-empty">No announcements</div>}
        {inbox.map((item, index) => (
          <div
            key={item.id}
            className={`ins-annrow ${index === inboxIndex ? "is-hot" : ""}`}
            onMouseEnter={() => setInboxIndex(index)}
          >
            <span className="ins-mono ins-cap ins-annrow-course">{item.course_code}</span>
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
      </aside>

      {drawerItem && (
        <CanvasDrawer item={drawerItem} token={token} onClose={() => setDrawerItem(null)} />
      )}
    </div>
  );
}
