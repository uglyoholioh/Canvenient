// Inbox — announcements grouped by recency so uniform rows stop competing.
// New (48h) reads stronger; each row carries its course tick; hover reveals
// the dismiss affordance.

import { groupAnnouncements, relativeDay } from "./model";

export default function InboxList({ items, courses, now, onDismiss }) {
  if (!items || items.length === 0) {
    return <div className="ins-empty">No announcements</div>;
  }
  const colorFor = (item) =>
    courses.find((c) => String(c.id) === String(item.course_id))?.color || "var(--ins-ink-faint)";

  return (
    <div className="ins-inbox">
      {groupAnnouncements(items, now).map((group) => (
        <div key={group.key} className={`ins-inbox-group ins-group-${group.key}`}>
          <div className="ins-sec-head">
            <p className={`ins-label${group.key === "new" ? " is-accent" : ""}`}>{group.label}</p>
            <span className="ins-cap ins-mono">{group.items.length}</span>
          </div>
          {group.items.map((item) => (
            <div key={item.id} className="ins-annrow">
              <span className="ins-tick" style={{ "--tick-color": colorFor(item), height: 18 }} />
              <span className="ins-annrow-main">
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
              </span>
              <span className="ins-cap ins-annrow-date">
                {relativeDay(item.posted_at || item.created_at, now)}
              </span>
              {onDismiss && (
                <button
                  type="button"
                  className="ins-annrow-dismiss"
                  aria-label={`Dismiss "${item.title}"`}
                  onClick={() => onDismiss(item)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
