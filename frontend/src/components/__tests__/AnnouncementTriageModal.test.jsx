import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, dismissCanvasAnnouncement, getAcademicModules } from "../../api";
import AnnouncementTriageModal from "../AnnouncementTriageModal";

vi.mock("../../api", () => ({
  createTask: vi.fn(),
  dismissCanvasAnnouncement: vi.fn(),
  getAcademicModules: vi.fn(),
}));

describe("AnnouncementTriageModal", () => {
  const sampleAnnouncements = [
    {
      id: 1,
      course_id: 101,
      course_code: "CS2103T",
      title: "Week 3 Tutorial Briefing",
      body: "<p>Please prepare question 1 & 2 for the tutorial.</p>",
      posted_at: "2026-09-01T10:00:00Z",
      author: "Prof Damith",
      is_priority: true,
      external_url: "https://canvas.test/announcement/1",
      is_dismissed: false,
    },
    {
      id: 2,
      course_id: 102,
      course_code: "CS3230",
      title: "Midterm seating arrangements",
      body: "<p>Seating allocated by group.</p>",
      posted_at: "2026-09-02T12:00:00Z",
      author: "Prof Seth",
      is_priority: false,
      external_url: "https://canvas.test/announcement/2",
      is_dismissed: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    dismissCanvasAnnouncement.mockResolvedValue({ ok: true });
    getAcademicModules.mockResolvedValue([
      { id: 10, module_code: "CS2103T", source_course_id: "101" },
      { id: 11, module_code: "CS3230", source_course_id: "102" },
    ]);
    createTask.mockResolvedValue({ id: 55, title: "[Announcement] Week 3 Tutorial Briefing" });
  });

  it("renders the unread announcements and reading pane", () => {
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 unread")).toBeInTheDocument();
    expect(screen.getAllByText("Week 3 Tutorial Briefing").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Please prepare question 1 & 2 for the tutorial.")).toBeInTheDocument();
  });

  it("navigates next and previous using Arrow keys or J/K", () => {
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={() => {}}
      />,
    );

    // Press ArrowDown to go next
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("2 of 2 unread")).toBeInTheDocument();
    expect(screen.getByText("Seating allocated by group.")).toBeInTheDocument();

    // Press ArrowUp to go previous
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText("1 of 2 unread")).toBeInTheDocument();
    expect(screen.getByText("Please prepare question 1 & 2 for the tutorial.")).toBeInTheDocument();
  });

  it("dismisses an announcement with Space key and auto-advances", async () => {
    const onDismiss = vi.fn();
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={() => {}}
        onAnnouncementDismissed={onDismiss}
      />,
    );

    // Press ' ' (Spacebar) to dismiss the first announcement
    fireEvent.keyDown(window, { key: " " });

    expect(onDismiss).toHaveBeenCalledWith(1);
    expect(dismissCanvasAnnouncement).toHaveBeenCalledWith("test-token", 1);
    expect(screen.getByText("1 of 1 unread")).toBeInTheDocument();
    expect(screen.getByText("Seating allocated by group.")).toBeInTheDocument();
  });

  it("converts the active announcement into a task with T key", async () => {
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={() => {}}
      />,
    );

    // Press 't' to create a task
    fireEvent.keyDown(window, { key: "t" });

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("test-token", expect.objectContaining({
        title: "[Announcement] Week 3 Tutorial Briefing",
        module_id: 10,
        source_type: "canvas",
        priority_manual: "high",
      }));
    });

    expect(await screen.findByRole("button", { name: /added to tasks/i })).toBeInTheDocument();
  });

  it("supports undoing a dismissal with U key", async () => {
    const onDismiss = vi.fn();
    const onRestore = vi.fn();
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={() => {}}
        onAnnouncementDismissed={onDismiss}
        onAnnouncementRestored={onRestore}
      />,
    );

    // Dismiss first
    fireEvent.keyDown(window, { key: "e" });
    expect(screen.getByText("1 of 1 unread")).toBeInTheDocument();

    // Press 'u' to undo
    fireEvent.keyDown(window, { key: "u" });
    expect(onRestore).toHaveBeenCalledWith(1);
    expect(screen.getByText("1 of 2 unread")).toBeInTheDocument();
  });

  it("shows all caught up screen when all announcements are dismissed", () => {
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={() => {}}
      />,
    );

    // Dismiss first
    fireEvent.keyDown(window, { key: "e" });
    // Dismiss second
    fireEvent.keyDown(window, { key: "e" });

    expect(screen.getByText("All caught up!")).toBeInTheDocument();
    expect(screen.getByText("You have triaged all unread announcements.")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <AnnouncementTriageModal
        announcements={sampleAnnouncements}
        token="test-token"
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
