// Tests for the omnibar corpus cache: repeated keystrokes reuse one fetch,
// a tasks-changed event invalidates the cache, and Canvas courses /
// assignments / files join notes and tasks in the unified results.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getNotes = vi.fn();
const getTasks = vi.fn();
const getCanvasCourses = vi.fn();
const getCanvasAssignments = vi.fn();
const getCanvasFiles = vi.fn();
vi.mock("../../api", () => ({
  getNotes: (...args) => getNotes(...args),
  getTasks: (...args) => getTasks(...args),
  getCanvasCourses: (...args) => getCanvasCourses(...args),
  getCanvasAssignments: (...args) => getCanvasAssignments(...args),
  getCanvasFiles: (...args) => getCanvasFiles(...args),
  getCachedApiData: () => null,
  setCachedApiData: () => {},
}));

import Omnibar from "../Omnibar";
import { invalidateOmnibarCorpus, resetOmnibarCanvasStateForTests } from "../../omnibarCorpus";

function flushCanvasCorpus() {
  // The Canvas corpus refresh resolves on the microqueue; the omnibar picks
  // it up on the keystroke after invalidation. Flush both.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Omnibar corpus caching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateOmnibarCorpus();
    resetOmnibarCanvasStateForTests();
    getNotes.mockResolvedValue([{ id: 1, title: "Lecture summary", content: "limit theorem" }]);
    getTasks.mockResolvedValue([{ id: 2, title: "Finish CS2103 lab", status: "todo" }]);
    getCanvasCourses.mockResolvedValue([
      { id: 10, name: "Probability and Statistics", course_code: "ST2334" },
    ]);
    getCanvasAssignments.mockResolvedValue([
      { id: 20, course_id: 10, title: "Problem Set 4", due_at: "2026-09-20T12:00:00Z" },
    ]);
    getCanvasFiles.mockResolvedValue([
      { id: 30, display_name: "week5-lecture.pdf", external_url: "https://canvas.nus.edu.sg/courses/10/files/30" },
    ]);
  });

  it("reuses the cached corpus across keystrokes instead of refetching", async () => {
    // Keep the background Canvas refresh pending so it never invalidates the
    // corpus cache mid-test; cache reuse is what's under test here.
    getCanvasCourses.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<Omnibar token="t" onClose={() => {}} onNavigate={() => {}} />);
    // Mount warms the cache.
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText("Search notes, tasks, and modules...");
    fireEvent.change(input, { target: { value: "lab" } });
    await waitFor(() => expect(screen.getByText("Finish CS2103 lab")).toBeInTheDocument());
    fireEvent.change(input, { target: { value: "lab " } });
    await waitFor(() => expect(screen.getByText("Finish CS2103 lab")).toBeInTheDocument());

    // One mount fetch + cache hits afterwards; no per-keystroke refetch.
    expect(getTasks).toHaveBeenCalledTimes(1);
    expect(getNotes).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("refetches after the tasks-changed invalidation event", async () => {
    render(<Omnibar token="t" onClose={() => {}} onNavigate={() => {}} />);
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
    const input = screen.getByPlaceholderText("Search notes, tasks, and modules...");
    fireEvent.change(input, { target: { value: "lab" } });
    await waitFor(() => expect(screen.getByText("Finish CS2103 lab")).toBeInTheDocument());

    expect(getTasks).toHaveBeenCalledTimes(2);
    expect(getNotes).toHaveBeenCalledTimes(2);
  });

  it("searches Canvas courses, assignments, and files alongside notes and tasks", async () => {
    const onNavigate = vi.fn();
    render(<Omnibar token="t" onClose={() => {}} onNavigate={onNavigate} />);
    await flushCanvasCorpus();
    await flushCanvasCorpus();

    const input = screen.getByPlaceholderText("Search notes, tasks, and modules...");

    // Assignment match, annotated with its course code.
    fireEvent.change(input, { target: { value: "problem set" } });
    await waitFor(() => expect(screen.getByText("Problem Set 4")).toBeInTheDocument());
    expect(screen.getByText("ST2334")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Problem Set 4"));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith("canvas_resource", expect.objectContaining({ itemType: "assignment", id: 20 })),
    );

    // File match opens the Canvas drawer as a file resource.
    fireEvent.change(input, { target: { value: "week5" } });
    await waitFor(() => expect(screen.getByText("week5-lecture.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByText("week5-lecture.pdf"));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith("canvas_resource", expect.objectContaining({ itemType: "file", id: 30 })),
    );

    // Course match navigates to the Modules view.
    fireEvent.change(input, { target: { value: "st2334" } });
    await waitFor(() => expect(screen.getByText("ST2334 — Probability and Statistics")).toBeInTheDocument());
    fireEvent.click(screen.getByText("ST2334 — Probability and Statistics"));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith("view", expect.objectContaining({ view: "canvas" })),
    );
  });

  it("keeps working when the Canvas corpus is unavailable", async () => {
    getCanvasCourses.mockRejectedValue(new Error("Canvas not connected"));
    render(<Omnibar token="t" onClose={() => {}} onNavigate={() => {}} />);
    await flushCanvasCorpus();
    await flushCanvasCorpus();

    const input = screen.getByPlaceholderText("Search notes, tasks, and modules...");
    fireEvent.change(input, { target: { value: "theorem" } });
    await waitFor(() => expect(screen.getByText("Lecture summary")).toBeInTheDocument());
  });
});
