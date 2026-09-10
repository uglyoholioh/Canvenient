import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClassContext, getSchedule } from "../../api";
import Schedule from "../Schedule";

vi.mock("../../api", () => ({
  getSchedule: vi.fn(),
  importIcs: vi.fn(),
  importNusmods: vi.fn(),
  getClassContext: vi.fn(),
  updateClass: vi.fn(),
}));

function localDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

describe("Schedule Full Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const today = new Date();

    getSchedule.mockResolvedValue({
      classes: [
        {
          id: 1,
          module_code: "CS2040S",
          module_name: "Data Structures and Algorithms",
          lesson_type: "Tutorial",
          class_no: "2",
          class_date: localDateKey(today),
          start_time: "10:00:00",
          end_time: "11:00:00",
          venue: "COM1-0201",
          module_color: "#246BFD",
          weeks: [3, 5, 7, 9, 11, 13],
        },
      ],
      exams: [],
      events: [],
    });

    getClassContext.mockResolvedValue({
      class: {
        id: 1,
        module_code: "CS2040S",
        module_name: "Data Structures and Algorithms",
        lesson_type: "Tutorial",
        class_no: "2",
        start_time: "10:00:00",
        end_time: "11:00:00",
        venue: "COM1-0201",
        occurrence_date: localDateKey(today),
        attend_in_person: true,
      },
      tasks: [],
      notes: [],
      files: [],
    });
  });

  it("displays the weeks which the class lies on in the timetable item", async () => {
    render(<Schedule token="token" />);

    expect(await screen.findByText("CS2040S")).toBeInTheDocument();
    expect(screen.getByText(/Weeks 3–13 \(Odd\)/)).toBeInTheDocument();
  });

  it("displays the weeks which the class lies on in the ClassContextDrawer when clicked", async () => {
    render(<Schedule token="token" />);

    const classItem = await screen.findByText("CS2040S");
    fireEvent.click(classItem);

    // In ClassContextDrawer header, weeksLabel should be present
    expect(await screen.findByText(/Tutorial \[2\] · Weeks 3–13 \(Odd\)/)).toBeInTheDocument();
  });
});
