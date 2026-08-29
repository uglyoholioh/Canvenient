import { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardList } from "lucide-react";
import { getCanvasAnnouncements, getCanvasAssignments } from "../../api";

export default function CanvasModule({ token, enabled, onOpenItem }) {
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    Promise.all([getCanvasAssignments(token), getCanvasAnnouncements(token)])
      .then(([assignmentData, announcementData]) => { setAssignments(assignmentData || []); setAnnouncements(announcementData || []); })
      .finally(() => setLoading(false));
  }, [enabled, token]);

  const upcoming = useMemo(() => assignments.filter((item) => !item.has_submitted && (!item.due_at || new Date(item.due_at) >= new Date())).slice(0, 5), [assignments]);
  const recent = announcements.slice(0, 3);

  if (!enabled) return <div className="module-empty">Add your Canvas token in Settings to see assignments and announcements.</div>;
  if (loading) return <div className="module-empty">Loading Canvas...</div>;
  return (
    <div className="canvas-module-summary">
      <div className="canvas-summary-section">
        <div className="module-subheading"><ClipboardList size={13} />Upcoming</div>
        {upcoming.length === 0 ? <div className="module-empty compact">No upcoming assignments.</div> : upcoming.map((item) => (
          <button type="button" className="module-list-item module-item-main" key={`assignment-${item.course_id}-${item.id}`} onClick={() => onOpenItem({ ...item, itemType: "assignment" })}>
            <span className="module-item-copy"><strong>{item.title}</strong><small>{item.course_code}{item.due_at ? ` · ${new Date(item.due_at).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}</small></span>
          </button>
        ))}
      </div>
      <div className="canvas-summary-section">
        <div className="module-subheading"><Bell size={13} />Announcements</div>
        {recent.length === 0 ? <div className="module-empty compact">No recent announcements.</div> : recent.map((item) => (
          <button type="button" className="module-list-item module-item-main" key={`announcement-${item.id}`} onClick={() => onOpenItem({ ...item, itemType: "announcement" })}>
            <span className="module-item-copy"><strong>{item.title}</strong><small>{item.course_code || item.author}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}
