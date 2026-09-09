import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "../MarkdownEditor";
import { getNotes, updateNote, getCachedCanvasFiles } from "../../api";

vi.mock("../../api", () => ({
  getNotes: vi.fn(),
  updateNote: vi.fn(),
  getCachedCanvasFiles: vi.fn(),
  createTask: vi.fn(),
}));

describe("MarkdownEditor multi-instance live synchronization", () => {
  const noteData = {
    id: 1,
    title: "CS2040 Data Structures",
    content: "<p>Initial lecture notes</p>",
    folder_id: null,
    is_pinned: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getNotes.mockResolvedValue([noteData]);
    getCachedCanvasFiles.mockResolvedValue({ files: [] });
    updateNote.mockImplementation(async (id, payload) => ({
      ...noteData,
      ...payload,
    }));
  });

  it("synchronizes title changes between two editors open for the same note", async () => {
    render(
      <div>
        <div data-testid="pane-0">
          <MarkdownEditor noteId={1} token="mock-token" initialNote={noteData} />
        </div>
        <div data-testid="pane-1">
          <MarkdownEditor noteId={1} token="mock-token" initialNote={noteData} />
        </div>
      </div>
    );

    const titleInputs = screen.getAllByPlaceholderText("Untitled Note");
    expect(titleInputs.length).toBe(2);
    expect(titleInputs[0].value).toBe("CS2040 Data Structures");
    expect(titleInputs[1].value).toBe("CS2040 Data Structures");

    // Type in Pane 0's title input
    fireEvent.change(titleInputs[0], { target: { value: "CS2040 Advanced Trees" } });

    // Pane 1's title should immediately update in real-time
    await waitFor(() => {
      expect(titleInputs[1].value).toBe("CS2040 Advanced Trees");
    });
  });

  it("synchronizes live content updates via canvenient-note-sync event", async () => {
    render(
      <div>
        <div data-testid="pane-0">
          <MarkdownEditor noteId={1} token="mock-token" initialNote={noteData} />
        </div>
        <div data-testid="pane-1">
          <MarkdownEditor noteId={1} token="mock-token" initialNote={noteData} />
        </div>
      </div>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Saved").length).toBe(2);
    });

    // Broadcast a content change from a peer editor
    act(() => {
      window.dispatchEvent(
        new CustomEvent("canvenient-note-sync", {
          detail: {
            noteId: 1,
            sourceId: "mock-peer-editor",
            type: "content",
            content: "<p>Updated content live from split pane</p>",
          },
        })
      );
    });

    // Save indicator should become unsaved in response
    await waitFor(() => {
      const unsavedElements = screen.getAllByText("Unsaved changes");
      expect(unsavedElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("syncs saved state across both editors when a save completes", async () => {
    render(
      <div>
        <div data-testid="pane-0">
          <MarkdownEditor noteId={1} token="mock-token" initialNote={noteData} />
        </div>
        <div data-testid="pane-1">
          <MarkdownEditor noteId={1} token="mock-token" initialNote={noteData} />
        </div>
      </div>
    );

    // Broadcast saved event
    act(() => {
      window.dispatchEvent(
        new CustomEvent("canvenient-note-sync", {
          detail: {
            noteId: 1,
            sourceId: "mock-peer-editor",
            type: "saved",
            note: { ...noteData, is_pinned: true },
            saveState: "saved",
          },
        })
      );
    });

    await waitFor(() => {
      const savedElements = screen.getAllByText("Saved");
      expect(savedElements.length).toBe(2);
    });
  });
});
