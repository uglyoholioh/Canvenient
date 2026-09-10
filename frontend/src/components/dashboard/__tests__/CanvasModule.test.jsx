// React is required by the test JSX transform.
 
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, getAcademicModules, getCanvasAnnouncements, getCanvasAssignments, getTasks, updateTask } from "../../../api";
import CanvasModule from "../CanvasModule";

vi.mock("../../../api", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  getAcademicModules: vi.fn(),
  getCanvasAnnouncements: vi.fn(),
  getCanvasAssignments: vi.fn(),
  getTasks: vi.fn(),
}));

describe("CanvasModule", () => {
  let store = {};

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => { store[key] = String(value); }),
        removeItem: vi.fn((key) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
      },
    });
    getCanvasAssignments.mockResolvedValue([
      { id: 10, course_id: 1, course_code: "ST2334", title: "Assignment 1", due_at: "2099-09-02T15:59:00Z", description: "<p>Please solve <b>problem 1</b> &amp; 2.</p>" + "A".repeat(5000), external_url: "https://canvas.test/assignment" },
      { id: 11, course_id: 1, course_code: "ST2334", title: "Quiz 1", due_at: "2099-09-04T15:59:00Z" },
    ]);
    getCanvasAnnouncements.mockResolvedValue([{ id: 20, course_id: 1, course_code: "ST2334", title: "Assessment update", is_priority: true, posted_at: "2099-09-01T00:00:00Z" }]);
    getTasks.mockResolvedValue([]);
    getAcademicModules.mockResolvedValue([{ id: 5, module_code: "ST2334", source_course_id: "1" }]);
    createTask.mockResolvedValue({ id: 40 });
    updateTask.mockResolvedValue({ id: 40, status: "todo" });
  });

  it("keeps the dashboard Canvas card to due dates", async () => {
    render(<CanvasModule token="token" enabled onOpenItem={() => {}} />);
    expect(await screen.findByText("Assignment 1")).toBeInTheDocument();
    expect(screen.getByText("Quiz 1")).toBeInTheDocument();
    expect(screen.getByText("Upcoming due dates")).toBeInTheDocument();
    expect(screen.queryByText("Module resources")).not.toBeInTheDocument();
  });

  it("opens the matching deadline details", async () => {
    const onOpenItem = vi.fn();
    render(<CanvasModule token="token" enabled onOpenItem={onOpenItem} />);
    fireEvent.click(await screen.findByRole("button", { name: /^ST2334 Assignment 1/i }));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ itemType: "assignment", id: 10 }));
  });

  it("imports a Canvas deadline to Tasks with stripped HTML and character limit", async () => {
    getTasks
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 40, source_type: "canvas", source_id: "canvas:1:10", status: "todo" }]);

    render(<CanvasModule token="token" enabled onOpenItem={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Assignment 1 to Tasks" }));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      module_id: 5,
      source_type: "canvas",
      source_id: "canvas:1:10",
      description: expect.stringMatching(/^Please solve problem 1 & 2\./),
    })));
    const passedDesc = createTask.mock.calls[0][1].description;
    expect(passedDesc.length).toBeLessThanOrEqual(4000);
    expect(passedDesc).not.toContain("<p>");
    expect(await screen.findByRole("button", { name: "Assignment 1 added to Tasks" })).toBeDisabled();
  });

  it("shows existing active tasks as added on load", async () => {
    getTasks.mockResolvedValue([
      { id: 40, source_type: "canvas", source_id: "canvas:1:10", status: "todo" },
    ]);
    render(<CanvasModule token="token" enabled onOpenItem={() => {}} />);
    expect(await screen.findByRole("button", { name: "Assignment 1 added to Tasks" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Quiz 1 to Tasks" })).not.toBeDisabled();
  });

  it("reopens a completed canvas task when clicked", async () => {
    getTasks
      .mockResolvedValueOnce([{ id: 40, source_type: "canvas", source_id: "canvas:1:10", status: "done" }])
      .mockResolvedValueOnce([{ id: 40, source_type: "canvas", source_id: "canvas:1:10", status: "done" }])
      .mockResolvedValue([{ id: 40, source_type: "canvas", source_id: "canvas:1:10", status: "todo" }]);

    render(<CanvasModule token="token" enabled onOpenItem={() => {}} />);
    const addButton = await screen.findByRole("button", { name: "Add Assignment 1 to Tasks" });
    fireEvent.click(addButton);
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 40, { status: "todo" }));
  });

  it("shows cached Canvas data immediately while refresh is pending", async () => {
    localStorage.setItem(
      "canvenient.cache.assignments",
      JSON.stringify([{ id: 99, course_id: 1, course_code: "CS2040S", title: "Cached Assignment", due_at: "2099-09-02T15:59:00Z" }]),
    );

    // Keep the mock unresolved to verify cached data renders during refresh
    let resolveAssignments;
    getCanvasAssignments.mockReturnValue(new Promise((resolve) => { resolveAssignments = resolve; }));

    render(<CanvasModule token="token" enabled onOpenItem={() => {}} />);

    expect(screen.getByText("Cached Assignment")).toBeInTheDocument();
    expect(screen.getByText("Syncing…")).toBeInTheDocument();

    await act(async () => {
      resolveAssignments([
        { id: 100, course_id: 1, course_code: "CS2040S", title: "Fresh Assignment", due_at: "2099-09-05T15:59:00Z" },
      ]);
    });

    await waitFor(() => expect(screen.getByText("Fresh Assignment")).toBeInTheDocument());
    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
    expect(screen.getByText("Synced just now")).toBeInTheDocument();
  });

  it("triggers a force-refresh when the manual refresh button is clicked", async () => {
    render(<CanvasModule token="token" enabled onOpenItem={() => {}} />);
    await screen.findByText("Assignment 1");

    const refreshButton = screen.getByRole("button", { name: "Refresh Canvas now" });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(getCanvasAssignments).toHaveBeenCalledWith("token", true);
      expect(getCanvasAnnouncements).toHaveBeenCalledWith("token", true);
    });
  });
});

