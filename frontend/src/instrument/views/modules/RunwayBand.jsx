// Runway band — the quiet next-due moment. A thin bar whose length is the
// time left on a one-week horizon and whose tone escalates as the date
// closes in. No large numerals; the caption states the absolute time.

import { humanizeLeft, relativeDay, runwayFor } from "./model";

export default function RunwayBand({ item, now, onClick }) {
  if (!item) return null;
  const runway = runwayFor(item.due_at, now);
  const left = humanizeLeft(runway.left);
  const caption = runway.tone === "overdue"
    ? `overdue · ${relativeDay(item.due_at, now)}`
    : `due ${relativeDay(item.due_at, now)}${left ? ` · ${left} left` : ""}`;

  return (
    <button type="button" className="ins-runway" onClick={onClick}>
      <span className="ins-runway-top">
        <span
          className="ins-tick"
          style={{ "--tick-color": item.color || "var(--ins-ink-faint)", height: 20 }}
        />
        {item.courseCode && <span className="ins-mono ins-cap ins-runway-code">{item.courseCode}</span>}
        <span className="ins-runway-title">{item.title || item.name}</span>
        <span className={`ins-mono ins-cap ins-runway-caption is-${runway.tone}`}>{caption}</span>
      </span>
      <span className="ins-runway-track" aria-hidden="true">
        <span
          className={`ins-runway-fill is-${runway.tone}`}
          style={{ width: `${Math.round(runway.fraction * 100)}%` }}
        />
      </span>
    </button>
  );
}
