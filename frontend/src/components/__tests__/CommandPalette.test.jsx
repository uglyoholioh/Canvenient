// Tests for the command palette: open/close, item filtering, and keyboard actions.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommandPalette from "../CommandPalette";

function renderPalette(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <CommandPalette isOpen onClose={() => {}} {...props} />
    </MemoryRouter>
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while closed", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <CommandPalette isOpen={false} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows navigation and canvas sync actions when open", () => {
    renderPalette();
    expect(screen.getByText("Go to Today Hub")).toBeInTheDocument();
    expect(screen.getByText("Go to Canvas Hub")).toBeInTheDocument();
    expect(screen.getByText(/Refresh & Sync Canvas/)).toBeInTheDocument();
  });

  it("filters items by query and offers a custom task action", () => {
    renderPalette({ onQuickCreateTask: vi.fn() });
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.change(input, { target: { value: "canvas" } });

    expect(screen.getByText("Go to Canvas Hub")).toBeInTheDocument();
    expect(screen.queryByText("Go to Today Hub")).not.toBeInTheDocument();
    expect(screen.getByText('Create task "canvas"')).toBeInTheDocument();
  });

  it("runs the create action with the typed query on Enter", () => {
    const onQuickCreateTask = vi.fn();
    renderPalette({ onQuickCreateTask });
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.change(input, { target: { value: "finish lab report" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onQuickCreateTask).toHaveBeenCalledWith("finish lab report");
  });

  it("Escape closes the palette", () => {
    const onClose = vi.fn();
    renderPalette({ onClose });
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
