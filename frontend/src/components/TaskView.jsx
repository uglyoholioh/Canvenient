import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Calendar, CheckCircle, Flag, Pencil, Plus, Trash2, Users } from "lucide-react";
import { getAcademicModules, getTasks, updateTask } from "../api";
import { notifyTasksChanged } from "../taskEvents";
import { queueTaskDeletion } from "../taskDeleteBuffer";
import { getTaskModuleColor } from "./scheduleUtils";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";
import TaskInputBar from "./TaskInputBar";

function normalizeDate(value) {
  if (!value) return null;
  const normalized =
    typeof value === "string" && !value.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDueDate(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).format(date);
}

function formatAddedAt(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function duePartsValue(value) {
  const date = normalizeDate(value);
  if (!date) return { day: "", month: "", year: "", hour: "", minute: "" };
  const part = (number) => String(number).padStart(2, "0");
  return {
    day: part(date.getDate()),
    month: part(date.getMonth() + 1),
    year: String(date.getFullYear()),
    hour: part(date.getHours()),
    minute: part(date.getMinutes()),
  };
}

function taskDueDate(task) {
  return normalizeDate(task?.effective_due_at || task?.due_at_override || task?.source_due_at);
}

function taskCreatedTime(task) {
  const date = normalizeDate(task?.created_at);
  return date?.getTime() ?? 0;
}

function sortPendingTasks(data) {
  return (data || [])
    .filter((task) => task && task.status !== "done")
    .sort((a, b) => {
      const aDue = taskDueDate(a)?.getTime() ?? Infinity;
      const bDue = taskDueDate(b)?.getTime() ?? Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return taskCreatedTime(b) - taskCreatedTime(a);
    });
}

function visiblePriority(task) {
  const manualPriority = task?.priority_manual || "medium";
  if (manualPriority !== "medium") return manualPriority;
  return ["urgent", "high"].includes(task?.recommended_priority) ? task.recommended_priority : null;
}

function priorityColor(priority) {
  if (priority === "urgent") return "var(--danger)";
  if (priority === "high") return "var(--warning)";
  if (priority === "medium") return "var(--accent)";
  return "var(--text-muted)";
}

export default function TaskView({
  token,
  user,
  groupId = null,
  embedded = false,
  active = true,
  composerAutoFocus = false,
  composerFocusRequestScope,
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modules, setModules] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [interactionMode, setInteractionMode] = useState("keyboard");
  const [editingId, setEditingId] = useState(null);
  const [, setEditDraft] = useState(null);
  const [, setEditError] = useState("");
  const [, setIsSavingEdit] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(Boolean(composerAutoFocus));
  const [checkboxStyle, setCheckboxStyle] = useState(
    () => localStorage.getItem("canvenient-checkbox-style") || "icon",
  );
  const [filterScope, setFilterScope] = useState("all");
  const itemRefs = useRef({});
  const editRef = useRef(null);
  const taskViewRef = useRef(null);

  // Open the composer when autoFocus is requested (adjust-during-render pattern).
  const [syncedComposerAutoFocus, setSyncedComposerAutoFocus] = useState(composerAutoFocus);
  if (composerAutoFocus && !syncedComposerAutoFocus) {
    setSyncedComposerAutoFocus(true);
    setIsComposerOpen(true);
  }

  useEffect(() => {
    if (!composerFocusRequestScope) return undefined;
    const handleFocusRequest = (event) => {
      if (event.detail?.scope === composerFocusRequestScope) {
        setIsComposerOpen(true);
      }
    };
    window.addEventListener("canvenient-focus-task-input", handleFocusRequest);
    return () => window.removeEventListener("canvenient-focus-task-input", handleFocusRequest);
  }, [composerFocusRequestScope]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await getTasks(token, { groupId });
      setTasks(sortPendingTasks(data));
    } catch (error) {
      setLoadError(error.message || "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  const groupTaskCount = useMemo(() => tasks.filter((t) => Boolean(t.group_id)).length, [tasks]);
  const personalTaskCount = useMemo(() => tasks.filter((t) => !t.group_id).length, [tasks]);

  const displayedTasks = useMemo(() => {
    if (groupId) return tasks;
    if (filterScope === "personal") return tasks.filter((t) => !t.group_id);
    if (filterScope === "groups") return tasks.filter((t) => Boolean(t.group_id));
    return tasks;
  }, [tasks, groupId, filterScope]);

  useEffect(() => {
    void Promise.resolve().then(loadTasks);
  }, [loadTasks]);
  useEffect(() => {
    const loadModules = () =>
      getAcademicModules(token)
        .then((data) => setModules((data || []).filter((module) => module.is_selected !== false)))
        .catch(() => setModules([]));
    loadModules();
    window.addEventListener("academic-modules-updated", loadModules);
    return () => window.removeEventListener("academic-modules-updated", loadModules);
  }, [token]);
  useEffect(() => {
    const updateSettings = () =>
      setCheckboxStyle(localStorage.getItem("canvenient-checkbox-style") || "icon");
    window.addEventListener("settings-updated", updateSettings);
    return () => window.removeEventListener("settings-updated", updateSettings);
  }, []);
  useEffect(() => {
    if (!editingId) itemRefs.current[selectedIndex]?.focus();
  }, [selectedIndex, editingId]);
  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);
  useEffect(() => {
    const handleCreated = (event) => {
      if (!event.detail) return;
      setTasks((current) =>
        sortPendingTasks([...current.filter((task) => task.id !== event.detail.id), event.detail]),
      );
    };
    const handleRestored = (event) => {
      if (!event.detail) return;
      setTasks((current) =>
        sortPendingTasks([...current.filter((task) => task.id !== event.detail.id), event.detail]),
      );
    };
    window.addEventListener("canvenient-task-created", handleCreated);
    window.addEventListener("canvenient-task-restored", handleRestored);
    return () => {
      window.removeEventListener("canvenient-task-created", handleCreated);
      window.removeEventListener("canvenient-task-restored", handleRestored);
    };
  }, []);

  const openTask = useCallback((task) => {
    if (!task) return;
    if (task.external_url) {
      window.open(task.external_url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const completeTask = useCallback(
    async (task) => {
      await updateTask(token, task.id, { status: "done" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedIndex(null);
      notifyTasksChanged();
    },
    [token],
  );

  const deletingRefs = useRef(new Set());

  const removeTask = useCallback(
    (task) => {
      if (deletingRefs.current.has(task.id)) return;
      deletingRefs.current.add(task.id);

      // Optimistic UI update
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedIndex(null);
      notifyTasksChanged();

      queueTaskDeletion(token, task);
      deletingRefs.current.delete(task.id);
    },
    [token],
  );

  const startEditing = useCallback(
    (task, title = task.title) => {
      const taskIndex = tasks.findIndex((t) => t.id === task.id);
      if (taskIndex !== -1) setSelectedIndex(taskIndex);
      setEditingId(task.id);
      setEditError("");
      setEditDraft({
        title,
        description: task.description || "",
        dueAt: duePartsValue(taskDueDate(task)),
        priority: task.priority_manual || "medium",
        moduleId: task.module_id == null ? "" : String(task.module_id),
      });
    },
    [tasks],
  );

  const restoreTaskFocus = (taskId) => {
    requestAnimationFrame(() =>
      taskViewRef.current?.querySelector(`[data-task-id="${taskId}"]`)?.focus(),
    );
  };

  const cancelEdit = (taskId) => {
    setEditingId(null);
    setEditDraft(null);
    setEditError("");
    restoreTaskFocus(taskId);
  };

  const toolbarConfig = useMemo(
    () => ({
      title: groupId ? "Group Tasks" : "Tasks",
      subtitle: loading ? "Loading" : `${displayedTasks.length} pending`,
      actions: (
        <button
          type="button"
          className="mac-toolbar-action"
          onClick={() => setIsComposerOpen(true)}
        >
          <Plus size={14} />
          New Task
        </button>
      ),
    }),
    [loading, displayedTasks.length, groupId],
  );
  useWorkspaceToolbar(toolbarConfig, !embedded);

  const navigateFromComposer = useCallback(
    (key) => {
      setInteractionMode("keyboard");
      setSelectedIndex((index) => {
        if (!displayedTasks.length) return null;
        if (key === "ArrowUp")
          return index === null ? displayedTasks.length - 1 : Math.max(0, index - 1);
        return index === null ? 0 : Math.min(displayedTasks.length - 1, index + 1);
      });
    },
    [displayedTasks.length],
  );

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (
        editingId !== null ||
        event.target.closest?.(
          "input, textarea, select, button, [contenteditable='true'], [role='listbox'], [role='option']",
        )
      )
        return;
      setInteractionMode("keyboard");
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) =>
          index === null ? displayedTasks.length - 1 : Math.max(0, index - 1),
        );
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) =>
          index === null ? 0 : Math.min(displayedTasks.length - 1, index + 1),
        );
      } else if (event.key === "Home") {
        event.preventDefault();
        setSelectedIndex(displayedTasks.length ? 0 : null);
      } else if (event.key === "End") {
        event.preventDefault();
        setSelectedIndex(displayedTasks.length ? displayedTasks.length - 1 : null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSelectedIndex(null);
      } else if (selectedIndex !== null && event.key === " ") {
        event.preventDefault();
        if (displayedTasks[selectedIndex]) completeTask(displayedTasks[selectedIndex]);
      } else if (selectedIndex !== null && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        if (displayedTasks[selectedIndex]) removeTask(displayedTasks[selectedIndex]);
      } else if (
        selectedIndex !== null &&
        (event.key === "e" || event.key === "E") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (displayedTasks[selectedIndex]) startEditing(displayedTasks[selectedIndex]);
      } else if (selectedIndex !== null && event.key === "Enter") {
        event.preventDefault();
        if (displayedTasks[selectedIndex]) openTask(displayedTasks[selectedIndex]);
      } else if (
        selectedIndex !== null &&
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (displayedTasks[selectedIndex])
          startEditing(
            displayedTasks[selectedIndex],
            `${displayedTasks[selectedIndex].title}${event.key}`,
          );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    completeTask,
    editingId,
    openTask,
    removeTask,
    selectedIndex,
    displayedTasks,
    startEditing,
  ]);

  return (
    <div
      ref={taskViewRef}
      className={`task-view is-${interactionMode}-mode ${embedded ? "is-embedded" : ""}`}
      data-interaction-mode={interactionMode}
    >
      {!embedded && !groupId && groupTaskCount > 0 && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "8px 16px 6px",
            borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          <button
            type="button"
            onClick={() => setFilterScope("all")}
            style={{
              padding: "3px 9px",
              fontSize: "11px",
              borderRadius: "5px",
              border: "1px solid var(--border, rgba(255,255,255,0.12))",
              background:
                filterScope === "all"
                  ? "var(--color-mac-control, rgba(255,255,255,0.15))"
                  : "transparent",
              color: filterScope === "all" ? "var(--text-h)" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            All ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterScope("personal")}
            style={{
              padding: "3px 9px",
              fontSize: "11px",
              borderRadius: "5px",
              border: "1px solid var(--border, rgba(255,255,255,0.12))",
              background:
                filterScope === "personal"
                  ? "var(--color-mac-control, rgba(255,255,255,0.15))"
                  : "transparent",
              color: filterScope === "personal" ? "var(--text-h)" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Personal ({personalTaskCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterScope("groups")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 9px",
              fontSize: "11px",
              borderRadius: "5px",
              border: "1px solid var(--border, rgba(255,255,255,0.12))",
              background:
                filterScope === "groups"
                  ? "var(--color-mac-control, rgba(255,255,255,0.15))"
                  : "transparent",
              color: filterScope === "groups" ? "var(--text-h)" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <Users size={11} />
            Group Tasks ({groupTaskCount})
          </button>
        </div>
      )}

      <div className="task-feed" role="list" aria-label="Pending tasks">
        {loading ? (
          <div className="empty-state">Loading tasks...</div>
        ) : loadError ? (
          <div className="empty-state task-load-error">
            <strong>Could not load tasks</strong>
            <span>{loadError}</span>
            <button type="button" onClick={loadTasks}>
              Retry
            </button>
          </div>
        ) : displayedTasks.length === 0 ? (
          <div className="empty-state">
            <strong>No tasks pending</strong>
            <span>Add one below without leaving this view.</span>
          </div>
        ) : (
          displayedTasks.map((task, index) => {
            const selected = selectedIndex === index;
            const editing = editingId === task.id;
            const dueDate = taskDueDate(task);
            const priority = visiblePriority(task);
            const taskModuleColor = getTaskModuleColor(task, modules);
            return (
              <div
                role="listitem"
                key={task.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                data-task-id={task.id}
                tabIndex={selected || (selectedIndex === null && index === 0) ? 0 : -1}
                className={`task-row ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""} ${taskModuleColor ? "has-module" : ""}`}
                style={taskModuleColor ? { "--task-module-color": taskModuleColor } : undefined}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") setInteractionMode("pointer");
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== "touch") setInteractionMode("pointer");
                }}
                onFocus={() => setSelectedIndex(index)}
                onClick={() => {
                  setSelectedIndex(index);
                  if (!editing) openTask(task);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (!editing) startEditing(task);
                }}
              >
                {taskModuleColor && (
                  <span
                    className="task-module-strip"
                    aria-hidden="true"
                    style={{ backgroundColor: taskModuleColor }}
                  />
                )}
                <button
                  type="button"
                  tabIndex="-1"
                  className="task-check"
                  aria-label={`Complete ${task.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    completeTask(task);
                  }}
                >
                  {checkboxStyle === "icon" ? (
                    <CheckCircle size={16} />
                  ) : checkboxStyle === "circle" ? (
                    "( )"
                  ) : (
                    "[ ]"
                  )}
                </button>
                {editing ? (
                  <TaskInputBar
                    token={token}
                    variant="inline"
                    initialTask={task}
                    allowedModes={["task"]}
                    autoFocus={true}
                    showCancel={true}
                    onClose={() => cancelEdit(task.id)}
                    onSubmitTaskEdit={async (taskId, payload) => {
                      setIsSavingEdit(true);
                      setEditError("");
                      try {
                        const updated = await updateTask(token, taskId, payload);
                        setTasks((current) =>
                          sortPendingTasks(
                            current.map((item) => (item.id === taskId ? updated : item)),
                          ),
                        );
                        setEditingId(null);
                        restoreTaskFocus(taskId);
                        notifyTasksChanged();
                      } catch (error) {
                        setEditError(error.message || "Could not save task changes.");
                        throw error;
                      } finally {
                        setIsSavingEdit(false);
                      }
                    }}
                  />
                ) : (
                  <>
                    <div className="task-row-content">
                      <span>{task.title}</span>
                      {task.description && (
                        <small className="task-row-note">{task.description}</small>
                      )}
                      {(priority ||
                        dueDate ||
                        task.module_code ||
                        task.group_name ||
                        task.assignee_name) && (
                        <div className="task-meta">
                          {priority && (
                            <span style={{ color: priorityColor(priority) }}>
                              <Flag size={10} />
                              {priority.toUpperCase()}
                            </span>
                          )}
                          {dueDate && (
                            <span>
                              <Calendar size={10} />
                              {formatDueDate(dueDate)}
                            </span>
                          )}
                          {task.module_code && (
                            <span style={taskModuleColor ? { color: taskModuleColor } : undefined}>
                              <BookOpen size={10} />
                              {task.module_code}
                            </span>
                          )}
                          {task.class_summary && (
                            <span>
                              <Calendar size={10} />
                              {task.class_relation === "due_before"
                                ? "Before "
                                : task.class_relation === "bring_to"
                                  ? "For "
                                  : "After "}
                              {task.class_summary}
                            </span>
                          )}
                          {task.group_name && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                color: "var(--accent)",
                                fontWeight: 550,
                              }}
                            >
                              <Users size={10} />
                              {task.group_name}
                            </span>
                          )}
                          {task.assignee_name && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                opacity: 0.85,
                              }}
                            >
                              {task.assignee_id === user?.id
                                ? "Assigned to you"
                                : `Assigned: ${task.assignee_name}`}
                            </span>
                          )}
                        </div>
                      )}
                      {task.created_at && (
                        <small className="task-added-at">
                          Added {formatAddedAt(task.created_at)}
                        </small>
                      )}
                    </div>
                    <div className="task-row-actions">
                      <button
                        type="button"
                        className="task-row-edit-button"
                        aria-label={`Edit ${task.title}`}
                        title="Edit task"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditing(task);
                        }}
                      >
                        <Pencil size={12} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="task-row-delete-button"
                        aria-label={`Delete ${task.title}`}
                        title="Delete task"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeTask(task);
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </>
                )}
                {selected && interactionMode === "keyboard" && !editing && (
                  <small>
                    Space to complete · {task.external_url ? "Enter to open · " : ""}E to edit
                  </small>
                )}
              </div>
            );
          })
        )}
        {!loading &&
          !loadError &&
          (!isComposerOpen ? (
            <button
              type="button"
              className="task-add-trigger"
              onClick={() => setIsComposerOpen(true)}
            >
              <Plus size={14} />
              <span>Add new task</span>
            </button>
          ) : (
            <TaskInputBar
              token={token}
              variant={embedded ? "panel" : "inline"}
              isOpen={true}
              initialMode="task"
              allowedModes={["task"]}
              autoFocus={true}
              showCancel={true}
              onClose={() => setIsComposerOpen(false)}
              focusRequestScope={composerFocusRequestScope}
              onEmptyArrowKey={navigateFromComposer}
              onTaskCreated={(task) => {
                window.dispatchEvent(new CustomEvent("canvenient-task-created", { detail: task }));
              }}
            />
          ))}
      </div>
    </div>
  );
}
