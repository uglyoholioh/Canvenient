import { useEffect, useMemo, useState } from "react";
import { CalendarDays, List } from "lucide-react";
import { getSchedule } from "../../api";

function dayIndex(value) {
  const numeric = Number(value);
  return numeric >= 0 && numeric <= 6 ? numeric : numeric >= 1 && numeric <= 7 ? numeric % 7 : null;
}

export default function ScheduleModule({ token }) {
  const [schedule, setSchedule] = useState({ classes: [], exams: [], events: [] });
  const [mode, setMode] = useState("list");
  useEffect(() => { getSchedule(token).then((data) => setSchedule(data || { classes: [], exams: [], events: [] })).catch(() => {}); }, [token]);

  const upcoming = useMemo(() => {
    const today = new Date();
    const rows = [];
    schedule.classes?.filter((item) => dayIndex(item.day_of_week) === today.getDay()).forEach((item) => rows.push({ id: `class-${item.id}`, title: `${item.module_code} ${item.lesson_type}`, time: String(item.start_time).slice(0, 5), venue: item.venue }));
    schedule.events?.filter((item) => new Date(item.end_at || item.start_at) >= today).forEach((item) => rows.push({ id: `event-${item.id}`, title: item.title, date: new Date(item.start_at), venue: item.venue }));
    schedule.exams?.filter((item) => new Date(item.end_at || item.start_at) >= today).forEach((item) => rows.push({ id: `exam-${item.id}`, title: `${item.module_code} Exam`, date: new Date(item.start_at), venue: "Exam" }));
    return rows.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)).slice(0, 7);
  }, [schedule]);

  const today = new Date();
  const week = Array.from({ length: 7 }, (_, offset) => { const date = new Date(today); date.setDate(today.getDate() + offset); return date; });
  const hasOnDate = (date) => schedule.events?.some((item) => new Date(item.start_at).toDateString() === date.toDateString()) || schedule.exams?.some((item) => new Date(item.start_at).toDateString() === date.toDateString()) || schedule.classes?.some((item) => dayIndex(item.day_of_week) === date.getDay());

  return (
    <div className="schedule-module">
      <div className="module-view-toggle">
        <button type="button" className={mode === "list" ? "is-active" : ""} onClick={() => setMode("list")}><List size={12} />Today</button>
        <button type="button" className={mode === "week" ? "is-active" : ""} onClick={() => setMode("week")}><CalendarDays size={12} />Week</button>
      </div>
      {mode === "week" ? (
        <div className="mini-week">{week.map((date) => <div key={date.toISOString()} className={date.toDateString() === today.toDateString() ? "is-today" : ""}><span>{date.toLocaleDateString([], { weekday: "short" }).slice(0, 2)}</span><strong>{date.getDate()}</strong>{hasOnDate(date) && <i />}</div>)}</div>
      ) : upcoming.length === 0 ? <div className="module-empty">No classes or events coming up.</div> : (
        <div className="module-list">{upcoming.map((item) => <div className="module-list-item module-item-main" key={item.id}><span className="schedule-time">{item.time || item.date?.toLocaleDateString([], { month: "short", day: "numeric" })}</span><span className="module-item-copy"><strong>{item.title}</strong><small>{item.venue || "No venue"}</small></span></div>)}</div>
      )}
    </div>
  );
}
