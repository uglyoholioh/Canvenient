// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceLayout from "../WorkspaceLayout";

vi.mock("../Dashboard", () => ({ default: () => <button type="button">Dashboard content</button> }));
vi.mock("../TaskView", () => ({ default: ({ embedded, composerAutoFocus }) => <div>Tasks content{embedded && <textarea autoFocus={composerAutoFocus} aria-label="Panel task composer" />}</div> }));
vi.mock("../Schedule", () => ({ default: () => <div>Schedule content</div> }));
vi.mock("../SettingsView", () => ({ default: () => <div>Settings content</div> }));
vi.mock("../CanvasView", () => ({ default: () => <div>Canvas content</div> }));
vi.mock("../NotesView", () => ({ default: () => <div>Notes content</div> }));
vi.mock("../MarkdownEditor", () => ({ default: () => <div>Editor content</div> }));
vi.mock("../Omnibar", () => ({ default: () => <div>Search content</div> }));
vi.mock("../../api", () => ({
  createNote: vi.fn(),
  createTask: vi.fn(),
  getAcademicModules: vi.fn(() => new Promise(() => {})),
}));

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

  it("opens the Tasks panel at its composer without changing views", async () => {
    render(<WorkspaceLayout token="token" user={{ id: 1 }} onLogout={() => {}} />);

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    expect(screen.getByRole("dialog", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Panel task composer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("opens and closes the Tasks panel with Shift+Tab without leaking focus to the dashboard", async () => {
    render(<WorkspaceLayout token="token" user={{ id: 1 }} onLogout={() => {}} />);
    const dashboardCard = screen.getByRole("button", { name: "Dashboard content" });
    dashboardCard.focus();

    fireEvent.keyDown(dashboardCard, { key: "Tab", shiftKey: true });

    expect(screen.getByRole("dialog", { name: "Tasks" })).toBeInTheDocument();

    const composer = screen.getByRole("textbox", { name: "Panel task composer" });
    await waitFor(() => expect(composer).toHaveFocus());
    fireEvent.keyDown(composer, { key: "Tab", shiftKey: true });

    expect(screen.queryByRole("dialog", { name: "Tasks" })).not.toBeInTheDocument();
    await waitFor(() => expect(dashboardCard).toHaveFocus());
  });

  it("closes the Tasks panel when Escape leaves a current control", () => {
    render(<WorkspaceLayout token="token" user={{ id: 1 }} onLogout={() => {}} />);
    const dashboardCard = screen.getByRole("button", { name: "Dashboard content" });
    dashboardCard.focus();
    fireEvent.keyDown(dashboardCard, { key: "Tab", shiftKey: true });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Panel task composer" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Tasks" })).not.toBeInTheDocument();
  });
});
