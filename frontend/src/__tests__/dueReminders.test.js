// Tests for due-date reminder selection, deduplication, and the settings toggle.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getTasks = vi.fn();
vi.mock("../api", () => ({ getTasks: (...args) => getTasks(...args) }));

import {
  reminderKey,
  remindersEnabled,
  runDueReminderCycle,
  selectDueSoonTasks,
  setRemindersEnabled,
} from "../dueReminders";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-11T10:00:00Z");

function task(id, due, status = "todo") {
  return { id, title: `Task ${id}`, status, due_at_override: due };
}

describe("selectDueSoonTasks", () => {
  it("keeps pending tasks due within 24h, including slightly overdue ones", () => {
    const tasks = [
      task(1, new Date(NOW.getTime() + 2 * HOUR).toISOString()),
      task(2, new Date(NOW.getTime() + 30 * HOUR).toISOString()), // outside window
      task(3, new Date(NOW.getTime() - 30 * 60 * 1000).toISOString()), // just overdue
      task(4, new Date(NOW.getTime() - 3 * HOUR).toISOString()), // long overdue: ignore
      task(5, new Date(NOW.getTime() + 2 * HOUR).toISOString(), "done"),
      task(6, null),
    ];
    const selected = selectDueSoonTasks(tasks, NOW);
    expect(selected.map((t) => t.id)).toEqual([1, 3]);
  });
});

describe("runDueReminderCycle", () => {
  let notified;

  beforeEach(() => {
    vi.clearAllMocks();
    notified = {};
    const store = { "canvenient.due-reminders": "on" };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((k) => store[k] ?? null),
        setItem: vi.fn((k, v) => {
          store[k] = String(v);
        }),
        removeItem: vi.fn((k) => {
          delete store[k];
        }),
        clear: vi.fn(() => {
          Object.keys(store).forEach((k) => delete store[k]);
        }),
      },
    });
    store["canvenient.due-reminders"] = "on";
    notified.store = store;
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "granted";
        constructor(title, options) {
          notified.last = { title, body: options?.body };
        }
      },
    );
    getTasks.mockResolvedValue([task(9, new Date(NOW.getTime() + 3 * HOUR).toISOString())]);
  });

  it("notifies once per task and stores the dedupe key", async () => {
    const announced = await runDueReminderCycle("token", NOW);
    expect(announced.map((t) => t.id)).toEqual([9]);
    expect(notified.last.title).toBe("Task due soon");
    expect(notified.last.body).toContain("Task 9");

    // Second cycle: no re-notify.
    const second = await runDueReminderCycle("token", NOW);
    expect(second).toEqual([]);
  });

  it("does nothing when reminders are disabled", async () => {
    setRemindersEnabled(false);
    expect(remindersEnabled()).toBe(false);
    const announced = await runDueReminderCycle("token", NOW);
    expect(announced).toEqual([]);
    expect(getTasks).not.toHaveBeenCalled();
  });

  it("skips tasks already recorded as notified", async () => {
    const t = task(9, new Date(NOW.getTime() + 3 * HOUR).toISOString());
    notified.store["canvenient.due-reminders"] = "on";
    localStorage.setItem(
      "canvenient.due-reminders",
      JSON.stringify({ [reminderKey(t)]: Date.now() }),
    );
    const announced = await runDueReminderCycle("token", NOW);
    expect(announced).toEqual([]);
  });
});
