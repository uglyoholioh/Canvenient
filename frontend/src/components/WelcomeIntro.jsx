import { useCallback, useEffect } from "react";
import { LayoutDashboard, CheckSquare, CalendarDays, Sparkles } from "lucide-react";
import { BrandMark } from "./AuthShell";
import "./welcomeIntro.css";

// One quiet screen shown once per user on first sign-in. Everything the rows
// name is a real surface in the workspace; the whole thing is skippable from
// the first pixel (Skip button, Escape) without losing setup, which follows.
const FEATURES = [
  {
    icon: LayoutDashboard,
    name: "Dashboard",
    description: "Start each day with a briefing of what's due and what's next.",
  },
  {
    icon: CheckSquare,
    name: "Tasks",
    description: "Capture anything in seconds; reminders surface it before it's due.",
  },
  {
    icon: CalendarDays,
    name: "Schedule",
    description: "Import your NUS timetable and keep Canvas deadlines in sync.",
  },
  {
    icon: Sparkles,
    name: "Assistant",
    description: "Ask about your work, summarize readings, and let it handle small actions.",
  },
];

export default function WelcomeIntro({ user, onDone }) {
  const finish = useCallback(() => {
    if (user?.id) {
      localStorage.setItem(`canvenient_intro_completed_${user.id}`, "true");
    }
    onDone?.();
  }, [user, onDone]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [finish]);

  return (
    <div
      className="welcome-intro"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Canvenient"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(var(--bg-rgb, 10, 11, 13), 0.94)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9998,
        padding: "16px",
      }}
    >
      <div
        className="welcome-intro-panel"
        style={{
          width: "100%",
          maxWidth: "440px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "8px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
          padding: "32px 28px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <BrandMark compact />
        </div>

        <h2
          style={{
            fontSize: "17px",
            fontWeight: "600",
            color: "var(--text-h)",
            margin: "10px 0 6px",
            textAlign: "center",
          }}
        >
          Welcome to Canvenient
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            margin: "0 0 18px",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Here's the short version of what's inside.
        </p>

        <div style={{ borderTop: "1px solid var(--border)" }}>
          {FEATURES.map(({ icon: Icon, name, description }) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px 2px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Icon size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--text-muted)" }} />
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-h)" }}>{name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.45 }}>
                  {description}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button
            type="button"
            onClick={finish}
            className="secondary-button"
            style={{ padding: "8px 14px", fontSize: "13px", color: "var(--text-muted)", flexShrink: 0 }}
          >
            Skip intro
          </button>
          <button
            type="button"
            onClick={finish}
            autoFocus
            className="primary-button"
            style={{ padding: "8px 18px", borderRadius: "4px", fontSize: "13px", fontWeight: "600", flexShrink: 0 }}
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}
