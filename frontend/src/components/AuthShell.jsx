import { useEffect, useState } from "react";
import { probeHealth } from "../api";
import "./auth.css";

// Real backend state for the corner status line. Polls gently so a sidecar
// that is still starting up resolves to "online" without user action.
function useBackendStatus() {
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    let cancelled = false;
    let timer;

    const probe = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      try {
        const response = await probeHealth();
        if (!cancelled) setStatus(response ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      } finally {
        window.clearTimeout(timeout);
      }
      if (!cancelled) timer = window.setTimeout(probe, 5000);
    };

    probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return status;
}

// App version from the Tauri shell; absent when running in a plain browser.
function useAppVersion() {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

export function BrandMark({ compact = false }) {
  return (
    <svg
      className={`auth-brand-mark ${compact ? "auth-brand-mark--compact" : ""}`}
      viewBox="0 -4 132 162"
      aria-hidden="true"
      focusable="false"
    >
      <text
        x="4"
        y="118"
        fontFamily='Didot, "Bodoni 72", "Playfair Display", Georgia, serif'
        fontStyle="italic"
        fontSize="124"
        fill="var(--text-h)"
      >
        C
      </text>
      <circle cx="112" cy="114" r="10" fill="var(--auth-brand-dot)" />
    </svg>
  );
}

function AuthShell({ children }) {
  const status = useBackendStatus();
  const version = useAppVersion();
  const statusLabel = { connecting: "connecting", online: "online", offline: "offline" }[status];

  return (
    <div className="auth-stage">
      <span className="auth-tick auth-tick--tl" aria-hidden="true" />
      <span className="auth-tick auth-tick--tr" aria-hidden="true" />
      <span className="auth-tick auth-tick--bl" aria-hidden="true" />
      <span className="auth-tick auth-tick--br" aria-hidden="true" />

      <header className="auth-corner auth-corner--tl auth-rise" style={{ "--auth-delay": "240ms" }}>
        <span className="auth-wordmark">canvenient</span>
      </header>
      <div
        className="auth-corner auth-corner--tr auth-rise"
        style={{ "--auth-delay": "300ms" }}
        role="status"
      >
        <span className={`auth-status-dot auth-status-dot--${status}`} aria-hidden="true" />
        <span>{statusLabel}</span>
      </div>
      <div className="auth-corner auth-corner--br auth-rise" style={{ "--auth-delay": "300ms" }}>
        {version && <span className="auth-version">v{version}</span>}
      </div>

      <main className="auth-poster">{children}</main>
    </div>
  );
}

export default AuthShell;
