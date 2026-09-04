// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalTasksPanel from "../GlobalTasksPanel";

vi.mock("../TaskView", () => ({
  default: () => <button type="button">Task composer</button>,
}));

describe("GlobalTasksPanel", () => {
  it("closes on Escape and keeps Tab navigation inside the overlay", () => {
    const onClose = vi.fn();
    render(<><button type="button">Background control</button><GlobalTasksPanel token="token" isOpen onClose={onClose} onOpenFull={() => {}} /></>);

    const dialog = screen.getByRole("dialog", { name: "Tasks" });
    const close = screen.getByRole("button", { name: "Close Tasks panel" });
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Task composer" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Open full Tasks page" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Task composer" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
