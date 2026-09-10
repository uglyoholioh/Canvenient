import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GroupsView from "../GroupsView";
import * as api from "../../api";
import { WorkspaceToolbarContext } from "../WorkspaceToolbarContext";

vi.mock("../../api", () => ({
  getGroups: vi.fn(),
  createGroup: vi.fn(),
  getGroupMembers: vi.fn(),
  createInvite: vi.fn(),
  joinGroup: vi.fn(),
  getTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getEvents: vi.fn(),
  createEvent: vi.fn(),
  getForms: vi.fn(),
  createForm: vi.fn(),
  getCommunities: vi.fn(),
}));

const mockSetToolbar = vi.fn();

function renderGroupsView(props = {}) {
  return render(
    <WorkspaceToolbarContext.Provider value={mockSetToolbar}>
      <GroupsView
        token="test-token"
        currentUser={{ id: 1, email: "user@test.com" }}
        {...props}
      />
    </WorkspaceToolbarContext.Provider>
  );
}

describe("GroupsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getGroups.mockResolvedValue([
      { id: 10, name: "CS2103T Team W14", description: "Software Engineering Project", role: "admin" },
      { id: 20, name: "Study Group Orbital", description: "Apollo level", role: "member" },
    ]);
    api.getGroupMembers.mockResolvedValue([
      { user_id: 1, name: "Alice", email: "alice@test.com", role: "admin" },
      { user_id: 2, name: "Bob", email: "bob@test.com", role: "member" },
    ]);
    api.getTasks.mockResolvedValue([
      { id: 101, title: "Design UI Architecture", status: "todo", priority_manual: "high", group_id: 10, group_name: "CS2103T Team W14", assignee_id: 2, assignee_name: "Bob" },
      { id: 102, title: "Backend API Auth", status: "done", priority_manual: "urgent", group_id: 10, group_name: "CS2103T Team W14", assignee_id: 1, assignee_name: "Alice" },
    ]);
    api.getEvents.mockResolvedValue([]);
    api.getForms.mockResolvedValue([]);
  });

  it("renders list of joined groups", async () => {
    renderGroupsView();
    expect(await screen.findByText("CS2103T Team W14")).toBeInTheDocument();
    expect(screen.getByText("Study Group Orbital")).toBeInTheDocument();
  });

  it("opens group detail and displays tasks tab with filterable group tasks", async () => {
    renderGroupsView();
    const groupCard = await screen.findByText("CS2103T Team W14");
    fireEvent.click(groupCard);

    expect(await screen.findByText("Design UI Architecture")).toBeInTheDocument();
    expect(screen.getByText("Backend API Auth")).toBeInTheDocument();
    expect(screen.getByText("👤 Bob")).toBeInTheDocument();
    expect(screen.getByText("👤 Assigned to you")).toBeInTheDocument();

    // Switch to Members tab (tabs expose the tab role for accessibility)
    const membersTab = screen.getByRole("tab", { name: /Members \(2\)/i });
    fireEvent.click(membersTab);
    expect(await screen.findByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });
});
