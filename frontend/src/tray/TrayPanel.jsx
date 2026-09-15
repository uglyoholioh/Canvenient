// TrayPanel — the menu-bar popover face. Onigiri's base: big remaining
// countdown, slider + typed minutes + one-click presets, pause/stop, and on
// expiry the panel raises an interaction-to-stop alarm. Above the timer,
// Canvenient's glanceable rows: next class, next ISB departure, top
// deadlines. Footer carries today/week focus totals.

import { useCallback, useEffect, useState } from "react";
import { getCurrent, WebviewWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  getCampusBusArrivals,
  getFocusSummary,
  getSchedule,
  getStoredToken,
  getTasks,
} from "../api";
import { scheduleItemsForDate, taskDueDate } from "../components/scheduleUtils";
import { ALARM_SOUNDS, loadAlarmSound, storeAlarmSound } from "./alarm";
import { useFocusTimer } from "./useFocusTimer";

const DEFAULT_STOP = "COM3";
const PRESETS = [15, 25, 45, 90];

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function relativeDue(due, now) {
  if (!due) return "";
  const dayMs = 86400000;
  const days = Math.round(
    (new Date(due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / dayMs,
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return `${-days}d overdue`;
  if (days < 7) return `in ${days}d`;
  return new Date(due).toLocaleDateString([], { day: "numeric", month: "short" });
}

function usePanelData(token) {
  const [schedule, setSchedule] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [arrivals, setArrivals] = useState(null);
  const [summary, setSummary] = useState(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const results = await Promise.allSettled([
      getSchedule(token),
      getTasks(token),
      getCampusBusArrivals(
        token,
        window.localStorage.getItem("canvenient-isb-stop") || DEFAULT_STOP,
      ),
      getFocusSummary(token, "today"),
      getFocusSummary(token, "week"),
    ]);
    setOffline(results.some((result) => result.status === "rejected"));
    if (results[0].status === "fulfilled") setSchedule(results[0].value);
    if (results[1].status === "fulfilled") setTasks(results[1].value || []);
    if (results[2].status === "fulfilled") setArrivals(results[2].value);
    if (results[3].status === "fulfilled" && results[4].status === "fulfilled") {
      setSummary({ today: results[3].value, week: results[4].value });
    }
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  return { schedule, tasks, arrivals, summary, offline, reload: load };
}

export default function TrayPanel() {
  const token = getStoredToken();
  const timer = useFocusTimer({ token });
  const { schedule, tasks, arrivals, summary, offline, reload } = usePanelData(token);
  const [draftMinutes, setDraftMinutes] = useState(25);
  const [sound, setSound] = useState(loadAlarmSound);
  const [chipVisible, setChipVisible] = useState(false);

  const toggleChip = async () => {
    const chip = WebviewWindow.getByLabel("tray-chip");
    if (!chip) return;
    const visible = await chip.isVisible().catch(() => false);
    if (visible) {
      await chip.hide();
      setChipVisible(false);
    } else {
      await chip.show();
      setChipVisible(true);
    }
  };

  // The tray windows render outside the workspace shell, so they apply the
  // stored theme themselves.
  useEffect(() => {
    const theme = window.localStorage.getItem("canvenient-theme") || "graphite";
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  // The tray right-click "Start focus" item lands here.
  useEffect(() => {
    const unlisten = listen("tray-start-focus", () => {
      if (timer.status === "idle") timer.start(25);
    });
    return () => {
      unlisten.then((dispose) => dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status]);

  // Escape hides the panel; any click dismisses a ringing alarm.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") getCurrent().hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const now = new Date();
  const dayItems = schedule ? scheduleItemsForDate(schedule, now) : [];
  const nextUp = dayItems.find((item) => item.end > now);
  const deadlines = (tasks || [])
    .filter((task) => task.status !== "done")
    .map((task) => ({ ...task, due: taskDueDate(task) }))
    .filter((task) => task.due)
    .sort((left, right) => left.due - right.due)
    .slice(0, 3);
  const running = timer.status !== "idle";

  const startDraft = () => {
    timer.start(Number(draftMinutes) || 25);
  };

  return (
    <div
      className={`tray-panel ${timer.alarmActive ? "is-alarm" : ""}`}
      onClick={() => timer.alarmActive && timer.dismissAlarm()}
      role="application"
      aria-label="Canvenient tray panel"
    >
      {offline && <div className="tray-offline">Offline — showing cached data</div>}

      <section className="tray-section">
        <h2 className="tray-heading">Next</h2>
        {nextUp ? (
          <p className="tray-row">
            <strong>{nextUp.title}</strong>
            <span>
              {formatClock(nextUp.start)}–{formatClock(nextUp.end)}
              {nextUp.venue ? ` · ${nextUp.venue}` : ""}
            </span>
          </p>
        ) : (
          <p className="tray-row is-muted">No more classes today</p>
        )}
        {arrivals?.arrivals?.length ? (
          <p className="tray-row">
            <strong>ISB {arrivals.arrivals[0].service}</strong>
            <span>
              {arrivals.arrivals[0].minutes[0] != null
                ? `${arrivals.arrivals[0].minutes[0]} min`
                : "—"}
              {arrivals.arrivals.length > 1 &&
                ` · ${arrivals.arrivals
                  .slice(1, 3)
                  .map((arrival) => arrival.service)
                  .join(", ")}`}
            </span>
          </p>
        ) : (
          <p className="tray-row is-muted">No bus times</p>
        )}
      </section>

      <section className="tray-section">
        <h2 className="tray-heading">Deadlines</h2>
        {deadlines.length ? (
          <ul className="tray-list">
            {deadlines.map((task) => (
              <li key={task.id} className="tray-row">
                <strong>{task.title}</strong>
                <span className={task.due < now ? "is-overdue" : ""}>
                  {relativeDue(task.due, now)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tray-row is-muted">Nothing due — enjoy the calm</p>
        )}
      </section>

      <section className="tray-section tray-timer" aria-label="Focus timer">
        <div className="tray-countdown" aria-live="off">
          {String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:
          {String(timer.remaining % 60).padStart(2, "0")}
        </div>
        {timer.status === "idle" ? (
          <>
            <input
              className="tray-minutes"
              type="number"
              min="1"
              max="480"
              value={draftMinutes}
              onChange={(event) => setDraftMinutes(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && startDraft()}
              aria-label="Minutes"
            />
            <div className="tray-presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="tray-preset"
                  onClick={() => timer.start(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="tray-sound">
              <label htmlFor="tray-sound-select">Sound</label>
              <select
                id="tray-sound-select"
                value={sound}
                onChange={(event) => {
                  setSound(event.target.value);
                  storeAlarmSound(event.target.value);
                }}
              >
                {ALARM_SOUNDS.map((option) => (
                  <option key={option} value={option}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="tray-link" onClick={toggleChip}>
              {chipVisible ? "Hide floating timer" : "Float timer on desktop"}
            </button>
          </>
        ) : (
          <div className="tray-controls">
            {timer.status === "running" ? (
              <button type="button" className="tray-button" onClick={timer.pause}>
                Pause
              </button>
            ) : (
              <button type="button" className="tray-button" onClick={timer.resume}>
                Resume
              </button>
            )}
            <button type="button" className="tray-button is-primary" onClick={timer.complete}>
              Finish
            </button>
            <button type="button" className="tray-button is-danger" onClick={timer.cancel}>
              Cancel
            </button>
          </div>
        )}
        {timer.alarmActive && (
          <button
            type="button"
            className="tray-button is-primary tray-stop"
            onClick={timer.dismissAlarm}
          >
            Stop alarm
          </button>
        )}
      </section>

      <footer className="tray-footer">
        <span className="tray-totals">
          {summary
            ? `Today ${formatMinutes(summary.today?.total_seconds ?? 0)} · Week ${formatMinutes(
                summary.week?.total_seconds ?? 0,
              )}`
            : ""}
        </span>
        <span className="tray-footer-actions">
          <button type="button" className="tray-link" onClick={reload}>
            Sync
          </button>
          <button type="button" className="tray-link" onClick={() => getCurrent().hide()}>
            Hide
          </button>
        </span>
      </footer>
      {running && <span className="visually-hidden">Focus timer {timer.status}</span>}
    </div>
  );
}
