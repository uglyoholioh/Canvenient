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

  it("falls forward from Now and swaps between Today and Next", async () => {
    const onNavigate = vi.fn();
    render(<ScheduleModule token="token" onNavigate={onNavigate} />);

    expect(await screen.findByText("Tomorrow task")).toBeInTheDocument();
    expect(screen.getByText("Nothing left today · showing what’s next")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("Past class")).toBeInTheDocument();
    expect(screen.queryByText("Tomorrow task")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByText("Tomorrow task"));
    expect(onNavigate).toHaveBeenCalledWith("tasks");
  });

  it("keeps schedule data visible when tasks cannot be loaded", async () => {
    getTasks.mockRejectedValue(new Error("offline"));
    render(<ScheduleModule token="token" onNavigate={() => {}} />);

    expect(await screen.findByText("ST2334")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t load your agenda.")).not.toBeInTheDocument();
  });
});
