// TrayPanel — the menu-bar popover, styled after Onigiri: the timer is the
// panel, everything else is quiet rows beneath it. A slim search field opens
// Canvenient's corpus from the menubar; picking a result raises the main
// window on the right view. Above the timer, glanceable facts: next class,
// next ISB departure, nearest deadlines. On expiry the panel raises an
// interaction-to-stop alarm.

import { useCallback, useEffect, useState } from "react";
import { getCurrent, WebviewWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { Search } from "lucide-react";
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
import "../design/system.css";
import "./tray.css";
import { loadCorpus } from "../omnibarCorpus";
import "./tray.css";

const DEFAULT_STOP = "COM3";
const PRESETS = [15, 25, 45, 90];

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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

  // --- Search ---------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [corpus, setCorpus] = useState(null);
  const [results, setResults] = useState([]);

  useEffect(() => {
    let alive = true;
    loadCorpus(token)
      .then((data) => {
        if (alive) setCorpus(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !corpus) {
      setResults([]);
      return;
    }
    const found = [];
    (corpus.notes || []).forEach((note) => {
      if ((note.title || "untitled").toLowerCase().includes(q)) {
        found.push({ kind: "note", id: note.id, label: note.title || "Untitled", source: "Note" });
      }
    });
    (corpus.tasks || []).forEach((task) => {
      if ((task.title || "").toLowerCase().includes(q)) {
        found.push({ kind: "task", id: task.id, label: task.title, source: "Task" });
      }
    });
    (corpus.canvas?.courses || []).forEach((course) => {
      if (
        (course.name || "").toLowerCase().includes(q) ||
        (course.course_code || "").toLowerCase().includes(q)
      ) {
        found.push({
          kind: "course",
          id: course.id,
          label: course.name || course.course_code,
          source: course.course_code || "Module",
        });
      }
    });
    (corpus.canvas?.assignments || []).forEach((assignment) => {
      if ((assignment.title || "").toLowerCase().includes(q)) {
        found.push({
          kind: "assignment",
          id: assignment.id,
          label: assignment.title,
          source: "Assignment",
        });
      }
    });
    setResults(found.slice(0, 7));
  }, [searchQuery, corpus]);

  const openResult = async (result) => {
    try {
      const main = WebviewWindow.getByLabel("main");
      if (main) {
        await main.show();
        await main.setFocus();
      }
      await emit("tray-open", result);
    } catch {
      // Worst case the main window stays as it was.
    }
    setSearchQuery("");
    getCurrent().hide();
  };

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
    const theme = window.localStorage.getItem("canvenient-theme") || "instrument-light";
    const resolved =
      theme === "instrument-dark" || theme === "dark" || theme === "graphite"
        ? "instrument-dark"
        : theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "instrument-dark"
            : "instrument-light"
          : "instrument-light";
    document.documentElement.setAttribute("data-theme", resolved);
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
  const plannedSeconds = Math.max(1, timer.plannedMinutes * 60);
  const progressPct = Math.min(100, (1 - timer.remaining / plannedSeconds) * 100);

  const startDraft = () => {
    timer.start(Number(draftMinutes) || 25);
  };

  return (
    <div
      className={`tp-root ${timer.alarmActive ? "is-alarm" : ""}`}
      onClick={() => timer.alarmActive && timer.dismissAlarm()}
      role="application"
      aria-label="Canvenient tray panel"
    >
      {offline && <div className="tp-offline">Offline — showing cached data</div>}

      <div className="tp-search">
        <Search size={13} strokeWidth={1.8} />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search Canvenient"
          spellCheck={false}
          aria-label="Search Canvenient"
        />
      </div>

      {results.length > 0 && (
        <section className="tp-section tp-results" aria-label="Search results">
          {results.map((result) => (
            <button
              key={`${result.kind}-${result.id}`}
              type="button"
              className="tp-result"
              onClick={() => openResult(result)}
            >
              <span className="tp-result-label">{result.label}</span>
              <span className="tp-result-source">{result.source}</span>
            </button>
          ))}
        </section>
      )}

      <section className="tp-section tp-timer" aria-label="Focus timer">
        <div className="tp-count" aria-live="off">
          {String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:
          {String(timer.remaining % 60).padStart(2, "0")}
        </div>
        <div className="tp-progress">
          <span style={{ width: `${running || timer.status === "paused" ? progressPct : 0}%` }} />
        </div>
        {timer.status === "idle" ? (
          <>
            <div className="tp-presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`tp-preset ${draftMinutes === preset ? "is-active" : ""}`}
                  onClick={() => setDraftMinutes(preset)}
                >
                  {preset}
                </button>
              ))}
              <input
                className="tp-minutes"
                type="number"
                min="1"
                max="480"
                value={draftMinutes}
                onChange={(event) => setDraftMinutes(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && startDraft()}
                aria-label="Minutes"
              />
            </div>
            <button type="button" className="tp-start" onClick={startDraft}>
              Start focus
            </button>
          </>
        ) : (
          <div className="tp-controls">
            {timer.status === "running" ? (
              <button type="button" className="tp-control" onClick={timer.pause}>
                Pause
              </button>
            ) : (
              <button type="button" className="tp-control" onClick={timer.resume}>
                Resume
              </button>
            )}
            <button type="button" className="tp-control is-primary" onClick={timer.complete}>
              Finish
            </button>
            <button type="button" className="tp-control is-danger" onClick={timer.cancel}>
              Cancel
            </button>
          </div>
        )}
        {timer.alarmActive && (
          <button type="button" className="tp-start tp-stop" onClick={timer.dismissAlarm}>
            Stop alarm
          </button>
        )}
        <div className="tp-timerfoot">
          <button type="button" className="tp-footlink" onClick={toggleChip}>
            {chipVisible ? "Hide chip" : "Float chip"}
          </button>
          <label className="tp-sound">
            <select
              value={sound}
              onChange={(event) => {
                setSound(event.target.value);
                storeAlarmSound(event.target.value);
              }}
              aria-label="Alarm sound"
            >
              {ALARM_SOUNDS.map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="tp-scroll">
        <section className="tp-section">
          <p className="tp-label">Next</p>
          {nextUp ? (
            <div className="tp-row">
              <span className="tp-row-main">{nextUp.title}</span>
              <span className="tp-row-sub">
                {formatClock(nextUp.start)}–{formatClock(nextUp.end)}
                {nextUp.venue ? ` · ${nextUp.venue}` : ""}
              </span>
            </div>
          ) : (
            <p className="tp-row-sub">No more classes today</p>
          )}
          {arrivals?.arrivals?.length ? (
            <div className="tp-row">
              <span className="tp-row-main">ISB {arrivals.arrivals[0].service}</span>
              <span className="tp-row-sub">
                {arrivals.arrivals[0].minutes[0] != null
                  ? `${arrivals.arrivals[0].minutes[0]} min`
                  : "—"}
                {arrivals.arrivals.length > 1 &&
                  ` · ${arrivals.arrivals
                    .slice(1, 3)
                    .map((arrival) => arrival.service)
                    .join(", ")}`}
              </span>
            </div>
          ) : (
            <p className="tp-row-sub">No bus times</p>
          )}
        </section>

        <section className="tp-section">
          <p className="tp-label">Deadlines</p>
          {deadlines.length ? (
            deadlines.map((task) => (
              <div key={task.id} className="tp-row">
                <span className="tp-row-main">{task.title}</span>
                <span className={`tp-row-sub${task.due < now ? " is-overdue" : ""}`}>
                  {relativeDue(task.due, now)}
                </span>
              </div>
            ))
          ) : (
            <p className="tp-row-sub">Nothing due</p>
          )}
        </section>
      </div>

      <footer className="tp-footer">
        <span className="tp-totals">
          {summary
            ? `Today ${formatMinutes(summary.today?.total_seconds ?? 0)} · Week ${formatMinutes(
                summary.week?.total_seconds ?? 0,
              )}`
            : ""}
        </span>
        <span className="tp-footer-actions">
          <button type="button" className="tp-footlink" onClick={reload}>
            Sync
          </button>
          <button type="button" className="tp-footlink" onClick={() => getCurrent().hide()}>
            Hide
          </button>
        </span>
      </footer>
      {running && <span className="visually-hidden">Focus timer {timer.status}</span>}
    </div>
  );
}
