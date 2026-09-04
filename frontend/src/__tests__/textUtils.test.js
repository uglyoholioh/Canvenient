import { describe, expect, it } from "vitest";
import { stripHtml } from "../textUtils";

describe("stripHtml", () => {
  it("strips basic HTML tags from string", () => {
    const input = "<p><span>Attached here are the Assignment 1 files.</span></p>";
    expect(stripHtml(input)).toBe("Attached here are the Assignment 1 files.");
  });

  it("handles complex Canvas assignment HTML snippet with entities and nested tags", () => {
    const input =
      '<p>Submit your completed activity &amp; budget proposal as<span>&nbsp;</span><strong>a PDF file</strong><span>&nbsp;here. N</span>ame file as&nbsp;<strong>Student ID_MMMYY_Proposal<span>&nbsp;</span></strong><span>e.g. A0123456B_Sep23_Proposal.</span></p>';
    expect(stripHtml(input)).toBe(
      "Submit your completed activity & budget proposal as a PDF file here. Name file as Student ID_MMMYY_Proposal e.g. A0123456B_Sep23_Proposal."
    );
  });

  it("preserves logical newlines between paragraphs", () => {
    const input = "<p>Paragraph 1</p><p>Paragraph 2</p>";
    expect(stripHtml(input)).toBe("Paragraph 1\n\nParagraph 2");
  });

  it("handles list items with bullets", () => {
    const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
    const output = stripHtml(input);
    expect(output).toContain("• Item 1");
    expect(output).toContain("• Item 2");
  });

  it("handles empty or falsy inputs", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });
});
