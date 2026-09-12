// React is required by the test JSX transform.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksModule from "../TasksModule";
import { createTask, getTasks, updateTask } from "../../../api";

vi.mock("../../../api", () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getAcademicModules: vi.fn().mockResolvedValue([]),
  getTasks: vi.fn(),
  updateTask: vi.fn(),
}));

describe("TasksModule controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTasks.mockResolvedValue([
      { id: 7, title: "Read chapter", status: "todo", created_at: "2026-09-01T10:00:00Z" },
    ]);
    updateTask.mockResolvedValue({
      id: 7,
      title: "Read chapter two",
      status: "todo",
      created_at: "2026-09-01T10:00:00Z",
    });
    createTask.mockResolvedValue({
      id: 9,
      title: "New assignment",
      status: "todo",
      created_at: "2026-09-01T10:05:00Z",
    });
  });

  it("opens and saves an editor when edit button is clicked, then restores row focus", async () => {
    const user = userEvent.setup();
    render(<TasksModule token="token" />);
    const editBtn = await screen.findByRole("button", { name: /^Edit Read chapter/ });
    fireEvent.click(editBtn);
    const title = await screen.findByLabelText("Task title");
    await waitFor(() => expect(title).toHaveFocus());
    fireEvent.change(title, { target: { value: "Read chapter two" } });
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        "token",
        7,
        expect.objectContaining({ title: "Read chapter two" }),
      ),
    );
    const task = screen.getByRole("button", { name: /^Read chapter/ });
    await waitFor(() => expect(task).toHaveFocus());
  });

  it("opens external url on task click when external_url exists", async () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    getTasks.mockResolvedValue([
      {
        id: 8,
        title: "Online quiz",
        external_url: "https://canvas.test/quiz",
        status: "todo",
        created_at: "2026-09-01T10:00:00Z",
      },
    ]);
    render(<TasksModule token="token" />);
    const task = await screen.findByRole("button", { name: /^Online quiz/ });
    fireEvent.click(task);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      "https://canvas.test/quiz",
      "_blank",
      "noopener,noreferrer",
    );
    windowOpenSpy.mockRestore();
  });

  it("supports roving filter tabs and cancels an editor with Escape", async () => {
    render(<TasksModule token="token" />);
    const all = screen.getByRole("tab", { name: "all" });
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "today" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("tab", { name: "today" }), { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "all" })).toHaveFocus());

    const editBtn = await screen.findByRole("button", { name: /^Edit Read chapter/ });
    fireEvent.click(editBtn);
    fireEvent.keyDown(screen.getByLabelText("Task title"), { key: "Escape" });
    expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Read chapter/ })).toHaveFocus(),
    );
  });

  it("starts next-line entry on click, creates task on Enter and stays active for rapid entry", async () => {
    render(<TasksModule token="token" />);
    await screen.findByRole("button", { name: /^Read chapter/ });

    const nextLine = screen.getByRole("button", { name: "Add task" });
    expect(nextLine).toBeInTheDocument();

    fireEvent.click(nextLine);
    const input = await screen.findByLabelText("New task title");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "New assignment" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith("token", {
        title: "New assignment",
        status: "todo",
        priority_manual: "medium",
      }),
    );

    // Stays active with cleared input for the next entry
    expect(input).toHaveValue("");
    expect(screen.getByLabelText("New task title")).toBeInTheDocument();

    // Escape closes the active entry
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("New task title")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });
});
