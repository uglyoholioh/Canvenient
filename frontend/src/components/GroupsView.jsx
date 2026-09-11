import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Users, UserPlus, Plus, Calendar, CheckSquare,
  FileText, Copy, Check, ChevronLeft, X, Clock, MapPin, Flag, Trash2
} from "lucide-react";
import {
  getGroups, createGroup, getGroupMembers, createInvite, joinGroup,
  getTasks, createTask, updateTask, deleteTask,
  getEvents, getForms
} from "../api";
import { notifyTasksChanged } from "../taskEvents";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";

function getInitials(name, email) {
  const src = (name && name.trim()) ? name.trim() : (email || "");
  return src.slice(0, 2).toUpperCase() || "?";
}

function fmtDate(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function GroupsView({ token, currentUser }) {
  const copiedTimerRef = useRef(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeTab, setActiveTab] = useState("tasks");

  // Group creation modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  // Invite code join
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");

  // Active group data
  const [groupTasks, setGroupTasks] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [groupForms, setGroupForms] = useState([]);

  // Group task creation modal
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState("all");

  // Invite link generation
  const [generatedInvite, setGeneratedInvite] = useState("");
  const [copied, setCopied] = useState(false);

  // Load user groups
  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getGroups(token);
      setGroups(data || []);
    } catch (err) {
      setError(err.message || "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the async groups fetch; loading state must apply immediately
    loadGroups();
  }, [loadGroups]);

  // Load details for the active group
  const loadGroupDetails = useCallback(async (groupId) => {
    if (!groupId) return;
    try {
      const [membersData, tasksData, eventsData, formsData] = await Promise.all([
        getGroupMembers(token, groupId).catch(() => []),
        getTasks(token, { groupId }).catch(() => []),
        getEvents(token).catch(() => []),
        getForms(token).catch(() => [])
      ]);
      setGroupMembers(membersData || []);
      setGroupTasks(tasksData || []);
      setGroupEvents((eventsData || []).filter(e => e.g_id === groupId));
      setGroupForms((formsData || []).filter(f => f.g_id === groupId));
    } catch (err) {
      setError(err.message || "Failed to load group details.");
    }
  }, [token]);

  useEffect(() => {
    if (activeGroup?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the async group-details fetches
      loadGroupDetails(activeGroup.id);
    }
  }, [activeGroup?.id, loadGroupDetails]);

  // Register macOS workspace toolbar
  const toolbarConfig = useMemo(() => ({
    title: activeGroup ? activeGroup.name : "Groups & Teams",
    subtitle: activeGroup ? `${groupMembers.length} members · ${groupTasks.length} tasks` : `${groups.length} groups`,
    actions: activeGroup ? (
      <button
        type="button"
        className="mac-toolbar-action"
        onClick={() => setShowNewTaskModal(true)}
      >
        <Plus size={14} /> New Task
      </button>
    ) : (
      <button
        type="button"
        className="mac-toolbar-action"
        onClick={() => setShowCreateGroup(true)}
      >
        <Plus size={14} /> New Group
      </button>
    )
  }), [activeGroup, groupMembers.length, groupTasks.length, groups.length]);
  useWorkspaceToolbar(toolbarConfig, true);

  // Join group by code
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setIsJoining(true);
    setJoinMessage("");
    try {
      await joinGroup(token, joinCode.trim());
      setJoinCode("");
      setJoinMessage("Successfully joined group!");
      await loadGroups();
    } catch (err) {
      setJoinMessage(`Error: ${err.message || "Invalid invite code"}`);
    } finally {
      setIsJoining(false);
    }
  };

  // Create new group
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const newGrp = await createGroup(token, {
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        c_id: null
      });
      setShowCreateGroup(false);
      setNewGroupName("");
      setNewGroupDesc("");
      await loadGroups();
      setActiveGroup(newGrp);
      setActiveTab("tasks");
    } catch (err) {
      setError(err.message || "Failed to create group.");
    }
  };

  // Generate invite code
  const handleGenerateInvite = async () => {
    if (!activeGroup) return;
    try {
      const res = await createInvite(token, { g_id: activeGroup.id });
      setGeneratedInvite(res.code);
      setCopied(false);
    } catch (err) {
      setError(err.message || "Failed to generate invite code.");
    }
  };

  const handleCopyInvite = () => {
    if (!generatedInvite) return;
    navigator.clipboard.writeText(generatedInvite);
    setCopied(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  // Create group task
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim() || !activeGroup) return;
    setIsSavingTask(true);
    try {
      const payload = {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        priority_manual: taskPriority,
        group_id: activeGroup.id,
        assignee_id: taskAssignee ? Number(taskAssignee) : null,
        due_at_override: taskDueDate ? new Date(taskDueDate).toISOString() : null
      };
      await createTask(token, payload);
      setShowNewTaskModal(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskPriority("medium");
      setTaskDueDate("");
      setTaskAssignee("");
      await loadGroupDetails(activeGroup.id);
      notifyTasksChanged();
    } catch (err) {
      setError(err.message || "Failed to create task.");
    } finally {
      setIsSavingTask(false);
    }
  };

  // Toggle group task status
  const handleToggleTaskStatus = async (task) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateTask(token, task.id, { status: nextStatus });
      setGroupTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
      notifyTasksChanged();
    } catch (err) {
      setError(err.message || "Failed to update task.");
    }
  };

  // Delete group task
  const handleDeleteTask = async (taskId) => {
    try {
      await deleteTask(token, taskId);
      setGroupTasks(prev => prev.filter(t => t.id !== taskId));
      notifyTasksChanged();
    } catch (err) {
      setError(err.message || "Failed to delete task.");
    }
  };

  // Filtered group tasks
  const filteredTasks = groupTasks.filter(t => {
    if (taskFilter === "todo") return t.status !== "done";
    if (taskFilter === "done") return t.status === "done";
    if (taskFilter === "assigned_to_me") return t.assignee_id === currentUser?.id;
    if (taskFilter === "unassigned") return !t.assignee_id;
    return true;
  });

  return (
    <div className="groups-container" style={{ padding: "24px 32px", maxWidth: "1100px", margin: "0 auto" }}>
      {error && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", borderRadius: "6px", background: "rgba(220, 53, 69, 0.15)", border: "1px solid rgba(220, 53, 69, 0.3)", color: "var(--error)", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {!activeGroup ? (
        /* GROUPS LIST VIEW */
        <div>
          {/* Join Code & Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 6px" }}>Your Teams & Study Groups</h2>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                Collaborate on module projects, share task lists, and track progress together.
              </p>
            </div>

            <form onSubmit={handleJoin} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Enter 8-char invite code"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                style={{
                  padding: "7px 12px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border, rgba(255,255,255,0.15))",
                  background: "var(--color-mac-control, rgba(255,255,255,0.06))",
                  color: "inherit",
                  width: "180px"
                }}
              />
              <button
                type="submit"
                disabled={isJoining || !joinCode.trim()}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "6px",
                  border: "1px solid var(--border, rgba(255,255,255,0.15))",
                  background: "var(--color-mac-control, rgba(255,255,255,0.1))",
                  color: "inherit",
                  cursor: "pointer"
                }}
              >
                Join
              </button>
            </form>
          </div>

          {joinMessage && (
            <div style={{ marginBottom: "16px", fontSize: "12px", color: joinMessage.startsWith("Error") ? "var(--error)" : "var(--success)" }}>
              {joinMessage}
            </div>
          )}

          {/* Groups Grid */}
          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>Loading groups...</div>
          ) : groups.length === 0 ? (
            <div style={{
              padding: "48px 24px",
              textAlign: "center",
              borderRadius: "8px",
              border: "1px dashed var(--border, rgba(255,255,255,0.15))",
              background: "var(--color-mac-control, rgba(255,255,255,0.02))"
            }}>
              <Users size={36} style={{ opacity: 0.4, marginBottom: "12px" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>No groups yet</h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px" }}>
                Create a group for your project team, or enter an invite code from a classmate.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "6px",
                  background: "var(--accent)",
                  color: "var(--text-inverse)",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                + Create First Group
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
              {groups.map(grp => (
                <div
                  key={grp.id}
                  onClick={() => { setActiveGroup(grp); setActiveTab("tasks"); }}
                  style={{
                    padding: "16px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--border, rgba(255,255,255,0.1))",
                    background: "var(--color-mac-control, rgba(255,255,255,0.03))",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "border-color 150ms ease, background 150ms ease"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-hover, rgba(255,255,255,0.25))"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border, rgba(255,255,255,0.1))"}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{grp.name}</h3>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: grp.role === "admin" ? "rgba(47, 122, 114, 0.2)" : "rgba(255,255,255,0.08)",
                        color: grp.role === "admin" ? "var(--accent)" : "var(--text-muted)"
                      }}>
                        {grp.role || "member"}
                      </span>
                    </div>
                    {grp.description && (
                      <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                        {grp.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)", marginTop: "12px", borderTop: "1px solid var(--border, rgba(255,255,255,0.06))", paddingTop: "10px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Users size={12} /> Open Workspace
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE GROUP DETAIL VIEW */
        <div>
          {/* Top Breadcrumb & Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <button
              type="button"
              onClick={() => { setActiveGroup(null); setGeneratedInvite(""); }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "12px",
                cursor: "pointer",
                padding: "4px 0"
              }}
            >
              <ChevronLeft size={14} /> Back to Groups
            </button>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {generatedInvite ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--color-mac-control, rgba(255,255,255,0.08))", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                  <code style={{ fontWeight: 600, color: "var(--accent)" }}>{generatedInvite}</code>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    aria-label={copied ? "Invite code copied" : "Copy invite code"}
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "2px" }}
                    title="Copy code"
                  >
                    {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateInvite}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 10px",
                    fontSize: "11px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    border: "1px solid var(--border, rgba(255,255,255,0.12))",
                    background: "var(--color-mac-control, rgba(255,255,255,0.05))",
                    color: "inherit",
                    cursor: "pointer"
                  }}
                >
                  <UserPlus size={12} /> Invite Code
                </button>
              )}
            </div>
          </div>

          {/* Group Header */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 600 }}>{activeGroup.name}</h1>
              <span style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "2px 8px",
                borderRadius: "4px",
                background: activeGroup.role === "admin" ? "rgba(47, 122, 114, 0.2)" : "rgba(255,255,255,0.08)",
                color: activeGroup.role === "admin" ? "var(--accent)" : "var(--text-muted)"
              }}>
                {activeGroup.role || "member"}
              </span>
            </div>
            {activeGroup.description && (
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                {activeGroup.description}
              </p>
            )}
          </div>

          {/* Navigation Tabs */}
          <div role="tablist" aria-label="Group sections" style={{ display: "flex", gap: "6px", borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))", marginBottom: "20px", paddingBottom: "2px" }}>
            {[
              { key: "tasks", label: `Tasks (${groupTasks.length})`, icon: CheckSquare },
              { key: "members", label: `Members (${groupMembers.length})`, icon: Users },
              { key: "events", label: `Events (${groupEvents.length})`, icon: Calendar },
              { key: "forms", label: `Forms (${groupForms.length})`, icon: FileText }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 450,
                    color: isActive ? "var(--text-h)" : "var(--text-muted)",
                    border: "none",
                    borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    background: "transparent",
                    cursor: "pointer",
                    marginBottom: "-2px"
                  }}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: GROUP TASKS */}
          {activeTab === "tasks" && (
            <div>
              {/* Task Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  {[
                    { key: "all", label: "All" },
                    { key: "todo", label: "To Do" },
                    { key: "assigned_to_me", label: "Assigned to me" },
                    { key: "unassigned", label: "Unassigned" },
                    { key: "done", label: "Completed" }
                  ].map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setTaskFilter(f.key)}
                      style={{
                        padding: "3px 9px",
                        fontSize: "11px",
                        borderRadius: "5px",
                        border: "1px solid var(--border, rgba(255,255,255,0.1))",
                        background: taskFilter === f.key ? "var(--color-mac-control, rgba(255,255,255,0.15))" : "transparent",
                        color: taskFilter === f.key ? "var(--text-h)" : "var(--text-muted)",
                        cursor: "pointer"
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    background: "var(--accent)",
                    color: "var(--text-inverse)",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  <Plus size={13} /> Add Task
                </button>
              </div>

              {/* Tasks List */}
              {filteredTasks.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  No tasks match the selected filter.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {filteredTasks.map(t => {
                    const isDone = t.status === "done";
                    return (
                      <div
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                          padding: "10px 14px",
                          borderRadius: "6px",
                          border: "1px solid var(--border, rgba(255,255,255,0.08))",
                          background: "var(--color-mac-control, rgba(255,255,255,0.02))",
                          opacity: isDone ? 0.6 : 1
                        }}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => handleToggleTaskStatus(t)}
                          style={{
                            marginTop: "2px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "4px",
                            border: `1px solid ${isDone ? "var(--accent)" : "var(--border)"}`,
                            background: isDone ? "var(--accent)" : "transparent",
                            color: "var(--text-inverse)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            padding: 0,
                            flexShrink: 0
                          }}
                        >
                          {isDone && <Check size={11} strokeWidth={3} />}
                        </button>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 500, textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--text-muted)" : "inherit" }}>
                            {t.title}
                          </div>
                          {t.description && (
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.3 }}>
                              {t.description}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "6px", fontSize: "11px", color: "var(--text-muted)" }}>
                            {t.priority_manual && (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                textTransform: "uppercase",
                                fontWeight: 600,
                                fontSize: "10px",
                                color: t.priority_manual === "urgent" ? "var(--error)" : t.priority_manual === "high" ? "var(--warning)" : "var(--text)"
                              }}>
                                <Flag size={10} /> {t.priority_manual}
                              </span>
                            )}
                            {t.due_at_override && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                <Calendar size={10} /> {fmtDate(t.due_at_override)}
                              </span>
                            )}
                            {t.assignee_name ? (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "var(--color-mac-control, rgba(255,255,255,0.08))",
                                color: t.assignee_id === currentUser?.id ? "var(--accent)" : "inherit"
                              }}>
                                👤 {t.assignee_id === currentUser?.id ? "Assigned to you" : t.assignee_name}
                              </span>
                            ) : (
                              <span style={{ opacity: 0.6 }}>Unassigned</span>
                            )}
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(t.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: "4px",
                            opacity: 0.5,
                            flexShrink: 0
                          }}
                          title="Delete task"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MEMBERS */}
          {activeTab === "members" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
                {groupMembers.map(m => (
                  <div
                    key={m.user_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--border, rgba(255,255,255,0.08))",
                      background: "var(--color-mac-control, rgba(255,255,255,0.02))"
                    }}
                  >
                    <div style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "var(--color-mac-control, rgba(255,255,255,0.12))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 600
                    }}>
                      {getInitials(m.name, m.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.name || m.email}
                        {m.user_id === currentUser?.id && <span style={{ opacity: 0.5, fontSize: "11px", marginLeft: "4px" }}>(you)</span>}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.email}
                      </div>
                    </div>
                    <span style={{
                      fontSize: "9px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: m.role === "admin" ? "rgba(47, 122, 114, 0.2)" : "rgba(255,255,255,0.06)",
                      color: m.role === "admin" ? "var(--accent)" : "var(--text-muted)"
                    }}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: EVENTS */}
          {activeTab === "events" && (
            <div>
              {groupEvents.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  No events scheduled for this group.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {groupEvents.map(e => (
                    <div
                      key={e.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "6px",
                        border: "1px solid var(--border, rgba(255,255,255,0.08))",
                        background: "var(--color-mac-control, rgba(255,255,255,0.02))"
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{e.title}</div>
                      {e.description && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{e.description}</div>}
                      <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Calendar size={11} /> {fmtDate(e.start_at)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Clock size={11} /> {fmtTime(e.start_at)}</span>
                        {e.venue && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><MapPin size={11} /> {e.venue}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FORMS */}
          {activeTab === "forms" && (
            <div>
              {groupForms.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  No active forms or polls for this group.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {groupForms.map(f => (
                    <div
                      key={f.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "6px",
                        border: "1px solid var(--border, rgba(255,255,255,0.08))",
                        background: "var(--color-mac-control, rgba(255,255,255,0.02))"
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{f.title}</div>
                      {f.description && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{f.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE GROUP MODAL */}
      {showCreateGroup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: "10px", width: "100%", maxWidth: "420px", padding: "20px", boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Create New Group</h3>
              <button type="button" aria-label="Close" onClick={() => setShowCreateGroup(false)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateGroup} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Group Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS2103T Team Project"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Description</label>
                <textarea
                  placeholder="What is this group for?"
                  rows={3}
                  value={newGroupDesc}
                  onChange={e => setNewGroupDesc(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit", resize: "none" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowCreateGroup(false)} style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px", background: "transparent", border: "1px solid var(--border, rgba(255,255,255,0.15))", color: "inherit", cursor: "pointer" }}>Cancel</button>
                <button type="submit" style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 500, borderRadius: "6px", background: "var(--accent)", border: "none", color: "var(--text-inverse)", cursor: "pointer" }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE GROUP TASK MODAL */}
      {showNewTaskModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: "10px", width: "100%", maxWidth: "460px", padding: "20px", boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>New Group Task</h3>
              <button type="button" aria-label="Close" onClick={() => setShowNewTaskModal(false)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateTask} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Title *</label>
                <input
                  type="text"
                  required
                  placeholder="Task title"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Description</label>
                <textarea
                  placeholder="Additional details or notes"
                  rows={2}
                  value={taskDesc}
                  onChange={e => setTaskDesc(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit", resize: "none" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={e => setTaskAssignee(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit" }}
                  >
                    <option value="">Unassigned</option>
                    {groupMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name || m.email} {m.user_id === currentUser?.id ? "(You)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Priority</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit" }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "var(--text-muted)" }}>Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--border, rgba(255,255,255,0.15))", background: "var(--color-mac-control, rgba(255,255,255,0.06))", color: "inherit" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowNewTaskModal(false)} style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px", background: "transparent", border: "1px solid var(--border, rgba(255,255,255,0.15))", color: "inherit", cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={isSavingTask} style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 500, borderRadius: "6px", background: "var(--accent)", border: "none", color: "var(--text-inverse)", cursor: "pointer" }}>
                  {isSavingTask ? "Saving..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
