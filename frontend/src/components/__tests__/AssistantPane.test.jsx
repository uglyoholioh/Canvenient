// React is required by the test JSX transform.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantPane from "../AssistantPane";
import { assistantChat, createTask } from "../../api";

vi.mock("../../api", () => ({
  assistantChat: vi.fn(),
  createTask: vi.fn(),
}));

describe("AssistantPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTask.mockResolvedValue({ id: 12, title: "Review slides", status: "todo" });
  });

  it("shows example prompts and sends the first turn", async () => {
    assistantChat.mockResolvedValue({
      reply: "You have one class and one deadline today.",
      resources: [{ type: "view", id: null, label: "schedule" }],
      actions: [{ kind: "create_task", title: "Review slides", due_at: "2026-09-14 17:00", priority: "high" }],
    });
    render(<AssistantPane token="token" onClose={() => {}} onOpenResource={() => {}} />);

    expect(screen.getByText(/What's on my plate today?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What's on my plate today?" }));

    await waitFor(() => expect(assistantChat).toHaveBeenCalledWith("token", {
      messages: [{ role: "user", content: "What's on my plate today?" }],
      attachment: null,
    }));
    expect(await screen.findByText(/one class and one deadline today/i)).toBeInTheDocument();
  });

  it("renders resource chips and confirm-gates task actions", async () => {
    assistantChat.mockResolvedValue({
      reply: "Found the slides.",
      resources: [{ type: "note", id: 7, label: "Lecture notes" }],
      actions: [{ kind: "create_task", title: "Review slides", due_at: "2026-09-14 17:00", priority: "high" }],
    });
    const onOpenResource = vi.fn();
    render(<AssistantPane token="token" onClose={() => {}} onOpenResource={onOpenResource} />);

    fireEvent.change(screen.getByPlaceholderText(/Ask, find, or organise/), { target: { value: "where are the slides?" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Ask, find, or organise/), { key: "Enter" });

    const chip = await screen.findByRole("button", { name: "Lecture notes" });
    fireEvent.click(chip);
    expect(onOpenResource).toHaveBeenCalledWith({ type: "note", id: 7, label: "Lecture notes" });

    // Actions never run without an explicit confirm step.
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(createTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Confirm create task"));

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask).toHaveBeenCalledWith("token", expect.objectContaining({
      title: "Review slides",
      priority_manual: "high",
    }));
    expect(await screen.findByText("Added ✓")).toBeInTheDocument();
  });

  it("sends an attached resource with the conversation", async () => {
    assistantChat.mockResolvedValue({ reply: "It's about ISB routes.", resources: [], actions: [] });
    const attachment = { type: "note", id: 3, label: "Bus notes" };
    render(<AssistantPane token="token" onClose={() => {}} onOpenResource={() => {}} attachment={attachment} />);

    expect(screen.getByText("Bus notes")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Ask, find, or organise/), { target: { value: "summarise this" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Ask, find, or organise/), { key: "Enter" });

    await waitFor(() => expect(assistantChat).toHaveBeenCalledWith("token", {
      messages: [{ role: "user", content: "summarise this" }],
      attachment,
    }));
    expect(await screen.findByText(/ISB routes/i)).toBeInTheDocument();
  });
});
