import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CanvasDrawer from "../CanvasDrawer";
import * as api from "../../../api";

vi.mock("../../../api", () => ({
  getCanvasAssignment: vi.fn(),
  getCanvasPage: vi.fn(),
  submitCanvasAssignment: vi.fn(),
  getTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  getAcademicModules: vi.fn(),
}));

describe("CanvasDrawer", () => {
  const mockAssignment = {
    id: "assign1",
    course_id: "cs101",
    course_code: "CS101",
    title: "Problem Set 1",
    itemType: "assignment",
    due_at: "2026-09-15T23:59:00Z",
    description: "Complete all exercises",
    submission_types: ["online_upload"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.getCanvasAssignment.mockResolvedValue(mockAssignment);
    api.getTasks.mockResolvedValue([]);
    api.getAcademicModules.mockResolvedValue([
      { id: "mod1", source_course_id: "cs101", module_code: "CS101" },
    ]);
    api.createTask.mockResolvedValue({ id: "task1" });
  });

  it("renders Add as Task button and adds assignment to tasks", async () => {
    render(<CanvasDrawer item={mockAssignment} token="test-token" onClose={() => {}} />);

    const addTaskBtn = await screen.findByRole("button", { name: /Add as Task/i });
    expect(addTaskBtn).toBeInTheDocument();

    fireEvent.click(addTaskBtn);

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({
          title: "Problem Set 1",
          source_type: "canvas",
          source_id: "canvas:cs101:assign1",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /In Tasks/i })).toBeInTheDocument();
    });
  });
});
