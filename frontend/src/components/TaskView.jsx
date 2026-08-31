// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Calendar, CheckCircle, Flag, Plus } from "lucide-react";
import { getAcademicModules, getTasks, updateTask } from "../api";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";
import TaskInputBar from "./TaskInputBar";

function normalizeDate(value) {
  if (!value) return null;
  const normalized = typeof value === "string" && !value.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(value)
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
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function dueTextValue(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  const part = (number) => String(number).padStart(2, "0");
  return `${part(date.getDate())}/${part(date.getMonth() + 1)}/${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}`;
}

function parseDueText(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:,?\s+)(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) throw new Error("Use DD/MM/YYYY HH:MM, for example 21/10/2026 23:59.");
  const [, dayText, monthText, yearText, hourText, minuteText, meridiem] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error("Enter an hour from 1 to 12 when using AM or PM.");
    hour = (hour % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
  }
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (month < 1 || month > 12 || minute > 59 || hour > 23 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Enter a valid due date and time.");
  }
  return date.toISOString();
}

function taskDueDate(task) {
  return normalizeDate(task?.effective_due_at || task?.due_at_override || task?.source_due_at);
}

function taskCreatedTime(task) {
  return normalizeDate(task?.created_at)?.getTime() || 0;
}

function sortPendingTasks(data) {
  if (!Array.isArray(data)) return [];

  return data
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
  return ["urgent", "high"].includes(task?.recommended_priority)
    ? task.recommended_priority
    : null;
}

function priorityColor(priority) {
  if (priority === "urgent") return "var(--danger)";
  if (priority === "high") return "var(--warning)";
  if (priority === "medium") return "var(--accent)";
  return "var(--text-muted)";
}

