// React is required by the test JSX transform.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCanvasFileContent } from "../../api";

function fakeText(items) {
  return async () => ({
    items: items.map((item) => ({
      str: item.str,
      transform: [1, 0, 0, 1, 40, 80],
      width: 100,
      height: 12,
      ...item,
    })),
  });
}

const fakeDoc = {
  numPages: 2,
  getPage: vi.fn(async (n) => ({
    getViewport: ({ scale }) => ({
      width: 600 * scale,
      height: 800 * scale,
      convertToViewportPoint: (x, y) => [x, 800 - y],
    }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent: fakeText(
      n === 1
        ? [{ str: "binary trees lecture" }]
        : [{ str: "binary search trees recap" }],
    ),
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

// The vitest jsdom environment leaves window.localStorage as a bare object
// (opaque origin), so tests get a working Map-backed stand-in.
const storageMap = new Map();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
    setItem: (key, value) => { storageMap.set(key, String(value)); },
    removeItem: (key) => { storageMap.delete(key); },
    clear: () => storageMap.clear(),
  },
});

describe("PdfViewer", () => {
  const scrollKey = "canvenient-pdf-scroll:42";

  beforeEach(() => {
    vi.clearAllMocks();
    fakeDoc.getPage.mockClear();
    storageMap.clear();
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

  it("finds text across pages and steps through matches", async () => {
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);
    await screen.findByText("/ 2");

    fireEvent.click(screen.getByRole("button", { name: "Search in document" }));
    const searchBox = screen.getByRole("textbox", { name: "Search in document" });
    fireEvent.change(searchBox, { target: { value: "binary" } });

    expect(await screen.findByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Go to page" })).toHaveValue("1");

    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    await waitFor(() => expect(screen.getByText("2/2")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Go to page" })).toHaveValue("2"));
  });

  it("reports when nothing matches the query", async () => {
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);
    await screen.findByText("/ 2");

    fireEvent.click(screen.getByRole("button", { name: "Search in document" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search in document" }), {
      target: { value: "quadratic" },
    });

    expect(await screen.findByText("0/0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
  });

  it("reopens at the remembered reading position for the same document", async () => {
    window.localStorage.setItem(scrollKey, JSON.stringify({ p: 2, r: 0.5 }));
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Go to page" })).toHaveValue("2"),
    );
  });

  it("persists the scroll position while reading", async () => {
    render(<PdfViewer token="token" fileId={42} name="lecture-03.pdf" />);
    await screen.findByText("/ 2");

    const scrollPane = document.querySelector(".cv-pdf-scroll");
    Object.defineProperty(scrollPane, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scrollPane, "clientHeight", { value: 500, configurable: true });
    scrollPane.scrollTop = 1000;
    fireEvent.scroll(scrollPane);

    await waitFor(() => {
      const raw = window.localStorage.getItem(scrollKey);
      expect(raw).not.toBeNull();
      const saved = JSON.parse(raw);
      // jsdom has no layout (every page sits at offsetTop 0), so only assert
      // that a sane page number and the exact scroll ratio were persisted.
      expect(Number.isInteger(saved.p)).toBe(true);
      expect(saved.p).toBeGreaterThanOrEqual(1);
      expect(saved.r).toBeCloseTo(0.5);
    });
  });
});
