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
vi.mock("../TaskInputBar", () => ({ default: () => <button type="button">Task date control</button> }));

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
    const onTasksChanged = vi.fn();
    window.addEventListener("canvenient-tasks-changed", onTasksChanged);
    render(<TaskView token="token" />);
    await screen.findByText("First task");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText(/Space to complete/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 2, { status: "done" }));
    expect(onTasksChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener("canvenient-tasks-changed", onTasksChanged);
  });

  it("lets only the most recent input modality own the visible selection", async () => {
    const { container } = render(<TaskView token="token" />);
    const rows = await screen.findAllByRole("listitem");
    const taskView = container.querySelector(".task-view");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(taskView).toHaveAttribute("data-interaction-mode", "keyboard");
    expect(screen.getByText(/Space to complete/i)).toBeInTheDocument();

    fireEvent.pointerEnter(rows[0], { pointerType: "mouse" });
    expect(taskView).toHaveAttribute("data-interaction-mode", "pointer");
    expect(screen.queryByText(/Space to complete/i)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(taskView).toHaveAttribute("data-interaction-mode", "keyboard");
    expect(screen.getByText(/Space to complete/i)).toBeInTheDocument();
  });

  it("keeps arrow keys inside task entry controls out of list navigation", async () => {
    render(<TaskView token="token" />);
    const rows = await screen.findAllByRole("listitem");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(rows[0]).toHaveClass("is-selected");

    fireEvent.click(screen.getByRole("button", { name: "Add new task" }));
    const taskDateControl = screen.getByRole("button", { name: "Task date control" });
    taskDateControl.focus();
    fireEvent.keyDown(taskDateControl, { key: "ArrowUp" });

    expect(rows[0]).toHaveClass("is-selected");
    expect(rows[1]).not.toHaveClass("is-selected");
  });

  it("opens the inline editor when the edit button is clicked and shows when a task was added", async () => {
    render(<TaskView token="token" />);
    await screen.findByText("First task");

    const editButton = screen.getByRole("button", { name: "Edit First task" });
    fireEvent.click(editButton);

    expect(await screen.findByLabelText("Edit task title")).toHaveValue("First task");
    expect(screen.getByText(/Added Aug 29/i)).toBeInTheDocument();
  });

  it("opens external url on row click or Enter when external_url exists", async () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    getTasks.mockResolvedValue([
      { id: 1, title: "Canvas assignment task", status: "todo", external_url: "https://canvas.nus.edu.sg/courses/1/assignments/2", created_at: "2026-08-29T10:00:00Z", priority_manual: "medium" },
    ]);
    render(<TaskView token="token" />);
    const taskText = await screen.findByText("Canvas assignment task");

    fireEvent.click(taskText);
    expect(windowOpenSpy).toHaveBeenCalledWith("https://canvas.nus.edu.sg/courses/1/assignments/2", "_blank", "noopener,noreferrer");

    windowOpenSpy.mockClear();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(windowOpenSpy).toHaveBeenCalledWith("https://canvas.nus.edu.sg/courses/1/assignments/2", "_blank", "noopener,noreferrer");

    windowOpenSpy.mockRestore();
  });

  it("edits title, note, due date, priority, and module in one save", async () => {
    const user = userEvent.setup();
    const onTasksChanged = vi.fn();
    window.addEventListener("canvenient-tasks-changed", onTasksChanged);
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
    await screen.findByText("First task");

    fireEvent.click(screen.getByRole("button", { name: "Edit First task" }));
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
    expect(screen.getByRole("button", { name: "Clear due date and time" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Edit task priority")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Edit task priority"), "high");
    await user.tab();
    expect(screen.getByLabelText("Edit task module")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Edit task module"), "42");
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
    expect(onTasksChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener("canvenient-tasks-changed", onTasksChanged);
  });

  it("clears an edited due date and time to a null override", async () => {
    updateTask.mockResolvedValue({ id: 1, title: "First task", status: "todo", due_at_override: null, effective_due_at: null });
    render(<TaskView token="token" />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit First task" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear due date and time" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 1, expect.objectContaining({ due_at_override: null })));
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

  it("displays tasks with the module attached using the module colour strip", async () => {
    getTasks.mockResolvedValue([
      { id: 10, title: "Task with module color", status: "todo", module_code: "CS2040", module_color: "#246BFD" },
      { id: 11, title: "Task without module", status: "todo" },
    ]);
    getAcademicModules.mockResolvedValue([{ id: 42, module_code: "CS2040", color: "#246BFD" }]);

    const { container } = render(<TaskView token="token" />);
    await screen.findByText("Task with module color");

    const rows = container.querySelectorAll(".task-row");
    expect(rows[0]).toHaveClass("has-module");
    expect(rows[0].querySelector(".task-module-strip")).toBeInTheDocument();
    expect(rows[0].querySelector(".task-module-strip")).toHaveStyle({ backgroundColor: "rgb(36, 107, 253)" });

    expect(rows[1]).not.toHaveClass("has-module");
    expect(rows[1].querySelector(".task-module-strip")).not.toBeInTheDocument();
  });

  it("shows '+ Add new task' trigger and reveals the composer on demand", async () => {
    render(<TaskView token="token" />);
    await screen.findByText("First task");

    const addBtn = screen.getByRole("button", { name: "Add new task" });
    expect(addBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Task date control" })).not.toBeInTheDocument();

    fireEvent.click(addBtn);
    expect(screen.getByRole("button", { name: "Task date control" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new task" })).not.toBeInTheDocument();
  });
});
