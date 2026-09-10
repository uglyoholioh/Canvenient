import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TaskView from "../TaskView";
import { getTasks, getAcademicModules } from "../../api";
import { queueTaskDeletion } from "../../taskDeleteBuffer";

vi.mock("../../api", () => ({
  getTasks: vi.fn(),
  getAcademicModules: vi.fn(),
}));

vi.mock("../../taskDeleteBuffer", () => ({
  queueTaskDeletion: vi.fn(),
}));

globalThis.localStorage = { getItem: () => null, setItem: () => {} };

describe("TaskView Deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTasks.mockResolvedValue([
      { id: 1, title: "Task 1", status: "todo", created_at: "2024-01-01T00:00:00Z" }
    ]);
    getAcademicModules.mockResolvedValue([]);
    queueTaskDeletion.mockReturnValue({});
  });

  it("prevents duplicate delete calls if delete pressed multiple times", async () => {
    render(<TaskView token="test" active={true} />);
    
    // Wait for tasks to load
    await waitFor(() => {
      expect(screen.getByText("Task 1")).toBeInTheDocument();
    });

    // Select task
    const taskRow = screen.getByRole("listitem");
    fireEvent.focus(taskRow);

    // Press delete multiple times rapidly
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(queueTaskDeletion).toHaveBeenCalledTimes(1);
    });
  });
});
