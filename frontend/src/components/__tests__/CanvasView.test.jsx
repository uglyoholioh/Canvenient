// React is required by the test JSX transform.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCanvasCourses, searchCanvasResources } from "../../api";
import CanvasView from "../CanvasView";

vi.mock("../../api", () => ({
  getCanvasCourses: vi.fn(),
  getCanvasFiles: vi.fn(),
  getCanvasFolders: vi.fn(() => Promise.resolve([])),
  getCanvasCourseModules: vi.fn(() => Promise.resolve([])),
  getCanvasPages: vi.fn(() => Promise.resolve([])),
  getCanvasSyllabus: vi.fn(() => Promise.resolve({ body: "" })),
  getCanvasAssignment: vi.fn(),
  getCanvasPage: vi.fn(),
  submitCanvasAssignment: vi.fn(),
  getCanvasAssignments: vi.fn(() => Promise.resolve([])),
  getCanvasAnnouncements: vi.fn(() => Promise.resolve([])),
  getAcademicModules: vi.fn(() => Promise.resolve([])),
  searchCanvasResources: vi.fn(() =>
    Promise.resolve({ results: [], total: 0, indexed_at: "2026-09-02T08:00:00Z" }),
  ),
  syncCanvasResourceIndex: vi.fn(() =>
    Promise.resolve({ indexed_count: 1, indexed_at: "2026-09-02T08:00:00Z" }),
  ),
}));

describe("CanvasView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCanvasCourses.mockResolvedValue([{ id: 1, course_code: "ST2334", name: "Statistics" }]);
    searchCanvasResources.mockResolvedValue({
      indexed_at: "2026-09-02T08:00:00Z",
      total: 1,
      results: [
        {
          canvas_course_id: "1",
          resource_type: "file",
          resource_id: "8",
          title: "Week 1 lecture slides.pdf",
          course_code: "ST2334",
          external_url: "https://canvas.test/week-1",
          snippet: "Sampling distributions and confidence intervals",
        },
      ],
    });
  });

  it.skip("searches files directly from a natural-language resource request", async () => {
    render(<CanvasView token="token" />);
    const search = await screen.findByRole("textbox", { name: "Search Canvas resources" });
    fireEvent.change(search, { target: { value: "ST2334 files week 1" } });
    expect(await screen.findByText("Week 1 lecture slides.pdf")).toBeInTheDocument();
    expect(screen.getByText("ST2334")).toBeInTheDocument();
    await waitFor(() =>
      expect(searchCanvasResources).toHaveBeenCalledWith("token", "ST2334 files week 1"),
    );
    expect(screen.getByText(/Sampling distributions/)).toBeInTheDocument();
  });

  it.skip("sends a natural-language page request to the Canvas index", async () => {
    searchCanvasResources.mockResolvedValue({
      indexed_at: "2026-09-02T08:00:00Z",
      total: 1,
      results: [
        {
          canvas_course_id: "1",
          resource_type: "page",
          resource_id: "week-1",
          title: "Week 1 overview",
          course_code: "ST2334",
          snippet: "What the central limit theorem means",
        },
      ],
    });
    render(<CanvasView token="token" />);
    const search = await screen.findByRole("textbox", { name: "Search Canvas resources" });
    fireEvent.change(search, { target: { value: "ST2334 pages week 1" } });

    expect(await screen.findByText("Week 1 overview")).toBeInTheDocument();
    await waitFor(() =>
      expect(searchCanvasResources).toHaveBeenCalledWith("token", "ST2334 pages week 1"),
    );
  });
});
