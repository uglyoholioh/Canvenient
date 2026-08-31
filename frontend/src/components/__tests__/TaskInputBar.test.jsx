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

  it("keeps the dock open and carries Canvas context into the created task", async () => {
    render(
      <TaskInputBar
        token="token"
        variant="dock"
        isOpen
        initialMode="task"
        context={{
          type: "assignment",
          id: 77,
          title: "Problem Set 2",
          label: "Problem Set 2",
          courseId: 501,
          courseCode: "CS2040",
          dueAt: "2026-09-01T10:30:00+08:00",
          externalUrl: "https://canvas.example/assignments/77",
        }}
      />,
    );

    expect(screen.getByText("From Problem Set 2")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "CS2040" })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("What needs to be done?"), { target: { value: "Review assignment" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "Review assignment",
      module_id: 42,
      source_type: "canvas",
      source_id: "77",
      source_due_at: "2026-09-01T10:30:00+08:00",
      external_url: "https://canvas.example/assignments/77",
    })));
    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("What needs to be done?")).toHaveValue(""));
  });
});
