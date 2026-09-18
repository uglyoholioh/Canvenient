import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCanvasCalendarEvents, getSchedule, getTasks } from "../../../api";
import ScheduleView from "../ScheduleView";

// The instrument Schedule view had no render test, so a stale constant
// reference shipped past the suite and only crashed in the native app.
// This renders the real view with a live week so the block-positioning
// path executes.

vi.mock("../../../api", () => ({
  getSchedule: vi.fn(),
  getCanvasCalendarEvents: vi.fn(),
  getTasks: vi.fn(),
  importIcs: vi.fn(),
  importNusmods: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("../../../components/WorkspaceToolbarContext", () => ({
  useWorkspaceToolbar: () => {},
}));

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function mondayOfCurrentWeek() {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

describe("instrument ScheduleView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom's localStorage is unreliable here; the card-style preference
    // reads it on mount.
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    });
    getCanvasCalendarEvents.mockRejectedValue(new Error("offline"));
    getTasks.mockResolvedValue([]);
    getSchedule.mockResolvedValue({
      classes: [
        {
          id: 1,
          module_code: "CS2040",
          module_name: "Data Structures and Algorithms",
          lesson_type: "Tutorial",
          class_no: "2",
          class_date: localDateKey(mondayOfCurrentWeek()),
          start_time: "10:00:00",
          end_time: "11:00:00",
          venue: "COM1-0201",
          weeks: [3],
        },
      ],
      events: [],
      exams: [],
    });
  });

  it("renders a live week with positioned class blocks", async () => {
    render(<ScheduleView token="token" />);

    expect(await screen.findByText(/CS2040/)).toBeInTheDocument();
    // The axis hugs the data: a lone 10:00 class pads to a 09–12 window.
    expect(screen.getByText("09")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
  });
});
