// CourseWorkspace — one module, complete: Canvas's own course sections
// (home page, module units, pages, syllabus) beside the ones Canvenient
// adds (assignments triage, posts inbox, files, grades). Sections load
// lazily on first visit; pages and the front page render as quiet readers.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCanvasCourseModules,
  getCanvasFrontPage,
  getCanvasPage,
  getCanvasPages,
  getCanvasSyllabus,
} from "../../../api";
import { FileBrowser } from "../../../components/canvas/FileBrowser";
import {
  courseNextDue,
  freshPostCount,
  parseGradePercent,
  relativeDay,
} from "./model";
import CanvasHtml from "./CanvasHtml";
import InboxList from "./InboxList";

const SECTIONS = [
  ["home", "Home"],
  ["modules", "Modules"],
  ["assignments", "Assignments"],
  ["pages", "Pages"],
  ["posts", "Posts"],
  ["files", "Files"],
  ["grades", "Grades"],
  ["syllabus", "Syllabus"],
];

function useLazyResource(enabled, loader) {
  const [state, setState] = useState({ data: null, failed: false });
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (!enabled || attemptedRef.current) return undefined;
    attemptedRef.current = true;
    let alive = true;
    loader()
      .then((data) => {
        if (alive) setState({ data, failed: false });
      })
      .catch(() => {
        if (alive) {
          // allow a retry next time the section opens
          attemptedRef.current = false;
          setState({ data: null, failed: true });
        }
      });
    return () => {
      alive = false;
    };
  }, [enabled, loader]);
  return { ...state, loading: enabled && !state.data && !state.failed };
}

function LoadingLine() {
  return <div className="ins-empty ins-loading">···</div>;
}

function FailedLine() {
  return <div className="ins-empty">Canvas would not load this section — try again later.</div>;
}

