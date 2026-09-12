import { act } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Dashboard from "../Dashboard";

vi.mock("../dashboard/TasksModule", () => ({
  default: () => <div data-testid="mock-tasks-module">Tasks Module Content</div>,
}));
vi.mock("../dashboard/ScheduleModule", () => ({
  default: () => <div data-testid="mock-schedule-module">Schedule Module Content</div>,
}));
vi.mock("../dashboard/CampusBusModule", () => ({
  default: () => <div data-testid="mock-isb-module">NUS ISB Module Content</div>,
}));
vi.mock("../dashboard/CanvasModule", () => ({
  default: () => <div data-testid="mock-canvas-module">Canvas Module Content</div>,
}));
vi.mock("../dashboard/NotesModule", () => ({
  default: () => <div data-testid="mock-notes-module">Notes Module Content</div>,
}));
vi.mock("../drawers/CanvasDrawer", () => ({
  default: () => <div data-testid="mock-canvas-drawer" />,
}));

describe("Dashboard module integration", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("renders Tasks, Schedule, Campus Bus (NUS ISB), and Canvas, but not Notes by default", async () => {
    await act(async () => {
      render(<Dashboard token="test-token" user={{ id: 1 }} onNavigate={vi.fn()} />);
    });

    expect(screen.getByTestId("mock-tasks-module")).toBeInTheDocument();
    expect(screen.getByTestId("mock-schedule-module")).toBeInTheDocument();
    expect(screen.getByTestId("mock-isb-module")).toBeInTheDocument();
    expect(screen.getByTestId("mock-canvas-module")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-notes-module")).not.toBeInTheDocument();
  });
});
