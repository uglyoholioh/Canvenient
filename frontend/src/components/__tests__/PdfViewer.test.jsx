// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCanvasFileContent } from "../../api";

const fakeDoc = {
  numPages: 2,
  getPage: vi.fn(async () => ({
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  })),
  destroy: vi.fn(async () => {}),
};

vi.mock("../../api", () => ({
  fetchCanvasFileContent: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({ promise: Promise.resolve(fakeDoc) })),
}));

import PdfViewer from "../PdfViewer";

describe("PdfViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDoc.getPage.mockClear();
    fetchCanvasFileContent.mockResolvedValue({
      blob: new Blob(["%PDF-fake"]),
      contentType: "application/pdf",
      filename: "lecture-03.pdf",
    });
  });

  it("shows a loading state, then the toolbar with page count", async () => {
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);
    expect(screen.getByText("Loading PDF…")).toBeInTheDocument();

    expect(await screen.findByText("/ 2")).toBeInTheDocument();
    const pageInput = screen.getByRole("textbox", { name: "Go to page" });
    expect(pageInput).toHaveValue("1");
    expect(screen.getByText("Page 2")).toBeInTheDocument();
  });

  it("navigates pages from the toolbar", async () => {
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);
    await screen.findByText("/ 2");

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Go to page" })).toHaveValue("2"));
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Go to page" })).toHaveValue("1"));
  });

  it("zooms in from the toolbar and reports the percentage", async () => {
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);
    await screen.findByText("100%");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(await screen.findByText("125%")).toBeInTheDocument();
  });

  it("surfaces fetch failures with a retry action", async () => {
    fetchCanvasFileContent.mockRejectedValue(new Error("Canvas is unreachable."));
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);

    expect(await screen.findByText("Canvas is unreachable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