export default function TaskView({ token, embedded = false, active = true, composerAutoFocus = false }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modules, setModules] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [interactionMode, setInteractionMode] = useState("keyboard");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [checkboxStyle, setCheckboxStyle] = useState(() => localStorage.getItem("canvenient-checkbox-style") || "brackets");
  const itemRefs = useRef({});
  const editRef = useRef(null);
  const taskViewRef = useRef(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await getTasks(token);
      setTasks(sortPendingTasks(data));
    } catch (error) {
      setLoadError(error.message || "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void Promise.resolve().then(loadTasks);
  }, [loadTasks]);
  useEffect(() => {
    getAcademicModules(token).then(setModules).catch(() => setModules([]));
  }, [token]);
  useEffect(() => {
    const updateSettings = () => setCheckboxStyle(localStorage.getItem("canvenient-checkbox-style") || "brackets");
    window.addEventListener("settings-updated", updateSettings);
    return () => window.removeEventListener("settings-updated", updateSettings);
  }, []);
  useEffect(() => { itemRefs.current[selectedIndex]?.focus(); }, [selectedIndex]);
  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);
  useEffect(() => {
    const handleCreated = (event) => {
      if (!event.detail) return;
      setTasks((current) => sortPendingTasks([
        ...current.filter((task) => task.id !== event.detail.id),
        event.detail,
      ]));
    };
    window.addEventListener("canvenient-task-created", handleCreated);
    return () => window.removeEventListener("canvenient-task-created", handleCreated);
  }, []);

  const completeTask = useCallback(async (task) => {
    await updateTask(token, task.id, { status: "done" });
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSelectedIndex(null);
  }, [token]);

  const startEditing = (task, title = task.title) => {
    setEditingId(task.id);
    setEditError("");
    setEditDraft({
      title,
      dueAt: dueTextValue(taskDueDate(task)),
      priority: task.priority_manual || "medium",
      moduleId: task.module_id == null ? "" : String(task.module_id),
    });
  };

  const restoreTaskFocus = (taskId) => {
    requestAnimationFrame(() => taskViewRef.current?.querySelector(`[data-task-id="${taskId}"]`)?.focus());
  };

  const cancelEdit = (taskId) => {
    setEditingId(null);
    setEditDraft(null);
    setEditError("");
    restoreTaskFocus(taskId);
  };

  const saveEdit = async (task) => {
    if (!editDraft?.title.trim() || isSavingEdit) return;
    let dueAtOverride;
    try {
      dueAtOverride = parseDueText(editDraft.dueAt);
    } catch (error) {
      setEditError(error.message);
      return;
    }
    setIsSavingEdit(true);
    setEditError("");
    try {
      const updated = await updateTask(token, task.id, {
        title: editDraft.title.trim(),
        due_at_override: dueAtOverride,
        priority_manual: editDraft.priority,
        module_id: editDraft.moduleId ? Number(editDraft.moduleId) : null,
      });
      setTasks((current) => sortPendingTasks(current.map((item) => item.id === task.id ? updated : item)));
      setEditingId(null);
      setEditDraft(null);
      restoreTaskFocus(task.id);
    } catch (error) {
      setEditError(error.message || "Could not save task changes.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toolbarConfig = useMemo(() => ({
    title: "Tasks",
    subtitle: loading ? "Loading" : `${tasks.length} pending`,
    actions: <button type="button" className="mac-toolbar-action" onClick={() => taskViewRef.current?.querySelector("textarea")?.focus()}><Plus size={14} />New Task</button>,
  }), [loading, tasks.length]);
  useWorkspaceToolbar(toolbarConfig, !embedded);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (editingId !== null || event.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      setInteractionMode("keyboard");
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => index === null ? tasks.length - 1 : Math.max(0, index - 1));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => index === null ? 0 : Math.min(tasks.length - 1, index + 1));
      } else if (event.key === "Home") {
        event.preventDefault();
        setSelectedIndex(tasks.length ? 0 : null);
      } else if (event.key === "End") {
        event.preventDefault();
        setSelectedIndex(tasks.length ? tasks.length - 1 : null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSelectedIndex(null);
      } else if (selectedIndex !== null && event.key === " ") {
        event.preventDefault();
        completeTask(tasks[selectedIndex]);
      } else if (selectedIndex !== null && event.key === "Enter") {
        event.preventDefault();
        startEditing(tasks[selectedIndex]);
      } else if (selectedIndex !== null && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startEditing(tasks[selectedIndex], `${tasks[selectedIndex].title}${event.key}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, completeTask, editingId, selectedIndex, tasks]);

  return (
    <div ref={taskViewRef} className={`task-view is-${interactionMode}-mode ${embedded ? "is-embedded" : ""}`} data-interaction-mode={interactionMode}>
      <div className="task-feed" role="list" aria-label="Pending tasks">
        {loading ? <div className="empty-state">Loading tasks...</div> : loadError ? (
          <div className="empty-state task-load-error">
            <strong>Could not load tasks</strong>
            <span>{loadError}</span>
            <button type="button" onClick={loadTasks}>Retry</button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty-state"><strong>No tasks pending</strong><span>Add one below without leaving this view.</span></div>
        ) : tasks.map((task, index) => {
          const selected = selectedIndex === index;
          const editing = editingId === task.id;
          const dueDate = taskDueDate(task);
          const priority = visiblePriority(task);
          return (
            <div
              role="listitem"
              key={task.id}
              ref={(element) => { itemRefs.current[index] = element; }}
              data-task-id={task.id}
              tabIndex={selected || (selectedIndex === null && index === 0) ? 0 : -1}
              className={`task-row ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}`}
              onPointerEnter={(event) => { if (event.pointerType !== "touch") setInteractionMode("pointer"); }}
              onPointerDown={(event) => { if (event.pointerType !== "touch") setInteractionMode("pointer"); }}
              onFocus={() => setSelectedIndex(index)}
              onClick={() => setSelectedIndex(index)}
            >
              <button type="button" tabIndex="-1" className="task-check" aria-label={`Complete ${task.title}`} onClick={(event) => { event.stopPropagation(); completeTask(task); }}>
                {checkboxStyle === "icon" ? <CheckCircle size={16} /> : checkboxStyle === "circle" ? "( )" : "[ ]"}
              </button>
              {editing ? (
                <form className="task-inline-editor" onSubmit={(event) => { event.preventDefault(); saveEdit(task); }} onKeyDown={(event) => {
                  if (event.key === "Escape") { event.preventDefault(); cancelEdit(task.id); }
                }}>
                  <input ref={editRef} aria-label="Edit task title" value={editDraft?.title || ""} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} />
                  <div className="task-inline-properties">
                    <label>Due <input aria-label="Edit task due date" type="text" inputMode="numeric" placeholder="DD/MM/YYYY HH:MM" value={editDraft?.dueAt || ""} onChange={(event) => setEditDraft((draft) => ({ ...draft, dueAt: event.target.value }))} /></label>
                    <label>Priority <select aria-label="Edit task priority" value={editDraft?.priority || "medium"} onChange={(event) => setEditDraft((draft) => ({ ...draft, priority: event.target.value }))}>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select></label>
                    <label>Course <select aria-label="Edit task course" value={editDraft?.moduleId || ""} onChange={(event) => setEditDraft((draft) => ({ ...draft, moduleId: event.target.value }))}>
                      <option value="">No course</option>
                      {modules.map((module) => <option key={module.id} value={module.id}>{module.module_code}</option>)}
                    </select></label>
                  </div>
                  {editError && <div className="task-inline-error" role="alert">{editError}</div>}
                  <div className="task-inline-actions">
                    <button type="submit" className="is-primary" disabled={!editDraft?.title.trim() || isSavingEdit}>{isSavingEdit ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={() => cancelEdit(task.id)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="task-row-content">
                  <span>{task.title}</span>
                  {(priority || dueDate || task.module_code) && (
                    <div className="task-meta">
                      {priority && <span style={{ color: priorityColor(priority) }}><Flag size={10} />{priority.toUpperCase()}</span>}
                      {dueDate && <span><Calendar size={10} />{formatDueDate(dueDate)}</span>}
                      {task.module_code && <span><BookOpen size={10} />{task.module_code}</span>}
                    </div>
                  )}
                </div>
              )}
              {selected && interactionMode === "keyboard" && !editing && <small>Space to complete · Enter to edit</small>}
            </div>
          );
        })}
      </div>
      <TaskInputBar
        token={token}
        variant={embedded ? "panel" : "inline"}
        isOpen={active}
        initialMode="task"
        allowedModes={["task"]}
        autoFocus={composerAutoFocus}
        onTaskCreated={(task) => window.dispatchEvent(new CustomEvent("canvenient-task-created", { detail: task }))}
      />
    </div>
  );
}
