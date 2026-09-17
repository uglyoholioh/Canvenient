// AiBriefCard — "My Day" on the dashboard. One quiet lead line from the
// model (when it's reachable), then the day's facts set in type: what needs
// eyes, what's on, what's due, what was posted. The facts survive even when
// the model doesn't.

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getAssistantBrief } from "../api";
import { AssistantContext } from "../components/AssistantContext";

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDue(value) {
  const date = new Date(value);
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - dayStart) / 86400000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function AiBriefCard({ token }) {
  const [brief, setBrief] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (force = false) => {
      try {
        setError("");
        const data = await getAssistantBrief(token, force);
        setBrief(data || null);
      } catch (err) {
        setError(err.message || "Brief unavailable.");
      }
    },
    [token],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true).catch(() => {});
    setRefreshing(false);
  }, [load]);

  const sections = useMemo(
    () => [
      { key: "attention", items: brief?.attention || [] },
      { key: "classes", items: brief?.classes || [] },
      { key: "tasks", items: (brief?.tasks || []).filter((t) => t.due_at) },
      { key: "posts", items: brief?.new_announcements || [] },
    ],
    [brief],
  );
  const hasFacts = sections.some((section) => section.items.length > 0);

  return (
    <div className="ins-brief">
      <header className="ins-brief-head">
        <span className="ins-label">My Day</span>
        <span className={`ins-brief-source ${brief?.ai_ok ? "is-ai" : ""}`}>
          {brief?.ai_ok ? "AI" : brief ? "facts" : "reading…"}
        </span>
        <button
          type="button"
          className="ins-iconbtn ins-brief-refresh"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh brief"
          title="Refresh"
        >
          <RefreshCw size={13} className={refreshing ? "is-spinning" : ""} />
        </button>
      </header>

      {brief?.ai_ok && brief?.summary && <p className="ins-brief-lead">{brief.summary}</p>}
      {!brief && !error && <p className="ins-cap">Reading the day…</p>}
      {error && <p className="ins-cap">{error}</p>}
      {brief && !brief.ai_ok && (
        <p className="ins-cap">The model is unreachable — the facts are below.</p>
      )}

      {brief?.attention?.length > 0 && (
        <div className="ins-brief-sec">
          {brief.attention.slice(0, 3).map((item, index) => (
            <div key={index} className="ins-brief-row">
              <span className="ins-brief-dot" />
              <span>{item.text || item}</span>
            </div>
          ))}
        </div>
      )}

      {brief?.classes?.length > 0 && (
        <div className="ins-brief-sec">
          <p className="ins-label ins-brief-sec-label">On today</p>
          {brief.classes.map((c, index) => (
            <div key={index} className="ins-brief-row">
              <span className="ins-mono ins-brief-time">{formatTime(c.start)}</span>
              <span className="ins-brief-main">
                {c.code} {c.type}
              </span>
              {c.venue && <span className="ins-cap ins-brief-sub">{c.venue}</span>}
            </div>
          ))}
        </div>
      )}

      {brief?.tasks?.filter((t) => t.due_at).length > 0 && (
        <div className="ins-brief-sec">
          <p className="ins-label ins-brief-sec-label">Due</p>
          {brief.tasks
            .filter((t) => t.due_at)
            .slice(0, 4)
            .map((t) => (
              <div key={t.id} className="ins-brief-row">
                <span className={`ins-mono ins-brief-time${t.overdue ? " is-red" : ""}`}>
                  {t.overdue ? "overdue" : formatDue(t.due_at)}
                </span>
                <span className="ins-brief-main">{t.title}</span>
              </div>
            ))}
        </div>
      )}

      {brief?.new_announcements?.length > 0 && (
        <div className="ins-brief-sec">
          <p className="ins-label ins-brief-sec-label">New posts</p>
          {brief.new_announcements.slice(0, 3).map((a) => (
            <div key={a.id} className="ins-brief-row">
              <span className="ins-mono ins-brief-time">{a.course}</span>
              <span className="ins-brief-main">{a.title}</span>
            </div>
          ))}
        </div>
      )}

      {brief && !hasFacts && !brief.classes?.length && (
        <p className="ins-cap">Nothing on the schedule today.</p>
      )}
    </div>
  );
}
