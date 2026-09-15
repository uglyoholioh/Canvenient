import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(() => Promise.resolve());
const emitMock = vi.fn(() => Promise.resolve());
const createFocusSessionMock = vi.fn(() => Promise.resolve({}));

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args) => emitMock(...args),
}));
vi.mock("../../api", () => ({
  createFocusSession: (...args) => createFocusSessionMock(...args),
  getStoredToken: () => "test-token",
}));
vi.mock("../../focusStore", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, flushQueue: vi.fn(() => Promise.resolve()) };
});

import { useFocusTimer } from "../useFocusTimer";
import { clearRunning, loadQueue, loadRunning, saveRunning } from "../../focusStore";

describe("useFocusTimer engine", () => {
  let nowMs;
  beforeEach(() => {
    nowMs = Date.parse("2026-09-16T09:00:00Z");
    vi.useFakeTimers({ now: nowMs });
    vi.clearAllMocks();
    // jsdom's native localStorage is unreliable here; focusStore persists
    // through the same Map-backed stub the other suites use.
    const storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    });
    clearRunning();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts down on the wall clock and shows the tray title", async () => {
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    act(() => result.current.start(25));
    expect(result.current.status).toBe("running");
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current.remaining).toBe(25 * 60 - 61);
    expect(invokeMock).toHaveBeenCalledWith("set_tray_title", { title: "24:59" });
  });

  it("finish logs elapsed time even mid-run", async () => {
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    act(() => result.current.start(25));
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    await act(async () => result.current.complete());
    const record = createFocusSessionMock.mock.calls.at(-1)?.[1];
    expect(record.actual_seconds).toBe(5 * 60);
    expect(record.source).toBe("mac_tray");
    expect(result.current.status).toBe("idle");
  });

  it("pause shifts the anchor so paused time is not counted", async () => {
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    act(() => result.current.start(25));
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    act(() => result.current.pause());
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // paused for 10 minutes
    });
    act(() => result.current.resume());
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(result.current.remaining).toBe(25 * 60 - 3 * 60);
  });

  it("natural expiry raises the alarm and logs the full session", async () => {
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    act(() => result.current.start(1));
    await act(async () => {
      vi.advanceTimersByTime(60 * 1000 + 1500);
    });
    expect(result.current.alarmActive).toBe(true);
    expect(result.current.status).toBe("idle");
    const record = createFocusSessionMock.mock.calls.at(-1)?.[1];
    expect(record.actual_seconds).toBe(60);
    expect(loadRunning()).toBeNull();
  });

  it("cancel discards short runs and logs runs over a minute", async () => {
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    act(() => result.current.start(25));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => result.current.cancel());
    expect(createFocusSessionMock).not.toHaveBeenCalled();

    act(() => result.current.start(25));
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000);
    });
    await act(async () => result.current.cancel());
    const record = createFocusSessionMock.mock.calls.at(-1)?.[1];
    expect(record.actual_seconds).toBe(3 * 60);
  });

  it("offline completion queues the session", async () => {
    createFocusSessionMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    act(() => result.current.start(25));
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    await act(async () => result.current.complete());
    expect(loadQueue()).toHaveLength(1);
    expect(loadQueue()[0].client_id).toBeTruthy();
  });

  it("a run that expired while the app was closed logs on restore", async () => {
    saveRunning({ startedAt: new Date(nowMs - 20 * 60 * 1000).toISOString(), plannedMinutes: 15 });
    const { result } = renderHook(() => useFocusTimer({ token: "t" }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const record = createFocusSessionMock.mock.calls.at(-1)?.[1];
    expect(record.actual_seconds).toBe(15 * 60);
    expect(result.current.status).toBe("idle");
  });
});
