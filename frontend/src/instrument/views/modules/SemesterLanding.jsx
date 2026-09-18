// Semester landing — what's true across all modules, at a glance: the
// runway band (next due / most overdue), a glance row (due next, fresh
// posts, grades), and one quiet card per module.

import { courseNextDue, freshPostCount, parseGradePercent, relativeDay } from "./model";
import RunwayBand from "./RunwayBand";

function GlanceColumn({ label, children }) {
  return (
    <section className="ins-glance-col">
      <div className="ins-sec-head">
        <p className="ins-label">{label}</p>
      </div>
      {children}
    </section>
  );
}

export default function SemesterLanding({
  courses,
  assignments,
  announcements,
  buckets,
  grades,
  now,
  onOpenAssignment,
  onOpenCourse,
}) {
  const band = buckets.overdue[0] || buckets.today[0] || buckets.tomorrow[0] || buckets.week[0];
  const upcoming = [...buckets.today, ...buckets.tomorrow, ...buckets.week, ...buckets.later];
  // Skip the band's item from the glance list unless the band is an overdue one.
  const glanceNext = upcoming.slice(band && band === upcoming[0] ? 1 : 0, 5);
  const fresh = announcements.filter((a) => {
    const at = a.posted_at || a.created_at;
    return at ? now - new Date(at) <= 2 * 86400000 : false;
  });
  const glancePosts = (fresh.length > 0 ? fresh : announcements.slice(0, 3)).slice(0, 4);

  const gradeEntry = (courseId) =>
    (grades || []).find((g) => String(g.course_id ?? g.id) === String(courseId));
  const gradeText = (courseId) => {
    const entry = gradeEntry(courseId);
    return entry?.grade ?? entry?.current_grade ?? null;
  };

  return (
    <div className="ins-modspane ins-semester">
      <RunwayBand item={band} now={now} onClick={() => band && onOpenAssignment(band)} />
      {!band && assignments.filter((a) => a.due_at).length === 0 && (
        <div className="ins-empty">No dated assignments posted</div>
      )}

      <div className="ins-glance">
        <GlanceColumn label="Due next">
          {glanceNext.length === 0 && <p className="ins-cap ins-glance-empty">Nothing else dated</p>}
          {glanceNext.map((a) => (
            <button
              key={a.id}
              type="button"
              className="ins-glance-row"
              onClick={() => onOpenAssignment(a)}
            >
              <span
                className="ins-tick"
                style={{ "--tick-color": a.color || "var(--ins-ink-faint)", height: 16 }}
              />
              <span className="ins-glance-row-title">{a.title || a.name}</span>
              <span className="ins-mono ins-cap ins-glance-row-due">{relativeDay(a.due_at, now)}</span>
            </button>
          ))}
        </GlanceColumn>

        <GlanceColumn label={fresh.length > 0 ? `Fresh posts · ${fresh.length}` : "Latest posts"}>
          {glancePosts.length === 0 && <p className="ins-cap ins-glance-empty">No announcements</p>}
          {glancePosts.map((item) => (
            <a
              key={item.id}
              className="ins-glance-row"
              href={item.html_url || "#"}
              target="_blank"
              rel="noreferrer"
            >
              <span
                className="ins-tick"
                style={{
                  "--tick-color":
                    courses.find((c) => String(c.id) === String(item.course_id))?.color ||
                    "var(--ins-ink-faint)",
                  height: 16,
                }}
              />
              <span className="ins-glance-row-title">{item.title}</span>
              <span className="ins-mono ins-cap ins-glance-row-due">
                {relativeDay(item.posted_at || item.created_at, now)}
              </span>
            </a>
          ))}
        </GlanceColumn>

        <GlanceColumn label="Grades">
          {courses.map((c) => {
            const raw = gradeText(c.id);
            const pct = parseGradePercent(raw);
            return (
              <button
                key={c.id}
                type="button"
                className="ins-glance-row"
                onClick={() => onOpenCourse(c.id)}
              >
                <span
                  className="ins-tick"
                  style={{ "--tick-color": c.color || "var(--ins-ink-faint)", height: 16 }}
                />
                <span className="ins-mono ins-cap ins-glance-row-code">{c.course_code}</span>
                <span className="ins-glance-bar" aria-hidden="true">
                  <span style={{ width: `${pct ?? 0}%` }} />
                </span>
                <span className="ins-mono ins-cap ins-glance-row-grade">{raw ?? "—"}</span>
              </button>
            );
          })}
          {courses.length === 0 && <p className="ins-cap ins-glance-empty">No courses</p>}
        </GlanceColumn>
      </div>

      <div className="ins-sec-head ins-semester-modhead">
        <p className="ins-label">Modules</p>
        <span className="ins-cap ins-mono">{courses.length}</span>
      </div>
      <div className="ins-modcards">
        {courses.map((c) => {
          const next = courseNextDue(assignments, c.id, now);
          const posts = freshPostCount(
            announcements.filter((a) => String(a.course_id) === String(c.id)),
            now,
          );
          const raw = gradeText(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className="ins-modcard"
              onClick={() => onOpenCourse(c.id)}
            >
              <span className="ins-modcard-head">
                <span
                  className="ins-tick"
                  style={{ "--tick-color": c.color || "var(--ins-ink-faint)", height: 26 }}
                />
                <span className="ins-modcard-id">
                  <span className="ins-mono ins-modcard-code">{c.course_code}</span>
                  <span className="ins-cap ins-modcard-name">{c.name}</span>
                </span>
              </span>
              <span className="ins-modcard-facts">
                <span className="ins-mono ins-cap">
                  {next ? `next ${relativeDay(next.due_at, now)}` : "nothing dated"}
                </span>
                {posts > 0 && <span className="ins-mono ins-cap ins-modcard-posts">{posts} new</span>}
                {raw != null && <span className="ins-mono ins-cap">{raw}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
