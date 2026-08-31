// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskView from "../TaskView";
import { getAcademicModules, getTasks, updateTask } from "../../api";

vi.mock("../../api", () => ({
  getAcademicModules: vi.fn(),
  getTasks: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock("../TaskInputBar", () => ({ default: () => <div>Task input</div> }));

describe("TaskView keyboard navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    getTasks.mockResolvedValue([
      { id: 1, title: "First task", status: "todo", created_at: "2026-08-29T10:00:00Z", priority_manual: "medium" },
      { id: 2, title: "Second task", status: "todo", created_at: "2026-08-29T11:00:00Z", priority_manual: "medium" },
    ]);
    getAcademicModules.mockResolvedValue([{ id: 42, module_code: "CS2040" }]);
    updateTask.mockResolvedValue({ id: 1, status: "done" });
  });

  it("selects with arrows and completes with Space", async () => {
    render(<TaskView token="token" />);
    await screen.findByText("First task");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Space to complete · Enter to edit")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 2, { status: "done" }));
  });

  it("lets only the most recent input modality own the visible selection", async () => {
    const { container } = render(<TaskView token="token" />);
    const rows = await screen.findAllByRole("listitem");
    const taskView = container.querySelector(".task-view");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(taskView).toHaveAttribute("data-interaction-mode", "keyboard");
    expect(screen.getByText("Space to complete · Enter to edit")).toBeInTheDocument();

    fireEvent.pointerEnter(rows[0], { pointerType: "mouse" });
    expect(taskView).toHaveAttribute("data-interaction-mode", "pointer");
    expect(screen.queryByText("Space to complete · Enter to edit")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(taskView).toHaveAttribute("data-interaction-mode", "keyboard");
    expect(screen.getByText("Space to complete · Enter to edit")).toBeInTheDocument();
  });

  it("edits title, note, due date, priority, and course in one save", async () => {
    const user = userEvent.setup();
    updateTask.mockResolvedValue({
      id: 1,
      title: "Revised task",
      status: "todo",
      created_at: "2026-08-29T10:00:00Z",
      priority_manual: "high",
      due_at_override: "2026-09-15T06:30:00.000Z",
      effective_due_at: "2026-09-15T06:30:00.000Z",
      module_id: 42,
      module_code: "CS2040",
    });
    render(<TaskView token="token" />);
    const firstTask = await screen.findByText("First task");

    fireEvent.click(firstTask);
    fireEvent.keyDown(window, { key: "Enter" });
    const title = screen.getByLabelText("Edit task title");
    await waitFor(() => expect(title).toHaveFocus());
    expect(document.querySelector(".task-due-editor .is-active")).not.toBeInTheDocument();
    fireEvent.change(title, { target: { value: "Revised task" } });

    await user.tab();
    expect(screen.getByLabelText("Edit task note")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Edit task note"), { target: { value: "Bring the tutorial worksheet." } });
    await user.tab();
    expect(screen.getByRole("group", { name: /edit task due date/i })).toHaveFocus();
    expect(document.querySelector(".task-due-editor .is-active")).toHaveTextContent("DD");
    await user.keyboard("150920261430");
    await user.tab();
    expect(screen.getByLabelText("Edit task priority")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Edit task priority"), "high");
    await user.tab();
    expect(screen.getByLabelText("Edit task course")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Edit task course"), "42");
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 1, {
      title: "Revised task",
      description: "Bring the tutorial worksheet.",
      due_at_override: new Date(2026, 8, 15, 14, 30).toISOString(),
      priority_manual: "high",
      module_id: 42,
    }));
    expect(await screen.findByText("Revised task")).toBeInTheDocument();
    expect(screen.getByText("CS2040")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Revised task").closest(".task-row")).toHaveFocus());
  });

  it("orders pending tasks by effective deadline and shows Canvas source deadlines", async () => {
    getTasks.mockResolvedValue([
      { id: 1, title: "No deadline", status: "todo", created_at: "2026-08-30T10:00:00Z", priority_manual: "medium" },
      {
        id: 2,
        title: "Canvas deadline",
        status: "todo",
        created_at: "2026-08-29T10:00:00Z",
        priority_manual: "medium",
        recommended_priority: "urgent",
        source_due_at: "2026-09-01T08:00:00+08:00",
        effective_due_at: "2026-09-01T08:00:00+08:00",
        module_code: "CS2040",
      },
      { id: 3, title: "Completed", status: "done", created_at: "2026-08-28T10:00:00Z", priority_manual: "high" },
    ]);

    render(<TaskView token="token" />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Canvas deadline");
    expect(rows[0]).toHaveTextContent("Sep 1");
    expect(rows[0]).toHaveTextContent("URGENT");
    expect(rows[0]).toHaveTextContent("CS2040");
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty task list", async () => {
    getTasks.mockRejectedValue(new Error("Backend unavailable"));

    render(<TaskView token="token" />);

    expect(await screen.findByText("Could not load tasks")).toBeInTheDocument();
    expect(screen.getByText("Backend unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("No tasks pending")).not.toBeInTheDocument();
  });
});
