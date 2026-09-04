// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Calendar, CheckCircle, Flag, Pencil, Plus } from "lucide-react";
import { getAcademicModules, getTasks, updateTask } from "../api";
import { notifyTasksChanged } from "../taskEvents";
import { getTaskModuleColor } from "./scheduleUtils";
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

const DUE_SEGMENTS = ["day", "month", "year", "hour", "minute"];
const DUE_SEGMENT_LENGTHS = { day: 2, month: 2, year: 4, hour: 2, minute: 2 };

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

function parseDueParts(parts) {
  if (DUE_SEGMENTS.every((segment) => !parts[segment])) return null;
  if (DUE_SEGMENTS.some((segment) => !parts[segment])) throw new Error("Complete each part of the due date and time.");
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (month < 1 || month > 12 || minute > 59 || hour > 23 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Enter a valid due date and time.");
  }
  return date.toISOString();
}

function DueDateEditor({ value, onChange }) {
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const segment = DUE_SEGMENTS[selectedSegment] || "day";

  const moveSegment = (direction) => {
    setSelectedSegment((current) => Math.max(0, Math.min(DUE_SEGMENTS.length - 1, (current ?? 0) + direction)));
    setIsTyping(false);
  };

  const adjustSegment = (direction) => {
    const currentDate = new Date();
    const defaults = { day: 1, month: currentDate.getMonth() + 1, year: currentDate.getFullYear(), hour: 0, minute: 0 };
    const bounds = {
      day: [1, new Date(Number(value.year || defaults.year), Number(value.month || defaults.month), 0).getDate()],
      month: [1, 12],
      year: [2000, 2099],
      hour: [0, 23],
      minute: [0, 59],
    };
    const [minimum, maximum] = bounds[segment];
    const current = Number(value[segment] || defaults[segment]);
    const next = current + direction > maximum ? minimum : current + direction < minimum ? maximum : current + direction;
    onChange({ ...value, [segment]: String(next).padStart(DUE_SEGMENT_LENGTHS[segment], "0") });
    setIsTyping(false);
  };

  const typeDigit = (digit) => {
    const length = DUE_SEGMENT_LENGTHS[segment];
    const next = isTyping ? `${value[segment] || ""}${digit}`.slice(-length) : digit;
    onChange({ ...value, [segment]: next });
    if (next.length === length && selectedSegment < DUE_SEGMENTS.length - 1) {
      setSelectedSegment((current) => current + 1);
      setIsTyping(false);
    } else {
      setIsTyping(true);
    }
  };

  const displaySegment = (segmentName) => {
    const segmentValue = value[segmentName];
    if (!segmentValue) return ({ day: "DD", month: "MM", year: "YYYY", hour: "HH", minute: "MM" })[segmentName];
    return segmentName === "year" ? segmentValue : segmentValue.padStart(2, "0");
  };

  return (
    <div
      className="task-due-editor"
      role="group"
      tabIndex={0}
      aria-label="Edit task due date and time. Use left and right arrows to choose a part, up and down arrows to adjust it, or type digits to replace it."
      onFocus={() => { setSelectedSegment(0); setIsTyping(false); }}
      onBlur={() => { setSelectedSegment(null); setIsTyping(false); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); moveSegment(-1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); moveSegment(1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); adjustSegment(1); }
        else if (event.key === "ArrowDown") { event.preventDefault(); adjustSegment(-1); }
        else if (/^\d$/.test(event.key)) { event.preventDefault(); typeDigit(event.key); }
        else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); onChange({ ...value, [segment]: "" }); setIsTyping(true); }
        else if (event.key === "Enter") event.preventDefault();
        else if (event.key === "Escape") { event.preventDefault(); event.currentTarget.blur(); }
      }}
    >
      <span className={selectedSegment === 0 ? "is-active" : ""}> {displaySegment("day")} </span><i>/</i>
      <span className={selectedSegment === 1 ? "is-active" : ""}> {displaySegment("month")} </span><i>/</i>
      <span className={selectedSegment === 2 ? "is-active" : ""}> {displaySegment("year")} </span><i> · </i>
      <span className={selectedSegment === 3 ? "is-active" : ""}> {displaySegment("hour")} </span><i>:</i>
      <span className={selectedSegment === 4 ? "is-active" : ""}> {displaySegment("minute")} </span>
    </div>
  );
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

