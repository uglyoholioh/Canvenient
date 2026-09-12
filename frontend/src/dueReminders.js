/**
 * Due-date reminders: surfaces macOS/web notifications for tasks due soon.
 *
 * Runs in the workspace background: fetches pending tasks, notifies once per
 * task per due date for anything due within REMINDER_WINDOW_HOURS, and
 * records what was already announced in localStorage so restarts do not
 * re-notify. Uses Tauri's notification bridge inside the packaged app and the
 * Web Notification API in the browser.
 */

import { getTasks } from "./api";

export const REMINDER_WINDOW_HOURS = 24;
const REMINDER_STORE_KEY = "canvenient.due-reminders";
const REMINDER_TOGGLE_KEY = "canvenient-due-reminders";

export function remindersEnabled() {
  return (localStorage.getItem(REMINDER_TOGGLE_KEY) ?? "on") === "on";
}

export function setRemindersEnabled(enabled) {
  localStorage.setItem(REMINDER_TOGGLE_KEY, enabled ? "on" : "off");
}

function loadNotified() {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveNotified(store) {
  // Keep the map bounded: drop entries older than a week.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pruned = Object.fromEntries(Object.entries(store).filter(([, at]) => at > cutoff));
  localStorage.setItem(REMINDER_STORE_KEY, JSON.stringify(pruned));
}

export function reminderKey(task) {
  const due = task.due_at_override || task.source_due_at || "";
  return `${task.id}:${String(due).slice(0, 16)}`;
}

/** Tasks that are pending and due within the reminder window. */
export function selectDueSoonTasks(tasks, now = new Date()) {
  const horizon = now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000;
  return (tasks || []).filter((task) => {
    if (task.status === "done") return false;
    const due = task.due_at_override || task.source_due_at;
    if (!due) return false;
    const dueTime = new Date(due).getTime();
    return (
      !Number.isNaN(dueTime) && dueTime <= horizon && dueTime >= now.getTime() - 60 * 60 * 1000
    );
  });
}

async function ensurePermission() {
  if (window.__TAURI_IPC__) {
    try {
      const notification = await import("@tauri-apps/api/notification");
      let granted = await notification.isPermissionGranted();
      if (!granted) {
        const result = await notification.requestPermission();
        granted = result === "granted";
      }
      return granted;
    } catch {
      return false;
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
  return Notification.permission === "granted";
}

async function sendNotification(title, body) {
  if (window.__TAURI_IPC__) {
    const notification = await import("@tauri-apps/api/notification");
    notification.sendNotification({ title, body });
    return;
  }
  new Notification(title, { body });
}

/**
 * Fetch pending tasks and notify about due-soon ones. Returns the tasks that
 * were announced this cycle (exported for tests).
 */
export async function runDueReminderCycle(token, now = new Date()) {
  if (!token || !remindersEnabled()) return [];
  let tasks;
  try {
    tasks = await getTasks(token);
  } catch {
    return [];
  }

  const dueSoon = selectDueSoonTasks(tasks, now);
  if (!dueSoon.length) return [];

  const granted = await ensurePermission();
  if (!granted) return [];

  const notified = loadNotified();
  const announced = [];
  for (const task of dueSoon) {
    const key = reminderKey(task);
    if (notified[key]) continue;
    const due = new Date(task.due_at_override || task.source_due_at);
    const when = due.toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    await sendNotification("Task due soon", `${task.title} — due ${when}`);
    notified[key] = Date.now();
    announced.push(task);
  }
  if (announced.length) saveNotified(notified);
  return announced;
}
