import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { getAssistantBrief } from "../../api";
import { useAssistant } from "../AssistantContext";
import "./assistantBriefCard.css";

function formatTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")}${suffix}`;
}

function formatDue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AssistantBriefCard({ token }) {
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { openAssistant } = useAssistant();

  const load = useCallback(
    // No synchronous setState here: the mount effect calls load, and a sync
    // update inside an effect body triggers cascading renders (react-hooks/
    // set-state-in-effect). Refresh spins up loading in its onClick instead.
    (refresh = false) => {
      getAssistantBrief(token, refresh)
        .then((data) => {
          setError("");
          setBrief(data);
        })
        .catch((err) => setError(err.message || "Could not load your brief."))
        .finally(() => setLoading(false));
    },
    [token],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="brief-card">
      <div className="brief-card-topline">
        <span className="brief-card-day">{brief?.today || "Your day"}</span>
        <span className="brief-card-actions">
          <button
            type="button"
            className="brief-card-ask"
            onClick={() => openAssistant({})}
            title="Open the assistant"
          >
            <Sparkles size={12} /> Ask
          </button>
          <button
            type="button"
            className="brief-card-refresh"
            onClick={() => {
              setLoading(true);
              load(true);
            }}
            aria-label="Refresh brief"
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? "is-spinning" : ""} />
          </button>
        </span>
      </div>

      {loading && !brief && <p className="brief-card-muted">Reading your day…</p>}
      {error && <p className="brief-card-muted">{error}</p>}

      {brief && (
        <>
          {brief.ai_ok ? (
            <p className="brief-card-summary">{brief.summary}</p>
          ) : (
            <p className="brief-card-muted">Offline summary unavailable — here are the facts.</p>
          )}

          {brief.attention?.length > 0 && (
            <ul className="brief-card-attention">
              {brief.attention.map((item, i) => (
                <li key={i}>{item.text}</li>
              ))}
            </ul>
          )}

          {brief.classes?.length > 0 && (
            <section className="brief-card-section">
              <h4>Classes today</h4>
              <ul>
                {brief.classes.map((c, i) => (
                  <li key={i}>
                    <span className="brief-card-time">{formatTime(c.start)}</span>
                    <span className="brief-card-main">
                      {c.code} {c.type}
                    </span>
                    {c.venue && <span className="brief-card-sub">{c.venue}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {brief.tasks?.filter((t) => t.due_at).length > 0 && (
            <section className="brief-card-section">
              <h4>Due / overdue</h4>
              <ul>
                {brief.tasks
                  .filter((t) => t.due_at)
                  .slice(0, 5)
                  .map((t) => (
                    <li key={t.id}>
                      <span className={`brief-card-time${t.overdue ? " is-overdue" : ""}`}>
                        {t.overdue ? "overdue" : formatDue(t.due_at)}
                      </span>
                      <span className="brief-card-main">{t.title}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {brief.new_announcements?.length > 0 && (
            <section className="brief-card-section">
              <h4>New in Canvas</h4>
              <ul>
                {brief.new_announcements.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <span className="brief-card-time">{a.course}</span>
                    <span className="brief-card-main">{a.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!brief.classes?.length && !brief.tasks?.length && !brief.new_announcements?.length && (
            <p className="brief-card-muted">Nothing scheduled. You're all clear.</p>
          )}
        </>
      )}
    </div>
  );
}
