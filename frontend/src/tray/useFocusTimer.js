// useFocusTimer — the focus-timer engine behind the tray panel.
//
// Wall-clock driven (not interval ticks): remaining time is derived from
// startedAt + planned, so drift and background throttling never distort the
// countdown. Pausing shifts the anchor forward, freezing the countdown
// without changing the underlying clock math. Completed runs become focus
// sessions via focusStore; offline runs are queued and replayed with a
// client_id. While running, the menu-bar tray title shows the live
// countdown and the floating chip window mirrors it through Tauri events.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { emit } from "@tauri-apps/api/event";
import { createFocusSession } from "../api";
import {
  clearRunning,
  enqueueSession,
  flushQueue,
  loadRunning,
  newClientId,
  saveRunning,
} from "../focusStore";
import { loadAlarmSound, playAlarm, stopAlarm } from "./alarm";

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setTrayTitle(title) {
  invoke("set_tray_title", { title }).catch(() => {});
}

function broadcast(status, remaining) {
  emit("focus-tick", { status, remaining }).catch(() => {});
}

function setAlarmFlag(active) {
  invoke("set_alarm_active", { active }).catch(() => {});
}

export function useFocusTimer({ token }) {
  const [status, setStatus] = useState("idle"); // idle | running | paused
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [alarmActive, setAlarmActive] = useState(false);
  const startedAtRef = useRef(null);
  const pausedAtRef = useRef(null);
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const persistSession = useCallback(async ({ startedAt, planned, elapsed }) => {
    const record = {
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date().toISOString(),
      planned_minutes: planned,
      actual_seconds: Math.max(0, Math.round(elapsed)),
      source: "mac_tray",
      is_break: false,
      client_id: newClientId(),
    };
    try {
      await createFocusSession(tokenRef.current, record);
    } catch {
      enqueueSession(record);
    }
  }, []);

  // The single exit path: logs the run, clears persistence, resets the tray,
  // and (when the timer ran to zero) raises the interaction-to-stop alarm.
  const finish = useCallback(
    async ({ startedAt, planned, elapsed, alarmed }) => {
      startedAtRef.current = null;
      pausedAtRef.current = null;
      clearRunning();
      setStatus("idle");
      setRemaining(planned * 60);
      stopAlarm();
      setAlarmFlag(false);
      setTrayTitle("");
      broadcast("idle", planned * 60);
      if (alarmed) {
        setAlarmActive(true);
        setAlarmFlag(true);
        playAlarm(loadAlarmSound());
      }
      await persistSession({ startedAt, planned, elapsed });
    },
    [persistSession],
  );

  const start = useCallback(
    (minutes) => {
      const planned = Math.max(1, Math.min(480, Math.round(minutes || plannedMinutes)));
      setPlannedMinutes(planned);
      setRemaining(planned * 60);
      startedAtRef.current = Date.now();
      pausedAtRef.current = null;
      saveRunning({ startedAt: new Date().toISOString(), plannedMinutes: planned });
      setStatus("running");
      setAlarmActive(false);
      stopAlarm();
      setAlarmFlag(false);
      setTrayTitle(formatCountdown(planned * 60));
      broadcast("running", planned * 60);
    },
    [plannedMinutes],
  );

  const pause = useCallback(() => {
    if (status !== "running") return;
    pausedAtRef.current = Date.now();
    setStatus("paused");
    broadcast("paused", remaining);
  }, [status, remaining]);

  const resume = useCallback(() => {
    if (status !== "paused" || !pausedAtRef.current || !startedAtRef.current) return;
    // Shift the anchor so paused time is not counted as focus time.
    startedAtRef.current += Date.now() - pausedAtRef.current;
    saveRunning({
      startedAt: new Date(startedAtRef.current).toISOString(),
      plannedMinutes,
    });
    pausedAtRef.current = null;
    setStatus("running");
    broadcast("running", remaining);
  }, [status, plannedMinutes, remaining]);

  const cancelRun = useCallback(() => {
    const startedAt = startedAtRef.current;
    if (!startedAt) return;
    const planned = plannedMinutes;
    const elapsed = planned * 60 - remaining;
    // Accidental cancels (under a minute of focus) are discarded.
    if (elapsed >= 60) {
      finish({ startedAt, planned, elapsed, alarmed: false });
    } else {
      startedAtRef.current = null;
      pausedAtRef.current = null;
      clearRunning();
      setStatus("idle");
      setRemaining(planned * 60);
      stopAlarm();
      setAlarmFlag(false);
      setTrayTitle("");
      broadcast("idle", planned * 60);
    }
  }, [finish, plannedMinutes, remaining]);

  const dismissAlarm = useCallback(() => {
    setAlarmActive(false);
    setAlarmFlag(false);
    stopAlarm();
  }, []);

  // Wall-clock tick: drives remaining, the tray title, the chip, and the
  // natural (alarmed) finish at zero.
  useEffect(() => {
    if (status !== "running") return undefined;
    const tick = () => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const plannedEnd = startedAt + plannedMinutes * 60 * 1000;
      const left = Math.max(0, Math.round((plannedEnd - Date.now()) / 1000));
      setRemaining(left);
      setTrayTitle(left > 0 ? formatCountdown(left) : "");
      broadcast("running", left);
      if (left <= 0) {
        finish({ startedAt, planned: plannedMinutes, elapsed: plannedMinutes * 60, alarmed: true });
      }
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [status, plannedMinutes, finish]);

  // Restore a run that survived a restart; one that expired while the app
  // was closed logs at full planned time via the first tick. Deferred to a
  // timeout so state updates happen outside the effect body.
  useEffect(() => {
    flushQueue(createFocusSession, tokenRef.current).catch(() => {});
    const timer = window.setTimeout(() => {
      const restored = loadRunning();
      if (!restored?.startedAt) return;
      const planned = restored.plannedMinutes || 25;
      setPlannedMinutes(planned);
      startedAtRef.current = new Date(restored.startedAt).getTime();
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
      setRemaining(Math.max(0, planned * 60 - elapsed));
      setStatus("running");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return {
    status,
    plannedMinutes,
    remaining,
    alarmActive,
    start,
    pause,
    resume,
    cancel: cancelRun,
    complete: () => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const planned = plannedMinutes;
      const elapsed = Math.max(0, planned * 60 - remaining);
      finish({ startedAt, planned, elapsed, alarmed: false });
    },
    dismissAlarm,
  };
}
