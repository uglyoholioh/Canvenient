import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatShortcut,
  matchesShortcut,
  readKeyboardShortcuts,
  saveKeyboardShortcuts,
  shortcutFromKeyboardEvent,
} from "../keyboardShortcuts";

describe("keyboard shortcuts", () => {
  beforeEach(() => {
    let stored = null;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => stored),
        setItem: vi.fn((_, value) => { stored = value; }),
      },
    });
  });

  it("uses stable defaults and macOS-style labels", () => {
    expect(readKeyboardShortcuts()).toEqual(DEFAULT_KEYBOARD_SHORTCUTS);
    expect(formatShortcut(DEFAULT_KEYBOARD_SHORTCUTS.quickNote)).toBe("⌘⇧N");
    expect(formatShortcut(DEFAULT_KEYBOARD_SHORTCUTS.tasksPanel)).toBe("⇧Tab");
  });

  it("records and matches a configurable shortcut", () => {
    const event = { key: "t", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };
    expect(shortcutFromKeyboardEvent(event)).toBe("Meta+Alt+T");
    expect(matchesShortcut(event, "Meta+Alt+T")).toBe(true);

    saveKeyboardShortcuts({ ...DEFAULT_KEYBOARD_SHORTCUTS, quickTask: "Meta+Alt+T" });
    expect(readKeyboardShortcuts().quickTask).toBe("Meta+Alt+T");
  });
});
