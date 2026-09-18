// Home's drawing set — the day as a vertical timeline, the horizon in three
// voices, and the exam strip. Pure presentation over ledger data.

import { barCount, windowLabel } from "./ledger";

/* The day as a vertical timeline — time, code and venue stated plainly, a
   rule down the left with the now-dot living between rows, and the current
   gap as the one live caption. Clicking a row opens its detail inline. */
export function DayTimeline({ items, now, gap, tomorrow, nextId, journey, expandedId, onToggle }) {
  const rows = [];
  items.forEach((item, index) => {
    if (index === 0 && gap && gap.until <= item.start) {
      rows.push(
        <div key="gap-lead" className="ins-vtgap">
          <span className="ins-mono ins-vt-gaptime">{hm(gap.from)}</span>
          <span className="ins-vt-gapdot" aria-hidden="true" />
          <span className="ins-mono ins-cap ins-vt-gapcaption">{windowLabel(gap.minutesLeft)}</span>
        </div>,
      );
    }
    const state = now >= item.end ? " is-past" : now >= item.start ? " is-now" : "";
    const isNext = item.id === nextId;
    const open = expandedId ? expandedId === item.id : isNext;
    rows.push(
      <button
        key={item.id}
        type="button"
        className={`ins-vtrow${state}${open ? " is-open" : ""}`}
        style={{ "--tick-color": item.color }}
        onClick={() => onToggle(item.id)}
      >
        <span className="ins-mono ins-vt-time">
          {hm(item.start)}–{hm(item.end)}
        </span>
        <span className="ins-vt-dot" aria-hidden="true" />
        <span className="ins-vt-main">
          <span className="ins-vt-title">
            {item.title}
            {item.subtitle ? <span className="ins-cap">{` · ${item.subtitle}`}</span> : null}
            {item.classNo ? <span className="ins-cap">{` ${item.classNo}`}</span> : null}
          </span>
          {open && (
            <span className="ins-vt-detail">
              <span className="ins-cap">{item.venue}</span>
              {item.moduleName && <span className="ins-cap">{item.moduleName}</span>}
              {isNext && item.start > now && (
                <span className="ins-meter ins-vt-meter">
                  <span
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, (1 - (item.start - now) / (8 * 3600 * 1000)) * 100),
                      )}%`,
                    }}
                  />
                </span>
              )}
              {isNext && journey?.best && (
                <span className="ins-cap ins-mono ins-vt-journey">
                  {journey.best.service} from {journey.best.fromStopName} · arrives{" "}
                  {hm(journey.best.arrivesAt)} · {journey.best.walkFromStopMin} min walk
                  {journey.best.travelSource === "live" ? "" : " · est"}
                </span>
              )}
            </span>
          )}
        </span>
        <span className="ins-cap ins-vt-venue">{item.venue}</span>
      </button>,
    );
    if (gap && index < items.length - 1 && items[index + 1].start === gap.until) {
      rows.push(
        <div key="gap" className="ins-vtgap">
          <span className="ins-mono ins-vt-gaptime">{hm(gap.from)}</span>
          <span className="ins-vt-gapdot" aria-hidden="true" />
          <span className="ins-mono ins-cap ins-vt-gapcaption">{windowLabel(gap.minutesLeft)}</span>
        </div>,
      );
    }
  });

  return (
    <div className="ins-vt">
      {rows.length === 0 && (
        <div className="ins-vt-empty ins-cap">
          {tomorrow
            ? `next tomorrow ${hm(tomorrow.start)} · ${tomorrow.title}`
            : "nothing scheduled"}
        </div>
      )}
      {rows}
      {tomorrow && rows.length > 0 && (
        <div className="ins-vt-tomorrow ins-cap ins-mono">
          tomorrow {hm(tomorrow.start)} · {tomorrow.title}
        </div>
      )}
    </div>
  );
}

function hm(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/* The horizon in three voices. All read the same buckets; the expansion
   list is rendered by the view that owns the state. */
function horizonTip(col) {
  if (col.items.length === 0) return "Nothing due";
  const lines = col.items
    .slice(0, 3)
    .map((item) => `${item.courseCode ? `${item.courseCode} ` : ""}${item.title}`);
  if (col.items.length > 3) lines.push(`+${col.items.length - 3} more`);
  return lines.join("\n");
}

export function HorizonColumns({ buckets, phases, openDay, onToggle }) {
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
            })}\n${horizonTip(col)}`}
            onClick={() => col.items.length > 0 && onToggle(index)}
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

// Strip — the horizon as one weather ribbon: a slice per day, fill rising
// with the load. Calm days are air, heavy days are wall.
export function HorizonStrip({ buckets, phases, openDay, onToggle }) {
  const max = Math.max(
    1,
    ...buckets.columns.map((col) => col.items.length),
    buckets.overdue.length,
  );
  return (
    <div className="ins-horizonstrip">
      {buckets.overdue.length > 0 && (
        <button
          type="button"
          className={`ins-tip ins-hzslice is-cap${openDay === "overdue" ? " is-open" : ""}`}
          data-tip={`Overdue · ${buckets.overdue.length}`}
          style={{ "--fill": `${Math.max(18, (buckets.overdue.length / max) * 100)}%` }}
          onClick={() => onToggle("overdue")}
        >
          <i />
          <span className="ins-mono ins-hzcap">{buckets.overdue.length}</span>
        </button>
      )}
      {buckets.columns.map((col, index) => {
        const phase = phases[index];
        const phaseClass = ["recess", "reading", "exam"].includes(phase) ? ` is-${phase}` : "";
        const fill = Math.max(col.items.length > 0 ? 14 : 4, (col.items.length / max) * 100);
        return (
          <button
            key={index}
            type="button"
            className={`ins-tip ins-hzslice${phaseClass}${index === 0 ? " is-today" : ""}${
              openDay === index ? " is-open" : ""
            }`}
            data-tip={`${col.date.toLocaleDateString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}\n${horizonTip(col)}`}
            style={{ "--fill": `${fill}%` }}
            onClick={() => col.items.length > 0 && onToggle(index)}
          >
            {col.examCount > 0 && <i className="ins-fnexam" />}
            <i className="ins-hzfill" />
            <span className="ins-fnlabel">
              {index === 0 ? "today" : col.date.toLocaleDateString([], { weekday: "narrow" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// List — the horizon read as a quiet agenda.
export function HorizonList({ buckets, openDay, onToggle }) {
  const days = [
    ...(buckets.overdue.length > 0
      ? [{ key: "overdue", date: null, items: buckets.overdue, cap: true }]
      : []),
    ...buckets.columns
      .filter((col) => col.items.length > 0 || openDay === buckets.columns.indexOf(col))
      .map((col, index) => ({ key: index, date: col.date, items: col.items })),
  ];
  return (
    <div className="ins-horizonlist">
      {days.length === 0 && <p className="ins-cap">Nothing due in sight.</p>}
      {days.map((day) => {
        const isOpen = openDay === day.key;
        return (
          <button
            key={day.key}
            type="button"
            className={`ins-hzrow${day.cap ? " is-cap" : ""}${isOpen ? " is-open" : ""}`}
            onClick={() => day.items.length > 0 && onToggle(day.key)}
          >
            <span className="ins-mono ins-cap ins-hzrow-day">
              {day.cap
                ? "overdue"
                : day.date.toLocaleDateString([], {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
            </span>
            <span className="ins-hzrow-items">
              {day.items.length === 0 ? (
                <span className="ins-cap">nothing due</span>
              ) : (
                day.items.map((item) => (
                  <span key={item.id} className="ins-hzrow-item">
                    <span
                      className="ins-hzrow-course ins-mono ins-cap"
                      style={{ "--tick-color": item.color || "var(--ins-ink-faint)" }}
                    >
                      {item.courseCode || "·"}
                    </span>
                    {item.title}
                  </span>
                ))
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Exams — the timetable's exam rows, nearest first.
export function ExamsList({ exams, compact = false }) {
  if (!exams || exams.length === 0) return null;
  return (
    <div className={`ins-exams${compact ? " is-compact" : ""}`}>
      {exams.slice(0, compact ? 3 : 6).map((exam) => (
        <div key={exam.id} className="ins-examrow">
          <span className="ins-vt-title">{exam.moduleCode}</span>
          <span className="ins-mono ins-cap ins-examrow-when">
            {exam.start.toLocaleDateString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
            {" · "}
            {hm(exam.start)}
            {exam.end ? `–${hm(exam.end)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