export default function TaskView({ token, embedded = false, active = true, composerAutoFocus = false, composerFocusRequestScope }) {
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
  const [isComposerOpen, setIsComposerOpen] = useState(Boolean(composerAutoFocus));
  const [checkboxStyle, setCheckboxStyle] = useState(() => localStorage.getItem("canvenient-checkbox-style") || "brackets");
  const itemRefs = useRef({});
  const editRef = useRef(null);
  const taskViewRef = useRef(null);

  useEffect(() => {
    if (composerAutoFocus) setIsComposerOpen(true);
  }, [composerAutoFocus]);

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
    const loadModules = () => getAcademicModules(token).then((data) => setModules((data || []).filter((module) => module.is_selected !== false))).catch(() => setModules([]));
    loadModules();
    window.addEventListener("academic-modules-updated", loadModules);
    return () => window.removeEventListener("academic-modules-updated", loadModules);
  }, [token]);
  useEffect(() => {
    const updateSettings = () => setCheckboxStyle(localStorage.getItem("canvenient-checkbox-style") || "brackets");
    window.addEventListener("settings-updated", updateSettings);
    return () => window.removeEventListener("settings-updated", updateSettings);
  }, []);
  useEffect(() => { if (!editingId) itemRefs.current[selectedIndex]?.focus(); }, [selectedIndex, editingId]);
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

  const openTask = useCallback((task) => {
    if (!task) return;
    if (task.external_url) {
      window.open(task.external_url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const completeTask = useCallback(async (task) => {
    await updateTask(token, task.id, { status: "done" });
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSelectedIndex(null);
    notifyTasksChanged();
  }, [token]);

  const startEditing = (task, title = task.title) => {
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
      dueAtOverride = parseDueParts(editDraft.dueAt);
    } catch (error) {
      setEditError(error.message);
      return;
    }
    setIsSavingEdit(true);
    setEditError("");
    try {
      const updated = await updateTask(token, task.id, {
        title: editDraft.title.trim(),
        description: editDraft.description.trim(),
        due_at_override: dueAtOverride,
        priority_manual: editDraft.priority,
        module_id: editDraft.moduleId ? Number(editDraft.moduleId) : null,
      });
      setTasks((current) => sortPendingTasks(current.map((item) => item.id === task.id ? updated : item)));
      setEditingId(null);
      setEditDraft(null);
      restoreTaskFocus(task.id);
      notifyTasksChanged();
    } catch (error) {
      setEditError(error.message || "Could not save task changes.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toolbarConfig = useMemo(() => ({
    title: "Tasks",
    subtitle: loading ? "Loading" : `${tasks.length} pending`,
    actions: <button type="button" className="mac-toolbar-action" onClick={() => setIsComposerOpen(true)}><Plus size={14} />New Task</button>,
  }), [loading, tasks.length]);
  useWorkspaceToolbar(toolbarConfig, !embedded);

  const navigateFromComposer = useCallback((key) => {
    setInteractionMode("keyboard");
    setSelectedIndex((index) => {
      if (!tasks.length) return null;
      if (key === "ArrowUp") return index === null ? tasks.length - 1 : Math.max(0, index - 1);
      return index === null ? 0 : Math.min(tasks.length - 1, index + 1);
    });
  }, [tasks.length]);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (editingId !== null || event.target.closest?.("input, textarea, select, button, [contenteditable='true'], [role='listbox'], [role='option']")) return;
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
      } else if (selectedIndex !== null && (event.key === "e" || event.key === "E") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startEditing(tasks[selectedIndex]);
      } else if (selectedIndex !== null && event.key === "Enter") {
        event.preventDefault();
        openTask(tasks[selectedIndex]);
      } else if (selectedIndex !== null && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startEditing(tasks[selectedIndex], `${tasks[selectedIndex].title}${event.key}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, completeTask, editingId, openTask, selectedIndex, tasks]);

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
          const taskModuleColor = getTaskModuleColor(task, modules);
          return (
            <div
              role="listitem"
              key={task.id}
              ref={(element) => { itemRefs.current[index] = element; }}
              data-task-id={task.id}
              tabIndex={selected || (selectedIndex === null && index === 0) ? 0 : -1}
              className={`task-row ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""} ${taskModuleColor ? "has-module" : ""}`}
              style={taskModuleColor ? { "--task-module-color": taskModuleColor } : undefined}
              onPointerEnter={(event) => { if (event.pointerType !== "touch") setInteractionMode("pointer"); }}
              onPointerDown={(event) => { if (event.pointerType !== "touch") setInteractionMode("pointer"); }}
              onFocus={() => setSelectedIndex(index)}
              onClick={() => {
                setSelectedIndex(index);
                if (!editing) openTask(task);
              }}
            >
              {taskModuleColor && (
                <span
                  className="task-module-strip"
                  aria-hidden="true"
                  style={{ backgroundColor: taskModuleColor }}
                />
              )}
              <button type="button" tabIndex="-1" className="task-check" aria-label={`Complete ${task.title}`} onClick={(event) => { event.stopPropagation(); completeTask(task); }}>
                {checkboxStyle === "icon" ? <CheckCircle size={16} /> : checkboxStyle === "circle" ? "( )" : "[ ]"}
              </button>
              {editing ? (
                <form className="task-inline-editor" onSubmit={(event) => { event.preventDefault(); saveEdit(task); }} onKeyDown={(event) => {
                  if (event.key === "Escape") { event.preventDefault(); cancelEdit(task.id); }
                }}>
                  <input ref={editRef} aria-label="Edit task title" value={editDraft?.title || ""} maxLength={160} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} />
                  <textarea aria-label="Edit task note" value={editDraft?.description || ""} maxLength={4000} rows={3} onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Add details or a note (optional)" />
                  <div className="task-inline-properties">
                    <label>Due
                      <DueDateEditor value={editDraft?.dueAt || duePartsValue(null)} onChange={(dueAt) => setEditDraft((draft) => ({ ...draft, dueAt }))} />
                      <button type="button" aria-label="Clear due date and time" className="task-clear-due" onClick={() => setEditDraft((draft) => ({ ...draft, dueAt: duePartsValue(null) }))}>Clear due date and time</button>
                    </label>
                    <label>Priority <select aria-label="Edit task priority" value={editDraft?.priority || "medium"} onChange={(event) => setEditDraft((draft) => ({ ...draft, priority: event.target.value }))}>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select></label>
                    <label>Module <select aria-label="Edit task module" value={editDraft?.moduleId || ""} onChange={(event) => setEditDraft((draft) => ({ ...draft, moduleId: event.target.value }))}>
                      <option value="">No module</option>
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
                <>
                  <div className="task-row-content">
                    <span>{task.title}</span>
                    {task.description && <small className="task-row-note">{task.description}</small>}
                    {(priority || dueDate || task.module_code) && (
                      <div className="task-meta">
                        {priority && <span style={{ color: priorityColor(priority) }}><Flag size={10} />{priority.toUpperCase()}</span>}
                        {dueDate && <span><Calendar size={10} />{formatDueDate(dueDate)}</span>}
                        {task.module_code && <span style={taskModuleColor ? { color: taskModuleColor } : undefined}><BookOpen size={10} />{task.module_code}</span>}
                        {task.class_summary && <span><Calendar size={10} />{task.class_relation === "due_before" ? "Before " : task.class_relation === "bring_to" ? "For " : "After "}{task.class_summary}</span>}
                      </div>
                    )}
                    {task.created_at && <small className="task-added-at">Added {formatAddedAt(task.created_at)}</small>}
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
                  </div>
                </>
              )}
              {selected && interactionMode === "keyboard" && !editing && <small>Space to complete · {task.external_url ? "Enter to open · " : ""}E to edit</small>}
            </div>
          );
        })}
        {!loading && !loadError && (
          !isComposerOpen ? (
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
          )
        )}
      </div>
    </div>
  );
}
