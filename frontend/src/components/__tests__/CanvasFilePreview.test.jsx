// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadCanvasFile, fetchCanvasFileContent, getCanvasFolders } from "../../api";
import { FileBrowser } from "../CanvasView";

vi.mock("../../api", () => ({
  getCanvasFolders: vi.fn(() => Promise.resolve([])),
  fetchCanvasFileContent: vi.fn(),
  downloadCanvasFile: vi.fn(() => Promise.resolve()),
}));

vi.mock("../PdfViewer", () => ({
  default: (props) => (
    <div data-testid="pdf-viewer-stub" data-file-id={String(props.fileId)} data-external-url={props.externalUrl} />
  ),
}));

const pdfFile = {
  id: 42,
  display_name: "lecture-03.pdf",
  filename: "lecture-03.pdf",
  url: "https://canvas.test/files/42/download",
  external_url: "https://canvas.test/courses/1/files/42",
  size: 2048,
  updated_at: "2026-09-01T10:00:00Z",
};

function renderBrowser() {
  return render(<FileBrowser token="token" courseId={1} allFiles={[pdfFile]} />);
}

describe("FileBrowser PDF preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCanvasFolders.mockResolvedValue([]);
    fetchCanvasFileContent.mockResolvedValue({
      blob: new Blob(["fake-bytes"]),
      contentType: "application/octet-stream",
      filename: "file",
    });
  });

  it("renders the in-app pdf viewer for a selected pdf file", async () => {
    renderBrowser();
    fireEvent.click(await screen.findByText("lecture-03.pdf"));

    const stub = await screen.findByTestId("pdf-viewer-stub");
    expect(stub).toHaveAttribute("data-file-id", "42");
    expect(stub).toHaveAttribute("data-external-url", pdfFile.external_url);
    // Auto-focus: reading mode is already active for pdfs.
    expect(screen.queryByRole("button", { name: "Exit full-width reading" })).toBeInTheDocument();
  });

  it("opens pdfs straight into full-width reading mode and exits on Escape", async () => {
    renderBrowser();
    fireEvent.click(await screen.findByText("lecture-03.pdf"));

    await screen.findByTestId("pdf-viewer-stub");
    expect(document.querySelector(".cv-files-split.is-pdf-focus")).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".cv-files-split.is-pdf-focus")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Read full width" }));
    await waitFor(() => expect(document.querySelector(".cv-files-split.is-pdf-focus")).not.toBeNull());
  });

  it("keeps non-pdf files in the side preview pane", async () => {
    render(<FileBrowser token="token" courseId={1} allFiles={[{ ...pdfFile, id: 7, display_name: "diagram.png", filename: "diagram.png", content_type: "image/png" }]} />);
    fireEvent.click(await screen.findByText("diagram.png"));

    await waitFor(() => expect(document.querySelector(".cv-file-preview-aside img")).not.toBeNull());
    expect(document.querySelector(".cv-files-split.is-pdf-focus")).toBeNull();
  });

  it("downloads through the content proxy instead of the expiring Canvas url", async () => {
    renderBrowser();
    fireEvent.click(await screen.findByText("lecture-03.pdf"));
    const downloadButtons = await screen.findAllByTitle("Download");
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => expect(downloadCanvasFile).toHaveBeenCalledWith("token", 42, "lecture-03.pdf"));
  });

  it("does not fetch file content for types without an inline preview", async () => {
    renderBrowser();
    fireEvent.click(await screen.findByText("lecture-03.pdf"));
    await waitFor(() => expect(screen.getByTestId("pdf-viewer-stub")).toBeInTheDocument());
    expect(fetchCanvasFileContent).not.toHaveBeenCalled();
  });

  it("matches files by their folder name, not only the filename", async () => {
    getCanvasFolders.mockResolvedValue([
      { id: 5, name: "Lectures", full_name: "Lectures", parent_folder_id: null, files_count: 1, folders_count: 0 },
    ]);
    render(
      <FileBrowser
        token="token"
        courseId={1}
        allFiles={[{ ...pdfFile, id: 9, display_name: "data.csv", filename: "data.csv", folder_id: 5 }]}
      />
    );
    // Wait for the folder tree to load first.
    await waitFor(() => expect(document.querySelector(".cv-ftree-label")).not.toBeNull());

    const input = screen.getByPlaceholderText(/Search in|Search all files/i);
    fireEvent.change(input, { target: { value: "lectures" } });

    expect(await screen.findByText("data.csv")).toBeInTheDocument();
  });
});
