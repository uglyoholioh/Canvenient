// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Calendar, CheckCircle, Flag, Plus } from "lucide-react";
import { getTasks, updateTask } from "../api";
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
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
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

  const saveEdit = async (task) => {
    if (!editValue.trim()) return;
    const updated = await updateTask(token, task.id, { title: editValue.trim() });
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, title: updated.title } : item));
    setEditingId(null);
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
        setEditingId(tasks[selectedIndex].id);
        setEditValue(tasks[selectedIndex].title);
      } else if (selectedIndex !== null && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setEditingId(tasks[selectedIndex].id);
        setEditValue(`${tasks[selectedIndex].title}${event.key}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, completeTask, editingId, selectedIndex, tasks]);

  return (
    <div ref={taskViewRef} className={`task-view ${embedded ? "is-embedded" : ""}`}>
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
            <div role="listitem" key={task.id} ref={(element) => { itemRefs.current[index] = element; }} tabIndex={selected || (selectedIndex === null && index === 0) ? 0 : -1} className={`task-row ${selected ? "is-selected" : ""}`} onFocus={() => setSelectedIndex(index)} onClick={() => setSelectedIndex(index)}>
              <button type="button" tabIndex="-1" className="task-check" aria-label={`Complete ${task.title}`} onClick={(event) => { event.stopPropagation(); completeTask(task); }}>
                {checkboxStyle === "icon" ? <CheckCircle size={16} /> : checkboxStyle === "circle" ? "( )" : "[ ]"}
              </button>
              {editing ? (
                <textarea ref={editRef} value={editValue} onChange={(event) => setEditValue(event.target.value)} onBlur={() => saveEdit(task)} onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveEdit(task); }
                  if (event.key === "Escape") { event.preventDefault(); setEditingId(null); }
                }} />
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
              {selected && !editing && <small>Space to complete · Enter to edit</small>}
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