function PageReader({ token, course, reader, onBack }) {
  const [state, setState] = useState({ page: null, failed: false });
  useEffect(() => {
    let alive = true;
    getCanvasPage(token, course.id, reader.url)
      .then((data) => {
        if (alive) setState({ page: data, failed: false });
      })
      .catch(() => {
        if (alive) setState({ page: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [token, course.id, reader.url]);
  const { page, failed } = state;
  const loading = !page && !failed;

  return (
    <div className="ins-pagereader">
      <div className="ins-pagereader-top">
        <button type="button" className="ins-btn ins-btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <a
          className="ins-mono ins-cap ins-openlink"
          href={`https://canvas.nus.edu.sg/courses/${course.id}/pages/${reader.url}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Canvas
        </a>
      </div>
      <h3 className="ins-pagereader-title">{reader.title}</h3>
      {loading && <LoadingLine />}
      {failed && <FailedLine />}
      {page && <CanvasHtml html={page.body} />}
    </div>
  );
}

export default function CourseWorkspace({
  course,
  token,
  assignments,
  announcements,
  grade,
  now,
  onOpenAssignment,
  onDismiss,
}) {
  const [section, setSection] = useState("home");
  const [reader, setReader] = useState(null);

  const courseAssignments = assignments
    .filter((a) => String(a.course_id) === String(course.id))
    .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));
  const courseAnnouncements = announcements.filter(
    (a) => String(a.course_id) === String(course.id),
  );
  const next = courseNextDue(assignments, course.id, now);
  const fresh = freshPostCount(courseAnnouncements, now);

  const home = useLazyResource(
    section === "home" && !reader,
    useCallback(() => getCanvasFrontPage(token, course.id), [token, course.id]),
  );
  const modules = useLazyResource(
    section === "modules" && !reader,
    useCallback(() => getCanvasCourseModules(token, course.id), [token, course.id]),
  );
  const pages = useLazyResource(
    section === "pages" && !reader,
    useCallback(() => getCanvasPages(token, course.id), [token, course.id]),
  );
  const syllabus = useLazyResource(
    section === "syllabus" && !reader,
    useCallback(() => getCanvasSyllabus(token, course.id), [token, course.id]),
  );

  const openModuleItem = (item) => {
    if (item.type === "Assignment" && item.content_id) {
      onOpenAssignment({
        id: item.content_id,
        course_id: course.id,
        title: item.title,
      });
      return;
    }
    if (item.type === "Page" && item.page_url) {
      setReader({ url: item.page_url, title: item.title });
      return;
    }
    const href =
      item.external_url ||
      item.html_url ||
      `https://canvas.nus.edu.sg/courses/${course.id}/modules/items/${item.id}`;
    window.open(href, "_blank", "noreferrer");
  };

  const renderModules = () => {
    if (modules.loading) return <LoadingLine />;
    if (modules.failed) return <FailedLine />;
    if (!modules.data?.length) return <div className="ins-empty">No module units posted</div>;
    return (
      <div className="ins-modtree">
        {modules.data.map((mod) => (
          <section key={mod.id} className="ins-modtree-unit">
            <div className="ins-sec-head">
              <p className="ins-label">{mod.name}</p>
              {mod.state && <span className="ins-cap ins-mono">{mod.state}</span>}
            </div>
            {mod.items.length === 0 && <p className="ins-cap ins-glance-empty">Empty unit</p>}
            {mod.items.map((item) =>
              item.type === "SubHeader" ? (
                <p key={item.id} className="ins-modtree-subhead">
                  {item.title}
                </p>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className="ins-modtree-row"
                  style={{ paddingLeft: `${8 + (item.indent || 0) * 18}px` }}
                  onClick={() => openModuleItem(item)}
                >
                  <span className="ins-modtree-title">{item.title}</span>
                  <span className="ins-mono ins-cap ins-modtree-type">
                    {(item.type || "item").toLowerCase()}
                  </span>
                  {item.completion_requirement?.completed && (
                    <span className="ins-mono ins-cap ins-modtree-done" title="Completed">
                      ✓
                    </span>
                  )}
                </button>
              ),
            )}
          </section>
        ))}
      </div>
    );
  };

  const renderHome = () => {
    if (home.loading) return <LoadingLine />;
    if (home.failed) return <FailedLine />;
    if (home.data?.missing || !home.data?.body)
      return (
        <div className="ins-empty">
          No front page for this course — try Modules or Syllabus.
        </div>
      );
    return <CanvasHtml html={home.data.body} />;
  };

  const renderPages = () => {
    if (reader) return null;
    if (pages.loading) return <LoadingLine />;
    if (pages.failed) return <FailedLine />;
    if (!pages.data?.length) return <div className="ins-empty">No pages posted</div>;
    return (
      <div className="ins-mods-list">
        {pages.data.map((page) => (
          <button
            key={page.url}
            type="button"
            className="ins-asgrow"
            onClick={() => setReader({ url: page.url, title: page.title })}
          >
            <span className="ins-asgrow-title">{page.title}</span>
            <span className="ins-mono ins-cap is-muted">
              {page.updated_at ? relativeDay(page.updated_at, now) : ""}
            </span>
          </button>
        ))}
      </div>
    );
  };

  const renderGrades = () => {
    const pct = parseGradePercent(grade);
    return (
      <div className="ins-coursegrades">
        <p className="ins-mono ins-coursegrades-score">{grade ?? "not posted"}</p>
        <div className="ins-graderow-bar">
          <span style={{ width: `${pct ?? 0}%` }} />
        </div>
        <a
          className="ins-mono ins-cap ins-openlink"
          href={`https://canvas.nus.edu.sg/courses/${course.id}/gradebook`}
          target="_blank"
          rel="noreferrer"
        >
          Open gradebook in Canvas
        </a>
      </div>
    );
  };

  const renderSyllabus = () => {
    if (syllabus.loading) return <LoadingLine />;
    if (syllabus.failed) return <FailedLine />;
    if (!syllabus.data?.body) return <div className="ins-empty">No syllabus content</div>;
    return <CanvasHtml html={syllabus.data.body} />;
  };

  const renderSection = () => {
    if (reader) {
      return (
        <PageReader
          course={course}
          token={token}
          reader={reader}
          onBack={() => setReader(null)}
        />
      );
    }
    switch (section) {
      case "modules":
        return renderModules();
      case "assignments":
        return (
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
                  onClick={() => onOpenAssignment(a)}
                >
                  <span className="ins-asgrow-title">{a.title || a.name}</span>
                  <span className={`ins-mono ins-cap${isPast ? " is-muted" : " is-due"}`}>
                    {due ? relativeDay(a.due_at, now) : "no due date"}
                  </span>
                </button>
              );
            })}
          </div>
        );
      case "pages":
        return renderPages();
      case "posts":
        return (
          <InboxList
            items={courseAnnouncements}
            courses={[course]}
            now={now}
            onDismiss={onDismiss}
          />
        );
      case "files":
        return (
          <div className="ins-mods-files">
            <FileBrowser token={token} courseId={course.id} />
          </div>
        );
      case "grades":
        return renderGrades();
      case "syllabus":
        return renderSyllabus();
      default:
        return renderHome();
    }
  };

  return (
    <div className="ins-modspane ins-workspace">
      <header className="ins-coursehead">
        <div className="ins-coursehead-id">
          <span
            className="ins-tick"
            style={{ "--tick-color": course.color || "var(--ins-ink-faint)", height: 36 }}
          />
          <div>
            <h2 className="ins-title">{course.name}</h2>
            <p className="ins-cap ins-mono">{course.course_code}</p>
          </div>
        </div>
        <div className="ins-coursefacts">
          <span className="ins-mono ins-cap">
            {next ? `next due ${relativeDay(next.due_at, now)}` : "nothing dated"}
          </span>
          {grade != null && <span className="ins-mono ins-cap">{grade}</span>}
          {fresh > 0 && <span className="ins-mono ins-cap is-fact">{fresh} new</span>}
          <a
            className="ins-mono ins-cap ins-openlink"
            href={`https://canvas.nus.edu.sg/courses/${course.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Canvas
          </a>
        </div>
      </header>

      <nav className="ins-seg ins-workspace-nav" aria-label="Course sections">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id && !reader ? "is-active" : ""}
            onClick={() => {
              setReader(null);
              setSection(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="ins-workspace-body">{renderSection()}</div>
    </div>
  );
}
