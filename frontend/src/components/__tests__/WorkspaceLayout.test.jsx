// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceLayout from "../WorkspaceLayout";

vi.mock("../Dashboard", () => ({ default: () => <div>Dashboard content</div> }));
vi.mock("../TaskView", () => ({ default: () => <div>Tasks content</div> }));
vi.mock("../Schedule", () => ({ default: () => <div>Schedule content</div> }));
vi.mock("../SettingsView", () => ({ default: () => <div>Settings content</div> }));
vi.mock("../CanvasView", () => ({ default: () => <div>Canvas content</div> }));
vi.mock("../NotesView", () => ({ default: () => <div>Notes content</div> }));
vi.mock("../MarkdownEditor", () => ({ default: () => <div>Editor content</div> }));
vi.mock("../Omnibar", () => ({ default: () => <div>Search content</div> }));

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: vi.fn(),
        getItem: vi.fn(() => null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
  });

  it("uses source-list navigation and renders the selected view once", () => {
    render(<WorkspaceLayout token="token" user={{ id: 1 }} onLogout={() => {}} />);

    expect(screen.getByRole("navigation", { name: "Workspace views" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getAllByText("Schedule content")).toHaveLength(1);
    expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-active-view", "schedule");
  });

  it("moves through sidebar rows with arrow keys", () => {
    render(<WorkspaceLayout token="token" user={{ id: 1 }} onLogout={() => {}} />);

    const dashboard = screen.getByRole("button", { name: "Dashboard" });
    const tasks = screen.getByRole("button", { name: "Tasks" });
    dashboard.focus();
    fireEvent.keyDown(dashboard, { key: "ArrowDown" });

    expect(tasks).toHaveFocus();
  });
});
