// Tests for the omnibar corpus cache: repeated keystrokes reuse one fetch,
// and a tasks-changed event invalidates the cache.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getNotes = vi.fn();
const getTasks = vi.fn();
vi.mock("../../api", () => ({
  getNotes: (...args) => getNotes(...args),
  getTasks: (...args) => getTasks(...args),
}));

import Omnibar, { invalidateOmnibarCorpus } from "../Omnibar";

describe("Omnibar corpus caching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateOmnibarCorpus();
    getNotes.mockResolvedValue([{ id: 1, title: "Lecture summary", content: "limit theorem" }]);
    getTasks.mockResolvedValue([{ id: 2, title: "Finish CS2103 lab", status: "todo" }]);
  });

  it("reuses the cached corpus across keystrokes instead of refetching", async () => {
    const { unmount } = render(<Omnibar token="t" onClose={() => {}} onNavigate={() => {}} />);
    // Mount warms the cache.
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText("Type a command or search notes...");
    fireEvent.change(input, { target: { value: "lab" } });
    await waitFor(() => expect(screen.getByText("Finish CS2103 lab")).toBeInTheDocument());
    fireEvent.change(input, { target: { value: "lab " } });
    await waitFor(() => expect(screen.getByText("Finish CS2103 lab")).toBeInTheDocument());

    // One mount fetch + cache hits afterwards; no per-keystroke refetch.
    expect(getTasks).toHaveBeenCalledTimes(1);
    expect(getNotes).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("refetches after the tasks-changed invalidation event", async () => {
    render(<Omnibar token="t" onClose={() => {}} onNavigate={() => {}} />);
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
    const input = screen.getByPlaceholderText("Type a command or search notes...");
    fireEvent.change(input, { target: { value: "lab" } });
    await waitFor(() => expect(screen.getByText("Finish CS2103 lab")).toBeInTheDocument());

    expect(getTasks).toHaveBeenCalledTimes(2);
    expect(getNotes).toHaveBeenCalledTimes(2);
  });
});
