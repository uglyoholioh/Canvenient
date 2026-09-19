// Modules — the semester, organised by what you do with it.
//
// The rail holds the cross-course smart views (Semester overview, Deadlines,
// Inbox, Grades); picking a module opens its workspace. Semester is the
// landing: runway band, glance row, one card per module. Data types drive
// the views — never the other way round.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAcademicModule,
  deleteAcademicModule,
  dismissCanvasAnnouncement,
  getAcademicModules,
  getCanvasAnnouncements,
  getCanvasAssignments,
  getCanvasCourses,
  getCanvasGrades,
} from "../../api";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import CanvasDrawer from "../../components/drawers/CanvasDrawer";
import {
  bucketDeadlines,
  freshPostCount,
  parseGradePercent,
  readSelection,
  relativeDay,
  upcomingCounts,
  writeSelection,
} from "./modules/model";
import SemesterLanding from "./modules/SemesterLanding";
import InboxList from "./modules/InboxList";
import RunwayBand from "./modules/RunwayBand";
import CourseWorkspace from "./modules/CourseWorkspace";
import "./modules.css";

export default function ModulesView({ token }) {
  const [manualModules, setManualModules] = useState([]);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState(readSelection);
  const [drawerItem, setDrawerItem] = useState(null);
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
      getAcademicModules(token),
    ]).then(([coursesRes, assignmentsRes, announcementsRes, modulesRes]) => {
      if (!alive) return;
      setCourses(coursesRes.status === "fulfilled" ? coursesRes.value || [] : []);
      setAssignments(assignmentsRes.status === "fulfilled" ? assignmentsRes.value || [] : []);
      setAnnouncements(announcementsRes.status === "fulfilled" ? announcementsRes.value || [] : []);
      setManualModules(
        (modulesRes.status === "fulfilled" ? modulesRes.value || [] : []).filter(
          (m) => m.source_type === "manual",
        ),
      );
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  // Modules that are not on Canvas join the semester as first-class cards —
  // they carry tasks and dates, just no Canvas sync.
  const displayCourses = useMemo(() => {
    const canvasCodes = new Set(courses.map((c) => (c.course_code || "").toUpperCase()));
    const manual = manualModules
      .filter((m) => !canvasCodes.has((m.module_code || "").toUpperCase()))
      .map((m) => ({
        id: `manual-${m.id}`,
        academicId: m.id,
        course_code: m.module_code,
        name: m.name,
        color: m.color,
        isManual: true,
      }));
    return [...courses, ...manual];
  }, [courses, manualModules]);

  const addModule = useCallback(
    async (moduleCode, name) => {
      const created = await createAcademicModule(token, moduleCode, name);
      setManualModules((prev) => [...prev, created]);
    },
    [token],
  );

  const removeModule = useCallback(
    async (academicId) => {
      await deleteAcademicModule(token, academicId);
      setManualModules((prev) => prev.filter((m) => m.id !== academicId));
    },
    [token],
  );

  const select = useCallback((kind, courseId = null) => {
    const next = { kind, courseId };
    setSelection(next);
    writeSelection(next);
    // the shell's sidebar reflects the current selection on its course items
    window.dispatchEvent(new CustomEvent("canvenient-modules-sel", { detail: next }));
  }, []);

  // The shell's Modules dropdown can drive the view from outside.
  useEffect(() => {
    const onExternalSelect = (event) => {
      const detail = event.detail;
      if (detail && ["semester", "deadlines", "inbox", "grades", "course"].includes(detail.kind)) {
        setSelection(detail);
      }
    };
    window.addEventListener("canvenient-modules-select", onExternalSelect);
    return () => window.removeEventListener("canvenient-modules-select", onExternalSelect);
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

  // Grades feed the Grades view and the Semester glance — one small call per
  // course, served from the backend cache.
  const needsGrades = selection.kind === "grades" || selection.kind === "semester";
  const gradeCourseIds = useMemo(
    () => (needsGrades ? courses.map((c) => c.id) : []),
    [needsGrades, courses],
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

  const deadlineBuckets = useMemo(
    () => bucketDeadlines(assignments, courses, now),
    [assignments, courses, now],
  );

  const upcomingCount = useMemo(() => upcomingCounts(assignments, now), [assignments, now]);

  const nextDeadline = useMemo(
    () =>
      deadlineBuckets.today[0] || deadlineBuckets.tomorrow[0] || deadlineBuckets.week[0] || null,
    [deadlineBuckets],
  );

  const freshCount = useMemo(() => freshPostCount(announcements, now), [announcements, now]);

  const fact = useMemo(() => {
    if (!loaded) return "";
    const overdue = deadlineBuckets.overdue.length;
    if (selection.kind === "semester" || selection.kind === "deadlines") {
      const bits = [];
      if (overdue > 0) bits.push(`${overdue} overdue`);
      if (nextDeadline) bits.push(`next due ${relativeDay(nextDeadline.due_at, now)}`);
      return bits.length > 0 ? bits.join(" · ") : "nothing dated ahead";
    }
    if (selection.kind === "inbox")
      return freshCount > 0
        ? `${announcements.length} posts · ${freshCount} new`
        : `${announcements.length} posts`;
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
    freshCount,
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
      <RunwayBand
        item={
          deadlineBuckets.overdue[0] ||
          deadlineBuckets.today[0] ||
          deadlineBuckets.tomorrow[0] ||
          null
        }
        now={now}
        onClick={(a) => openAssignment(a)}
      />
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

  const pane =
    selection.kind === "course" && course ? (
      <CourseWorkspace
        key={course.id}
        course={course}
        token={token}
        assignments={assignments}
        announcements={announcements}
        grade={gradeFor(course.id)}
        now={now}
        onOpenAssignment={openAssignment}
        onDismiss={dismiss}
      />
    ) : selection.kind === "inbox" ? (
      <InboxList items={announcements} courses={courses} now={now} onDismiss={dismiss} />
    ) : selection.kind === "grades" ? (
      renderGrades()
    ) : selection.kind === "deadlines" ? (
      renderDeadlines()
    ) : (
      <SemesterLanding
        courses={displayCourses}
        assignments={assignments}
        announcements={announcements}
        buckets={deadlineBuckets}
        grades={grades}
        now={now}
        onOpenAssignment={openAssignment}
        onOpenCourse={(id) => select("course", id)}
        onAddModule={addModule}
        onDeleteModule={removeModule}
      />
    );

  return (
    <div className="ins-mods">
      <nav className="ins-mods-rail" aria-label="Modules">
        {[
          ["semester", "Semester"],
          ["deadlines", "Deadlines"],
          ["inbox", "Inbox"],
          ["grades", "Grades"],
        ].map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className={`ins-railrow ${selection.kind === kind ? "is-active" : ""}`}
            onClick={() => select(kind)}
          >
            <span className="ins-railrow-label">{label}</span>
            {kind === "deadlines" && (
              <span className="ins-mono ins-cap ins-railrow-count">
                {deadlineBuckets.overdue.length + deadlineBuckets.today.length}
              </span>
            )}
            {kind === "inbox" && (
              <span className="ins-mono ins-cap ins-railrow-count">
                {freshCount > 0 ? freshCount : ""}
              </span>
            )}
          </button>
        ))}
      </nav>

      {pane}

      {drawerItem && (
        <CanvasDrawer item={drawerItem} token={token} onClose={() => setDrawerItem(null)} />
      )}
    </div>
  );
}
