// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskView from "../TaskView";
import { getTasks, updateTask } from "../../api";

vi.mock("../../api", () => ({
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
