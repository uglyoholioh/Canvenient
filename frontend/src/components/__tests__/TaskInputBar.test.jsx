// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskInputBar from "../TaskInputBar";
import { createTask, getAcademicModules } from "../../api";

vi.mock("../../api", () => ({
  createNote: vi.fn(),
  createTask: vi.fn(),
  getAcademicModules: vi.fn(),
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
});
