import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRunning,
  enqueueSession,
  flushQueue,
  loadQueue,
  loadRunning,
  newClientId,
  saveRunning,
  storeQueue,
} from "../focusStore";

describe("focusStore", () => {
  beforeEach(() => {
    // jsdom's localStorage lacks clear(); the app tests use a Map shim.
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips running state and clears it", () => {
    expect(loadRunning()).toBeNull();
    saveRunning({ startedAt: "2026-09-16T02:00:00.000Z", plannedMinutes: 25 });
    expect(loadRunning()).toEqual({ startedAt: "2026-09-16T02:00:00.000Z", plannedMinutes: 25 });
    clearRunning();
    expect(loadRunning()).toBeNull();
  });

  it("generates unique client ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newClientId()));
    expect(ids.size).toBe(50);
  });

  it("caps the queue at 50, dropping the oldest", () => {
    for (let i = 0; i < 55; i += 1) {
      enqueueSession({ started_at: `2026-09-16T0${i % 10}:00:00Z`, actual_seconds: i });
    }
    const queue = loadQueue();
    expect(queue).toHaveLength(50);
    expect(queue[0].actual_seconds).toBe(5); // first five dropped
    expect(queue.every((session) => session.client_id)).toBe(true);
  });

  it("flushQueue removes successes and keeps failures", async () => {
    enqueueSession({ started_at: "2026-09-16T02:00:00Z", client_id: "a" });
    enqueueSession({ started_at: "2026-09-16T03:00:00Z", client_id: "b" });

    const createSession = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("offline"));

    const remaining = await flushQueue(createSession, "token");
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(remaining.map((session) => session.client_id)).toEqual(["b"]);
    expect(loadQueue().map((session) => session.client_id)).toEqual(["b"]);
  });

  it("storeQueue replaces the queue", () => {
    enqueueSession({ started_at: "2026-09-16T02:00:00Z" });
    storeQueue([]);
    expect(loadQueue()).toEqual([]);
  });
});
