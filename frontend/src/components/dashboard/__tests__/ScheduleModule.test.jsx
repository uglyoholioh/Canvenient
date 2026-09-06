// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSchedule, getTasks } from "../../../api";
import ScheduleModule from "../ScheduleModule";

vi.mock("../../../api", () => ({
  getSchedule: vi.fn(),
  getTasks: vi.fn(),
}));

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

describe("ScheduleModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    getSchedule.mockResolvedValue({
      classes: [
        { id: 1, module_code: "Past class", lesson_type: "Lecture", class_no: "1", class_date: dateKey(today), start_time: "00:00", end_time: "00:01", venue: "LT19", module_color: "#246BFD" },
        { id: 2, module_code: "ST2334", lesson_type: "Tutorial", class_no: "8", class_date: dateKey(tomorrow), start_time: "10:00", end_time: "11:00", venue: "S16-06118", module_color: "#C58B2A" },
      ],
      exams: [],
      events: [],
    });
    getTasks.mockResolvedValue([{ id: 3, title: "Tomorrow task", module_code: "CS2040S", status: "open", effective_due_at: tomorrow.toISOString() }]);
  });

  it("shows today's time-scaled schedule by default", async () => {
    const onNavigate = vi.fn();
    const { container } = render(<ScheduleModule token="token" onNavigate={onNavigate} />);

    expect(await screen.findByText("Past class")).toBeInTheDocument();
    expect(screen.queryByText("Tomorrow task")).not.toBeInTheDocument();
    expect(container.querySelector(".schedule-timeline")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Past class"));
    expect(onNavigate).toHaveBeenCalledWith("schedule");
  });

  it("keeps schedule data visible when tasks cannot be loaded", async () => {
    getTasks.mockRejectedValue(new Error("offline"));
    render(<ScheduleModule token="token" onNavigate={() => {}} />);

    expect(await screen.findByText("Past class")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t load your agenda.")).not.toBeInTheDocument();
  });

  it("starts the timeline at the first class rather than an earlier task", async () => {
    const today = new Date();
    const firstClass = new Date(today);
    firstClass.setHours(9, 30, 0, 0);
    const earlierTask = new Date(today);
    earlierTask.setHours(7, 0, 0, 0);
    getSchedule.mockResolvedValue({
      classes: [{ id: 4, module_code: "CS2040S", lesson_type: "Lecture", class_no: "1", class_date: dateKey(today), start_time: "09:30", end_time: "11:30", venue: "LT19", module_color: "#246BFD" }],
      exams: [],
      events: [],
    });
    getTasks.mockResolvedValue([{ id: 5, title: "Early task", status: "open", effective_due_at: earlierTask.toISOString() }]);

    const { container } = render(<ScheduleModule token="token" onNavigate={() => {}} />);

    await screen.findByText("CS2040S");
    expect(container.querySelector(".schedule-timeline-hour time")).toHaveTextContent(
      firstClass.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    );
  });

  it("only shows recurring classes if happening for the current week", async () => {
    const { getAcademicWeek } = await import("../../scheduleUtils");
    const today = new Date();
    const currentWeekInfo = getAcademicWeek(today);
    const currentWeek = currentWeekInfo.weekNumber || 1;
    const otherWeek = currentWeek === 2 ? 3 : 2;

    getSchedule.mockResolvedValue({
      classes: [
        {
          id: 10,
          module_code: "THIS-WEEK-CLASS",
          lesson_type: "Tutorial",
          day_of_week: today.getDay(),
          start_time: "10:00",
          end_time: "11:00",
          venue: "COM1",
          weeks: [currentWeek],
        },
        {
          id: 11,
          module_code: "OTHER-WEEK-CLASS",
          lesson_type: "Tutorial",
          day_of_week: today.getDay(),
          start_time: "12:00",
          end_time: "13:00",
          venue: "COM1",
          weeks: [otherWeek],
        },
      ],
      exams: [],
      events: [],
    });
    getTasks.mockResolvedValue([]);

    render(<ScheduleModule token="token" onNavigate={() => {}} />);

    expect(await screen.findByText("THIS-WEEK-CLASS")).toBeInTheDocument();
    expect(screen.queryByText("OTHER-WEEK-CLASS")).not.toBeInTheDocument();
    // On the dashboard, it just shows the class and does not display weeksLabel
    expect(screen.queryByText(/Weeks/)).not.toBeInTheDocument();
  });

  it("displays accurate empty message when no classes or tasks scheduled for today", async () => {
    getSchedule.mockResolvedValue({ classes: [], exams: [], events: [] });
    getTasks.mockResolvedValue([]);

    render(<ScheduleModule token="token" onNavigate={() => {}} />);

    expect(await screen.findByText("No scheduled classes or dated tasks today.")).toBeInTheDocument();
  });
});
