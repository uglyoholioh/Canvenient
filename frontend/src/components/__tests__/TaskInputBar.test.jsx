// React is required by the test JSX transform.
 
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskInputBar from "../TaskInputBar";
import { createTask, getAcademicModules, parseTaskSmart } from "../../api";

vi.mock("../../api", () => ({
  createNote: vi.fn(),
  createTask: vi.fn(),
  getAcademicModules: vi.fn(),
  parseTaskSmart: vi.fn(),
}));

describe("TaskInputBar quick capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAcademicModules.mockResolvedValue([{ id: 42, module_code: "CS2040", canvas_course_id: 501 }]);
    createTask.mockResolvedValue({ id: 9, title: "Review assignment", status: "todo" });
  });

  it("keeps a task-only composer open after creating a task", async () => {
    render(
      <TaskInputBar
        token="token"
        variant="dock"
        isOpen
        initialMode="task"
        allowedModes={["task"]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Short task title..."), { target: { value: "Review assignment" } });
    expect(screen.queryByLabelText("Task note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Task note"), { target: { value: "Read the marking rubric first." } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "Review assignment",
      description: "Read the marking rubric first.",
      priority_manual: "medium",
    })));
    expect(createTask.mock.calls[0][1]).not.toHaveProperty("source_type");
    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("Short task title...")).toHaveValue(""));
  });

  it("keeps title-only capture primary and reveals the longer note on demand", async () => {
    render(
      <TaskInputBar token="token" variant="dock" isOpen initialMode="task" allowedModes={["task"]} />,
    );

    await waitFor(() => expect(screen.getByPlaceholderText("Short task title...")).toHaveAttribute("maxLength", "160"));
    expect(screen.queryByLabelText("Task note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByLabelText("Task note")).toHaveAttribute("maxLength", "4000");
  });

  it("adds a title-only task directly with Enter", async () => {
    render(
      <TaskInputBar token="token" variant="dock" isOpen initialMode="task" allowedModes={["task"]} />,
    );

    const title = screen.getByPlaceholderText("Short task title...");
    fireEvent.change(title, { target: { value: "Email tutor" } });
    fireEvent.keyDown(title, { key: "Enter" });

    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "Email tutor",
      description: "",
    })));
  });

  it("hands empty task-composer arrow presses to task navigation", async () => {
    const onEmptyArrowKey = vi.fn();
    render(
      <TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} onEmptyArrowKey={onEmptyArrowKey} />,
    );
    await act(async () => {});

    const title = screen.getByPlaceholderText("Short task title...");
    fireEvent.keyDown(title, { key: "ArrowDown" });
    fireEvent.keyDown(title, { key: "ArrowUp" });

    expect(onEmptyArrowKey).toHaveBeenCalledTimes(2);
    expect(onEmptyArrowKey).toHaveBeenNthCalledWith(1, "ArrowDown");
    expect(onEmptyArrowKey).toHaveBeenNthCalledWith(2, "ArrowUp");
  });

  it("smart-parses natural language into the form on Shift+Enter, leaving Enter as plain submit", async () => {
    parseTaskSmart.mockResolvedValue({
      title: "MA2002 Problem Set 4",
      due_at: "2026-09-18T17:00:00",
      priority: "high",
      category_id: null,
      category_name: null,
      estimated_minutes: null,
    });
    render(<TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} />);

    const title = screen.getByPlaceholderText("Short task title...");
    fireEvent.change(title, { target: { value: "finish ma2002 ps4 before next friday 5pm urgent" } });
    fireEvent.keyDown(title, { key: "Enter", shiftKey: true });

    await waitFor(() => expect(parseTaskSmart).toHaveBeenCalledWith("token", "finish ma2002 ps4 before next friday 5pm urgent"));
    await waitFor(() => expect(title).toHaveValue("MA2002 Problem Set 4"));
    expect(screen.getByLabelText("Task time (24-hour HH:MM)")).toHaveValue("17:00");
    expect(screen.getByRole("button", { name: /High Priority/i })).toBeInTheDocument();
    expect(screen.getByText(/Fields filled from your text/i)).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();

    // The parsed fields are editable in place: submitting afterwards uses them.
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "MA2002 Problem Set 4",
      priority_manual: "high",
    })));
    const payload = createTask.mock.calls[0][1];
    expect(new Date(payload.due_at_override).getHours()).toBe(17);
  });

  it("falls back with a hint when smart parse is unavailable", async () => {
    parseTaskSmart.mockRejectedValue(new Error("AI unavailable"));
    render(<TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} />);

    const title = screen.getByPlaceholderText("Short task title...");
    fireEvent.change(title, { target: { value: "some complicated sentence with a friday deadline" } });
    fireEvent.keyDown(title, { key: "Enter", shiftKey: true });

    await waitFor(() => expect(screen.getByText(/Smart parse unavailable/i)).toBeInTheDocument());
    expect(title).toHaveValue("some complicated sentence with a friday deadline");
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "some complicated sentence with a friday deadline",
    })));
  });

  it("labels task time entry as a 24-hour clock", async () => {
    render(<TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} />);
    await act(async () => {});

    expect(screen.getByLabelText("Task time (24-hour HH:MM)")).toHaveAttribute("placeholder", "24-hour HH:MM");
  });

  it("shows only modules selected in settings", async () => {
    getAcademicModules.mockResolvedValue([
      { id: 42, module_code: "CS2040", is_selected: true },
      { id: 43, module_code: "ST2334", is_selected: false },
    ]);
    render(<TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} />);

    fireEvent.click(screen.getByRole("button", { name: /No Module/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /CS2040/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /ST2334/i })).not.toBeInTheDocument();
  });

  it("calls onClose when Cancel button is clicked or Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} showCancel onClose={onClose} />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const title = screen.getByPlaceholderText("Short task title...");
    act(() => {
      fireEvent.keyDown(title, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("submits task with Cmd+Enter from note field", async () => {
    render(<TaskInputBar token="token" isOpen initialMode="task" allowedModes={["task"]} />);

    fireEvent.change(screen.getByPlaceholderText("Short task title..."), { target: { value: "Cmd enter task" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    const note = screen.getByLabelText("Task note");
    fireEvent.change(note, { target: { value: "Some details" } });
    fireEvent.keyDown(note, { key: "Enter", metaKey: true });

    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "Cmd enter task",
      description: "Some details",
    })));
  });
});
