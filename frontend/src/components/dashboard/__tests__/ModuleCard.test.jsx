import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ModuleCard from "../ModuleCard";

function TestIcon() {
  return React.createElement("span", { "aria-hidden": "true" });
}

describe("ModuleCard resizing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.elementFromPoint;
  });

  it("hides section titles and only renders an open text button when onViewFull is provided", () => {
    const onViewFull = vi.fn();
    const { container, rerender } = render(
      <ModuleCard moduleId="tasks" title="Tasks" onViewFull={onViewFull}>
        <span>Module content</span>
      </ModuleCard>,
    );

    expect(container.querySelector(".module-heading")).not.toBeInTheDocument();
    const openButton = screen.getByRole("button", { name: "Open tasks" });
    expect(openButton).toHaveTextContent("Open tasks");
    fireEvent.click(openButton);
    expect(onViewFull).toHaveBeenCalledOnce();

    rerender(
      <ModuleCard moduleId="isb" title="NUS ISB">
        <span>Bus timings</span>
      </ModuleCard>,
    );
    expect(screen.queryByRole("button", { name: /Open/i })).not.toBeInTheDocument();
  });

  it("moves a shared row boundary continuously so the card above stretches", () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const { container } = render(
      <div className="dashboard-grid is-focus">
        <ModuleCard
          moduleId="notes"
          icon={TestIcon}
          title="Notes"
          editing
          size={{ columns: 1, rows: 1 }}
          onResizePreview={onResizePreview}
          onResizeCommit={onResizeCommit}
          onToggle={() => {}}
        >
          Notes
        </ModuleCard>
      </div>,
    );
    const grid = container.querySelector(".dashboard-grid");
    const card = container.querySelector(".dashboard-module");
    const handle = screen.getByRole("button", { name: "Resize Notes from top" });
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    card.getBoundingClientRect = () => ({ left: 600, top: 300, width: 200, height: 150 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      gridTemplateColumns: "200px 200px 200px 200px",
      gridTemplateRows: "150px 150px 150px 150px",
    });

    fireEvent.mouseDown(handle, { button: 0, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 700, clientY: 350 });

    expect(onResizePreview).toHaveBeenLastCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [150, 200, 100, 150],
    });
    expect(onResizeCommit).not.toHaveBeenCalled();

    fireEvent.mouseUp(window, { clientX: 700, clientY: 350 });
    expect(onResizeCommit).toHaveBeenCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [150, 200, 100, 150],
    });
  });

  it("expands a bottom row without shrinking the row below", () => {
    const onResizeCommit = vi.fn();
    const { container } = render(
      <div className="dashboard-grid is-custom">
        <ModuleCard
          moduleId="schedule"
          icon={TestIcon}
          title="Schedule"
          editing
          size={{ columns: 1, rows: 1 }}
          onResizeCommit={onResizeCommit}
          onToggle={() => {}}
        >
          Schedule
        </ModuleCard>
      </div>,
    );
    const grid = container.querySelector(".dashboard-grid");
    const card = container.querySelector(".dashboard-module");
    const handle = screen.getByRole("button", { name: "Resize Schedule from bottom" });
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    card.getBoundingClientRect = () => ({ left: 600, top: 0, width: 200, height: 150 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      gridTemplateColumns: "200px 200px 200px 200px",
      gridTemplateRows: "150px 150px 150px 150px",
    });

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(onResizeCommit).toHaveBeenCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [166, 150, 150, 150],
    });
  });

  it("allows an outer bottom edge to lengthen the whole dashboard", () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const { container } = render(
      <div className="dashboard-grid is-custom">
        <ModuleCard
          moduleId="tasks"
          icon={TestIcon}
          title="Tasks"
          editing
          size={{ columns: 3, rows: 4 }}
          onResizePreview={onResizePreview}
          onResizeCommit={onResizeCommit}
          onToggle={() => {}}
        >
          Tasks
        </ModuleCard>
      </div>,
    );
    const grid = container.querySelector(".dashboard-grid");
    const card = container.querySelector(".dashboard-module");
    const handle = screen.getByRole("button", { name: "Resize Tasks from bottom" });
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 600 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      gridTemplateColumns: "200px 200px 200px 200px",
      gridTemplateRows: "150px 150px 150px 150px",
    });

    fireEvent.mouseDown(handle, { button: 0, clientX: 300, clientY: 600 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 700 });

    expect(onResizePreview).toHaveBeenLastCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [150, 150, 150, 250],
    });

    fireEvent.mouseUp(window, { clientX: 300, clientY: 700 });
    expect(onResizeCommit).toHaveBeenCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [150, 150, 150, 250],
    });
  });

  it("keeps the opposite edge anchored when resizing from the left", () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const { container } = render(
      <div className="dashboard-grid is-custom">
        <ModuleCard
          moduleId="tasks"
          icon={TestIcon}
          title="Tasks"
          editing
          size={{ columns: 2, rows: 2 }}
          onResizePreview={onResizePreview}
          onResizeCommit={onResizeCommit}
          onToggle={() => {}}
        >
          Tasks
        </ModuleCard>
      </div>,
    );
    const grid = container.querySelector(".dashboard-grid");
    const card = container.querySelector(".dashboard-module");
    const handle = screen.getByRole("button", { name: "Resize Tasks from left" });
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    card.getBoundingClientRect = () => ({ left: 200, top: 0, width: 400, height: 300 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      gridTemplateColumns: "200px 200px 200px 200px",
      gridTemplateRows: "150px 150px 150px 150px",
    });

    fireEvent.mouseDown(handle, { button: 0, clientX: 200, clientY: 150 });
    fireEvent.mouseMove(window, { clientX: 80, clientY: 150 });

    expect(onResizePreview).toHaveBeenLastCalledWith({
      columns: [0.12, 0.38, 0.25, 0.25],
      rows: [150, 150, 150, 150],
    });

    fireEvent.mouseUp(window, { clientX: 80, clientY: 150 });
    expect(onResizeCommit).toHaveBeenCalledWith({
      columns: [0.12, 0.38, 0.25, 0.25],
      rows: [150, 150, 150, 150],
    });
  });

  it("slides Notes down while preserving its row and stretching Canvas above", () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const onDragStart = vi.fn();
    const { container } = render(
      <div className="dashboard-grid is-custom">
        <ModuleCard
          moduleId="notes"
          icon={TestIcon}
          title="Notes"
          editing
          size={{ columns: 1, rows: 1 }}
          onResizePreview={onResizePreview}
          onResizeCommit={onResizeCommit}
          onDragStart={onDragStart}
          onToggle={() => {}}
        >
          Notes
        </ModuleCard>
      </div>,
    );
    const grid = container.querySelector(".dashboard-grid");
    const card = container.querySelector(".dashboard-module");
    const handle = screen.getByRole("button", { name: "Drag Notes to move or reorder" });
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    card.getBoundingClientRect = () => ({ left: 600, top: 300, width: 200, height: 150 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      gridTemplateColumns: "200px 200px 200px 200px",
      gridTemplateRows: "150px 150px 150px 150px",
    });

    fireEvent.mouseDown(handle, { button: 0, clientX: 700, clientY: 318 });
    fireEvent.mouseMove(window, { clientX: 700, clientY: 368 });

    expect(onResizePreview).toHaveBeenLastCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [150, 200, 150, 100],
    });
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.mouseUp(window, { clientX: 700, clientY: 368 });
    expect(onResizeCommit).toHaveBeenCalledWith({
      columns: [0.25, 0.25, 0.25, 0.25],
      rows: [150, 200, 150, 100],
    });
  });

  it("reorders from the dedicated drag handle without native HTML drag", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onReorder = vi.fn();
    const { container } = render(
      <div>
        <ModuleCard
          moduleId="tasks"
          icon={TestIcon}
          title="Tasks"
          editing
          size={{ columns: 2, rows: 2 }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onReorder={onReorder}
          onToggle={() => {}}
        >
          Tasks
        </ModuleCard>
        <section className="dashboard-module" data-module="schedule" />
      </div>,
    );
    const target = container.querySelector('[data-module="schedule"]');
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Drag Tasks to move or reorder" }), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 40 });
    fireEvent.mouseUp(window, { clientX: 40, clientY: 40 });

    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith("schedule");
    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it("supports spatial browse commands and returns from card controls with Escape", () => {
    const onBrowseMove = vi.fn();
    const onQuickCapture = vi.fn();
    const { container } = render(
      <ModuleCard
        moduleId="tasks"
        icon={TestIcon}
        title="Tasks"
        browseActive
        onBrowseMove={onBrowseMove}
        onQuickCapture={onQuickCapture}
        onToggle={() => {}}
      >
        <button type="button">First task control</button>
      </ModuleCard>,
    );
    const card = container.querySelector(".dashboard-module");
    const control = screen.getByRole("button", { name: "First task control" });

    card.focus();
    fireEvent.keyDown(card, { key: "ArrowRight" });
    fireEvent.keyDown(card, { key: "n" });
    expect(onBrowseMove).toHaveBeenCalledWith("ArrowRight");
    expect(onQuickCapture).toHaveBeenCalledOnce();

    fireEvent.keyDown(card, { key: "Enter" });
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: "Escape" });
    expect(card).toHaveFocus();
  });

  it("lowers the hover button when content would be blocked", () => {
    const onViewFull = vi.fn();
    const { container } = render(
      <ModuleCard moduleId="tasks" title="Tasks" onViewFull={onViewFull}>
        <div className="task-module-item">
          <button type="button">Task 1</button>
        </div>
        <div className="task-module-item">
          <button type="button">Task 2</button>
        </div>
      </ModuleCard>,
    );

    const card = container.querySelector(".dashboard-module");
    const body = container.querySelector(".dashboard-module-body");
    const openButton = screen.getByRole("button", { name: "Open tasks" });

    // Mock bounding rects such that card bottom is 200, and last item bottom is 220
    // (meaning last item extends beyond card bottom and would be blocked by button at default top 160)
    card.getBoundingClientRect = () => ({
      top: 0,
      bottom: 200,
      height: 200,
      left: 0,
      right: 300,
      width: 300,
    });
    body.getBoundingClientRect = () => ({
      top: 0,
      bottom: 220,
      height: 220,
      left: 0,
      right: 300,
      width: 300,
    });

    const items = container.querySelectorAll(".task-module-item button");
    items[0].getBoundingClientRect = () => ({ top: 10, bottom: 60, height: 50, width: 280, left: 10, right: 290 });
    items[1].getBoundingClientRect = () => ({ top: 70, bottom: 220, height: 150, width: 280, left: 10, right: 290 });

    fireEvent.mouseEnter(card);

    expect(openButton).toHaveClass("is-lowered");
    // maxBottom (220) - cardRect.top (0) + 8 = 228
    expect(openButton.style.top).toBe("228px");
    expect(openButton.style.bottom).toBe("auto");
  });

  it("keeps default position when content does not block the hover button", () => {
    const onViewFull = vi.fn();
    const { container } = render(
      <ModuleCard moduleId="tasks" title="Tasks" onViewFull={onViewFull}>
        <div className="task-module-item">
          <button type="button">Task 1</button>
        </div>
      </ModuleCard>,
    );

    const card = container.querySelector(".dashboard-module");
    const body = container.querySelector(".dashboard-module-body");
    const openButton = screen.getByRole("button", { name: "Open tasks" });

    // Card height 500, content only reaches y = 100
    card.getBoundingClientRect = () => ({
      top: 0,
      bottom: 500,
      height: 500,
      left: 0,
      right: 300,
      width: 300,
    });
    body.getBoundingClientRect = () => ({
      top: 0,
      bottom: 100,
      height: 100,
      left: 0,
      right: 300,
      width: 300,
    });

    const item = container.querySelector(".task-module-item button");
    item.getBoundingClientRect = () => ({ top: 10, bottom: 60, height: 50, width: 280, left: 10, right: 290 });

    fireEvent.mouseEnter(card);

    expect(openButton).not.toHaveClass("is-lowered");
    expect(openButton.style.top).toBe("");
  });
});
