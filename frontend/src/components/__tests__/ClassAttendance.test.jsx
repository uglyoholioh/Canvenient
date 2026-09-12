import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClassContext, getSchedule, updateClass } from "../../api";
import ClassContextDrawer from "../drawers/ClassContextDrawer";
import Schedule from "../Schedule";
import { scheduleItemsForDate } from "../scheduleUtils";

vi.mock("../../api", () => ({
  getSchedule: vi.fn(),
  importIcs: vi.fn(),
  importNusmods: vi.fn(),
  getClassContext: vi.fn(),
  updateClass: vi.fn(() => Promise.resolve({ status: "ok" })),
}));

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const TODAY = localDateKey(new Date());

function seedSchedule(attendInPerson) {
  getSchedule.mockResolvedValue({
    classes: [
      {
        id: 1,
        module_code: "CS2040S",
        module_name: "Data Structures and Algorithms",
        lesson_type: "Tutorial",
        class_no: "2",
        class_date: TODAY,
        start_time: "10:00:00",
        end_time: "11:00:00",
        venue: "COM1-0201",
        module_color: "#246BFD",
        weeks: [3, 5, 7],
        attend_in_person: attendInPerson,
      },
    ],
    exams: [],
    events: [],
  });
}

function drawerItemProps() {
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    classId: 1,
    occurrenceDate: TODAY,
    title: "CS2040S",
    subtitle: "Tutorial",
    classNo: "2",
    venue: "COM1-0201",
    color: "#246BFD",
    start,
    end,
    attendInPerson: true,
  };
}

describe("class attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedSchedule(true);
    getClassContext.mockResolvedValue({
      class: {
        id: 1,
        module_code: "CS2040S",
        lesson_type: "Tutorial",
        class_no: "2",
        occurrence_date: TODAY,
        attend_in_person: true,
      },
      tasks: [],
      notes: [],
      files: [],
    });
  });

  it("scheduleItemsForDate exposes the effective attend_in_person from the backend", () => {
    const schedule = {
      classes: [
        {
          id: 1,
          module_code: "CS2103",
          lesson_type: "Tutorial",
          class_no: "1",
          class_date: TODAY,
          start_time: "14:00:00",
          end_time: "15:00:00",
          attend_in_person: false,
        },
      ],
      exams: [],
      events: [],
    };
    const items = scheduleItemsForDate(schedule, new Date());
    expect(items).toHaveLength(1);
    expect(items[0].attendInPerson).toBe(false);
  });

  it("marks non-attending classes with dimmed styling and a tooltip", async () => {
    seedSchedule(false);
    render(<Schedule token="token" />);

    const block = await screen.findByText("CS2040S").then((el) => el.closest("article"));
    expect(block).toHaveClass("is-not-attending");
    expect(block.getAttribute("title") || block.getAttribute("aria-label")).toContain(
      "not attending",
    );
  });

  it("applies attendance to the selected date by default", async () => {
    render(<ClassContextDrawer item={drawerItemProps()} token="token" onClose={() => {}} />);

    const notAttending = await screen.findByRole("radio", { name: /not attending/i });
    fireEvent.click(notAttending);

    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(1));
    expect(updateClass).toHaveBeenCalledWith("token", 1, {
      attend_in_person: false,
      occurrence_date: TODAY,
    });
  });

  it("re-applies the current status to the whole series when scope changes", async () => {
    getClassContext.mockResolvedValue({
      class: {
        id: 1,
        module_code: "CS2040S",
        lesson_type: "Tutorial",
        class_no: "2",
        occurrence_date: TODAY,
        attend_in_person: false,
      },
      tasks: [],
      notes: [],
      files: [],
    });
    render(<ClassContextDrawer item={drawerItemProps()} token="token" onClose={() => {}} />);

    // The drawer reflects the effective status from the context, not the prop.
    const notAttending = await screen.findByRole("radio", { name: /not attending/i });
    await waitFor(() => expect(notAttending).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(screen.getByRole("radio", { name: /all recurring classes/i }));

    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(1));
    const payload = updateClass.mock.calls[0][2];
    expect(payload).toEqual({ attend_in_person: false });
  });

  it("keeps the control in sync after saving (no revert to stale props)", async () => {
    let currentAttendance = true;
    getClassContext.mockImplementation(async () => ({
      class: {
        id: 1,
        module_code: "CS2040S",
        lesson_type: "Tutorial",
        class_no: "2",
        occurrence_date: TODAY,
        attend_in_person: currentAttendance,
      },
      tasks: [],
      notes: [],
      files: [],
    }));
    updateClass.mockImplementation(async (_token, _id, payload) => {
      currentAttendance = payload.attend_in_person;
      return { status: "ok" };
    });
    render(<ClassContextDrawer item={drawerItemProps()} token="token" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("radio", { name: /not attending/i }));

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /not attending/i })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(screen.getByRole("radio", { name: /in person/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
