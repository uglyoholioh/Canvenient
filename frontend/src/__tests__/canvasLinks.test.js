import { describe, expect, it } from "vitest";
import { extractCanvasLinks, moduleItemExternalUrl } from "../canvasLinks";

describe("Canvas link handling", () => {
  it("extracts unique HTTP links and resolves Canvas-relative file links", () => {
    expect(
      extractCanvasLinks(
        '<a href="/courses/1/files/9/download">Week 1 slides</a><a href="https://example.com/read">Reading</a><a href="/courses/1/files/9/download">Duplicate</a><a href="javascript:alert(1)">Ignore</a>',
      ),
    ).toEqual([
      { href: "https://canvas.nus.edu.sg/courses/1/files/9/download", label: "Week 1 slides" },
      { href: "https://example.com/read", label: "Reading" },
    ]);
  });

  it("only treats browser-safe module URLs as external resources", () => {
    expect(
      moduleItemExternalUrl({ external_url: "https://canvas.nus.edu.sg/courses/1/files/9" }),
    ).toBe("https://canvas.nus.edu.sg/courses/1/files/9");
    expect(moduleItemExternalUrl({ html_url: "javascript:alert(1)" })).toBe("");
  });
});
