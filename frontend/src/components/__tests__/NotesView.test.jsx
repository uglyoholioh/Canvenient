import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotesView from "../NotesView";
import { getNotes, getFolders, createNote } from "../../api";

vi.mock("../../api", () => ({
  getNotes: vi.fn(),
  getFolders: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  createFolder: vi.fn(),
  updateNote: vi.fn(),
}));

vi.mock("../MarkdownEditor", () => ({
  default: ({ noteId }) => (
    <div data-testid={`editor-for-${noteId}`}>Editor content for note {noteId}</div>
  ),
}));

vi.mock("../NotesGraph", () => ({
  default: () => <div data-testid="notes-graph">Notes Graph View</div>,
}));

describe("NotesView tabbed split screen", () => {
  const sampleNotes = [
    { id: 1, title: "Lecture 1 Notes", content: "Introduction to Biology", is_pinned: false },
    { id: 2, title: "Lecture 2 Notes", content: "Cellular Structure", is_pinned: false },
    { id: 3, title: "Assignment Ideas", content: "Drafting questions", is_pinned: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getNotes.mockResolvedValue(sampleNotes);
    getFolders.mockResolvedValue([]);
    createNote.mockImplementation(async (payload) => ({
      id: 99,
      title: payload.title || "Untitled",
      content: payload.content || "",
      is_pinned: false,
    }));
  });

  it("renders notes and opens the first note in Pane 1 as a tab by default", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 1 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Check Pane 1 tab bar has the first note
    const tab = screen.getByRole("tab", { name: /Lecture 1 Notes/i });
    expect(tab).toBeInTheDocument();
    expect(tab).toHaveAttribute("aria-selected", "true");

    // Check editor is rendered
    expect(screen.getByTestId("editor-for-1")).toBeInTheDocument();
  });

  it("opens a note as a new tab when clicked in sidebar and switches between tabs", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 2 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Click Lecture 2 Notes in sidebar (button with class notes-page-item)
    const sidebarButtons = screen.getAllByRole("button");
    const lec2Btn = sidebarButtons.find(
      (btn) =>
        btn.className.includes("notes-page-item") && btn.textContent.includes("Lecture 2 Notes"),
    );
    fireEvent.click(lec2Btn);

    // Both tabs should now be present
    expect(screen.getByRole("tab", { name: /Lecture 1 Notes/i })).toBeInTheDocument();
    const lec2Tab = screen.getByRole("tab", { name: /Lecture 2 Notes/i });
    expect(lec2Tab).toBeInTheDocument();
    expect(lec2Tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("editor-for-2")).toBeInTheDocument();

    // Switch back to Lecture 1 Notes tab
    const lec1Tab = screen.getByRole("tab", { name: /Lecture 1 Notes/i });
    fireEvent.click(lec1Tab);
    expect(screen.getByTestId("editor-for-1")).toBeInTheDocument();
  });

  it("closes a tab and selects an adjacent tab", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 2 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Open Lecture 2 Notes so we have 2 tabs
    const sidebarButtons = screen.getAllByRole("button");
    const lec2Btn = sidebarButtons.find(
      (btn) =>
        btn.className.includes("notes-page-item") && btn.textContent.includes("Lecture 2 Notes"),
    );
    fireEvent.click(lec2Btn);

    expect(screen.getByTestId("editor-for-2")).toBeInTheDocument();

    // Close Lecture 2 tab
    const closeBtn = screen.getByLabelText("Close tab Lecture 2 Notes");
    fireEvent.click(closeBtn);

    // Tab 2 should be gone, Tab 1 active
    expect(screen.queryByLabelText("Close tab Lecture 2 Notes")).not.toBeInTheDocument();
    expect(screen.getByTestId("editor-for-1")).toBeInTheDocument();
  });

  it("splits the screen into two side-by-side panes with independent tabs", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 1 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Click Split Screen button
    const splitButton = screen.getByLabelText(/Split Screen/i);
    fireEvent.click(splitButton);

    // Both pane 1 and pane 2 tab lists should be present
    expect(screen.getByLabelText("Notes pane 1 tabs")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes pane 2 tabs")).toBeInTheDocument();

    // Close Split button should now be available in pane 2
    expect(screen.getByLabelText("Close Split Pane")).toBeInTheDocument();

    // Clicking Close Split returns to single pane
    fireEvent.click(screen.getByLabelText("Close Split Pane"));
    expect(screen.queryByLabelText("Notes pane 2 tabs")).not.toBeInTheDocument();
  });

  it("opens note directly into split pane using sidebar split action", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 2 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Hover over Lecture 2 Notes row
    const lec2Text = screen
      .getAllByText("Lecture 2 Notes")
      .find((el) => el.closest(".notes-page-item"));
    const lec2Row = lec2Text.closest("div[style*='flex']");
    fireEvent.mouseEnter(lec2Row);

    // Click the hover Open in Split View button
    const splitHoverBtn = screen.getByLabelText("Open in Split View");
    fireEvent.click(splitHoverBtn);

    // Split screen should be active, and pane 2 should display editor for note 2
    expect(screen.getByLabelText("Notes pane 2 tabs")).toBeInTheDocument();
    expect(screen.getByTestId("editor-for-2")).toBeInTheDocument();
    expect(screen.getByTestId("editor-for-1")).toBeInTheDocument();
  });

  it("creates a new note in active pane when '+' button is clicked", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 1 Notes").length).toBeGreaterThanOrEqual(1);
    });

    const newTabBtn = screen.getByLabelText("New Note in pane 1");
    fireEvent.click(newTabBtn);

    await waitFor(() => {
      expect(createNote).toHaveBeenCalled();
      expect(screen.getByTestId("editor-for-99")).toBeInTheDocument();
    });
  });

  it("toggles the sidebar collapsed and expanded", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 1 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Sidebar search input should initially be in the document
    expect(screen.getByPlaceholderText("Search notes...")).toBeInTheDocument();

    // Click collapse sidebar button
    const collapseBtn = screen.getByLabelText("Collapse sidebar");
    fireEvent.click(collapseBtn);

    // Sidebar search should now be removed from document
    expect(screen.queryByPlaceholderText("Search notes...")).not.toBeInTheDocument();

    // Click expand sidebar button
    const expandBtn = screen.getByLabelText("Expand sidebar");
    fireEvent.click(expandBtn);

    // Sidebar search should now be back
    expect(screen.getByPlaceholderText("Search notes...")).toBeInTheDocument();
  });

  it("opens the same note in both panes when split is toggled with a single tab", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 1 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Click Split Screen button
    const splitButton = screen.getByLabelText(/Split Screen/i);
    fireEvent.click(splitButton);

    // Both panes should have editors for note 1 open simultaneously
    const editors = screen.getAllByTestId("editor-for-1");
    expect(editors.length).toBe(2);
  });

  it("opens a tab alongside in pane 2 without closing it from pane 1 when split button on tab is clicked", async () => {
    render(<NotesView token="mock-token" />);

    await waitFor(() => {
      expect(screen.getAllByText("Lecture 1 Notes").length).toBeGreaterThanOrEqual(1);
    });

    // Hover over the tab for Lecture 1 Notes
    const tab = screen.getByRole("tab", { name: /Lecture 1 Notes/i });
    fireEvent.mouseEnter(tab);

    // Click the tab split button
    const tabSplitBtn = screen.getByLabelText("Open tab alongside (split right)");
    fireEvent.click(tabSplitBtn);

    // Both panes should now be open, with Note 1 in both panes
    expect(screen.getByLabelText("Notes pane 1 tabs")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes pane 2 tabs")).toBeInTheDocument();
    const editors = screen.getAllByTestId("editor-for-1");
    expect(editors.length).toBe(2);
  });
});
