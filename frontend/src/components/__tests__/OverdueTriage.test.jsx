import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OverdueTriage from "../OverdueTriage";
import { collectOverdue } from "../../taskUtils";

vi.mock("../../api", () => ({
  updateTask: vi.fn(() => Promise.resolve({})),
}));

import { updateTask } from "../../api";

const NOW = new Date(2026, 8, 16, 12, 0); // Wed 16 Sep 2026, noon local

function iso(daysAgo, hour = 9) {
  const date = new Date(NOW);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

describe("collectOverdue", () => {
  it("selects only pending tasks due before today, oldest first", () => {
    const tasks = [
      { id: 1, status: "todo", due_at_override: iso(5) },
      { id: 2, status: "todo", due_at_override: iso(1) },
      { id: 3, status: "done", due_at_override: iso(9) },
      { id: 4, status: "todo", due_at_override: iso(0, 1) }, // today 01:00 — not overdue
      { id: 5, status: "todo" }, // no due date
    ];
    const overdue = collectOverdue(tasks);
    expect(overdue.map((task) => task.id)).toEqual([1, 2]);
  });
});

describe("OverdueTriage sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tasks = [
    { id: 1, title: "Lab report", status: "todo", due_at_override: iso(5) },
    { id: 2, title: "Rent", status: "todo", due_at_override: iso(1) },
  ];

  it("renders nothing when there is nothing overdue", () => {
    const { container } = render(
      <OverdueTriage
        token="t"
        tasks={[{ id: 3, title: "Fine", status: "todo", due_at_override: iso(0, 8) }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("pushes a task to today and advances", async () => {
    const onChanged = vi.fn();
    render(<OverdueTriage token="t" tasks={tasks} onChanged={onChanged} onClose={vi.fn()} />);

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Lab report")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    const [, taskId, payload] = updateTask.mock.calls[0];
    expect(taskId).toBe(1);
    expect(new Date(payload.due_at_override).toDateString()).toBe(new Date().toDateString());
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("marks a task done", async () => {
    render(<OverdueTriage token="t" tasks={tasks} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("t", 1, { status: "done" }));
  });

  it("reschedules via the date picker", async () => {
    render(<OverdueTriage token="t" tasks={[tasks[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick date…" }));
    fireEvent.change(screen.getByLabelText("New due date"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    const [, , payload] = updateTask.mock.calls[0];
    expect(new Date(payload.due_at_override).getDate()).toBe(20);
  });

  it("skip advances without touching the server", () => {
    render(<OverdueTriage token="t" tasks={tasks} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(updateTask).not.toHaveBeenCalled();
    expect(screen.getByText("Rent")).toBeInTheDocument();
  });
});
