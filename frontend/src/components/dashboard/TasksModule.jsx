// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Pencil, Trash2 } from "lucide-react";
import { createTask, deleteTask, getAcademicModules, getTasks, updateTask } from "../../api";
import { notifyTasksChanged } from "../../taskEvents";
import { getTaskModuleColor } from "../scheduleUtils";

function taskDueDate(task) {
  const raw = task.effective_due_at || task.due_at_override || task.source_due_at;
  if (!raw) return null;
  const normalized = typeof raw === "string" && !raw.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localInputValue(value) {
  const date = value ? new Date(value) : new Date();
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function taskCreatedTime(task) {
  const date = new Date(task.created_at || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortByDueTime(tasks) {
  return [...tasks].sort((a, b) => {
    const aDue = taskDueDate(a)?.getTime() ?? Infinity;
    const bDue = taskDueDate(b)?.getTime() ?? Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return taskCreatedTime(b) - taskCreatedTime(a);
  });
}

export default function TasksModule({ token, refreshKey = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [modules, setModules] = useState([]);
  const [filter, setFilter] = useState("all");
  const [isDraftingNew, setIsDraftingNew] = useState(false);
  const [newDraftTitle, setNewDraftTitle] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const titleInputRef = useRef(null);
  const newDraftInputRef = useRef(null);
  const taskButtonRefs = useRef({});
  const filterTabsRef = useRef(null);

  useEffect(() => {
    getTasks(token)
      .then((data) => { setTasks((data || []).filter((task) => task.status !== "done")); setError(""); })
      .catch((loadError) => setError(loadError.message || "Could not load tasks."));
    getAcademicModules(token)
      .then((data) => setModules(data || []))
      .catch(() => {});
  }, [token, refreshKey]);

  const visibleTasks = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const filtered = tasks.filter((task) => {
      const due = taskDueDate(task);
      if (filter === "today") return due && due >= now && due <= todayEnd;
      if (filter === "overdue") return due && due < now;
      if (filter === "priority") return ["urgent", "high"].includes(task.priority_manual);
      return true;
    });

    return sortByDueTime(filtered);
  }, [filter, tasks]);

  const startNewDraft = useCallback(() => {
    setExpandedId(null);
    setIsDraftingNew(true);
    requestAnimationFrame(() => newDraftInputRef.current?.focus());
  }, []);

  const handleCreateInlineTask = useCallback(async (title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      setActionError("");
      const created = await createTask(token, {
        title: trimmed,
        status: "todo",
        priority_manual: filter === "priority" ? "high" : "medium",
      });
      setTasks((current) => sortByDueTime([...current, created]));
      window.dispatchEvent(new CustomEvent("canvenient-task-created", { detail: created }));
      notifyTasksChanged();
    } catch (err) {
      setActionError(err.message || "Could not create task.");
    }
  }, [filter, token]);

  const handleNewDraftKeyDown = async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const titleToCreate = newDraftTitle.trim();
      if (titleToCreate) {
        setNewDraftTitle("");
        await handleCreateInlineTask(titleToCreate);
        requestAnimationFrame(() => newDraftInputRef.current?.focus());
      } else {
        setIsDraftingNew(false);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setNewDraftTitle("");
      setIsDraftingNew(false);
    } else if (event.key === "Backspace" && newDraftTitle === "") {
      setIsDraftingNew(false);
    }
  };

  const handleNewDraftBlur = async () => {
    const titleToCreate = newDraftTitle.trim();
    if (titleToCreate) {
      setNewDraftTitle("");
      await handleCreateInlineTask(titleToCreate);
    }
    setIsDraftingNew(false);
  };

  const openTask = (task) => {
    if (!task) return;
    if (task.external_url) {
      window.open(task.external_url, "_blank", "noopener,noreferrer");
    }
  };

  const openEditor = (task) => {
    setIsDraftingNew(false);
    const opening = expandedId !== task.id;
    setExpandedId(opening ? task.id : null);
    if (opening) {
      setDraftTitle(task.title);
      setDraftDue(localInputValue(taskDueDate(task)));
    }
  };

  const complete = async (task) => {
    try {
      setActionError("");
      await updateTask(token, task.id, { status: "done" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      notifyTasksChanged();
    } catch (actionError) {
      setActionError(actionError.message || "Could not complete task.");
    }
  };

  const save = async (task) => {
    if (!draftTitle.trim()) return;
    try {
      setActionError("");
      const updated = await updateTask(token, task.id, {
        title: draftTitle.trim(),
        due_at_override: draftDue ? new Date(draftDue).toISOString() : null,
      });
      setTasks((current) => sortByDueTime(current.map((item) => item.id === task.id ? updated : item)));
      setExpandedId(null);
      requestAnimationFrame(() => taskButtonRefs.current[task.id]?.focus());
      notifyTasksChanged();
    } catch (actionError) {
      setActionError(actionError.message || "Could not save task changes.");
    }
  };

  const remove = async (task) => {
    try {
      setActionError("");
      await deleteTask(token, task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      notifyTasksChanged();
    } catch (actionError) {
      setActionError(actionError.message || "Could not delete task.");
    }
  };

  useEffect(() => {
    if (expandedId !== null) requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [expandedId]);

  const moveFilter = (currentFilter, direction) => {
    const filters = ["all", "today", "overdue", "priority"];
    const currentIndex = filters.indexOf(currentFilter);
    const next = filters[(currentIndex + direction + filters.length) % filters.length];
    setFilter(next);
    requestAnimationFrame(() => filterTabsRef.current?.querySelector(`[data-task-filter="${next}"]`)?.focus());
  };

  return (
    <div className="tasks-module">
      <div className="tasks-module-controls">
        <div ref={filterTabsRef} className="module-filter-tabs" role="tablist" aria-label="Task filters">
          {["all", "today", "overdue", "priority"].map((value) => (
            <button
              type="button"
              role="tab"
              tabIndex={filter === value ? 0 : -1}
              aria-selected={filter === value}
              data-task-filter={value}
              key={value}
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveFilter(value, 1); }
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveFilter(value, -1); }
                if (event.key === "Home") { event.preventDefault(); setFilter("all"); requestAnimationFrame(() => filterTabsRef.current?.querySelector('[data-task-filter="all"]')?.focus()); }
                if (event.key === "End") { event.preventDefault(); setFilter("priority"); requestAnimationFrame(() => filterTabsRef.current?.querySelector('[data-task-filter="priority"]')?.focus()); }
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {actionError && <div className="module-error" role="alert">{actionError}</div>}
      {error ? (
        <div className="module-error">{error}</div>
      ) : (
        <div
          className="module-list"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDraftingNew) {
              startNewDraft();
            }
          }}
        >
          {visibleTasks.map((task) => {
            const due = taskDueDate(task);
            const taskModuleColor = getTaskModuleColor(task, modules);
            return (
              <div
                className={`module-list-item task-module-item ${expandedId === task.id ? "is-expanded" : ""} ${taskModuleColor ? "has-module" : ""}`}
                key={task.id}
                style={taskModuleColor ? { "--task-module-color": taskModuleColor } : undefined}
              >
                {taskModuleColor && (
                  <span
                    className="task-module-strip"
                    aria-hidden="true"
                    style={{ backgroundColor: taskModuleColor }}
                  />
                )}
                <button type="button" className="module-task-check" onClick={() => complete(task)} aria-label={`Complete ${task.title}`}>[ ]</button>
                <button
                  ref={(element) => { taskButtonRefs.current[task.id] = element; }}
                  type="button"
                  className="module-item-main"
                  aria-expanded={expandedId === task.id}
                  aria-controls={`task-editor-${task.id}`}
                  onClick={() => openTask(task)}
                >
                  <span className="module-item-copy">
                    <strong>{task.title}</strong>
                    <small>
                      {task.class_summary
                        ? `${task.class_relation === "due_before" ? "Before " : task.class_relation === "bring_to" ? "For " : "After "}${task.class_summary}`
                        : task.module_code || "Personal"}
                      {due
                        ? ` · ${due.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
                        : ""}
                    </small>
                  </span>
                </button>
                {expandedId !== task.id && (
                  <button
                    type="button"
                    className="module-task-edit-btn"
                    aria-label={`Edit ${task.title}`}
                    title="Edit task"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor(task);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {expandedId === task.id && (
                  <form
                    id={`task-editor-${task.id}`}
                    className="task-inline-editor"
                    onSubmit={(event) => { event.preventDefault(); save(task); }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") { event.preventDefault(); setExpandedId(null); requestAnimationFrame(() => taskButtonRefs.current[task.id]?.focus()); }
                    }}
                  >
                    <input
                      ref={titleInputRef}
                      value={draftTitle}
                      maxLength={160}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      aria-label="Task title"
                    />
                    <input
                      type="datetime-local"
                      value={draftDue}
                      onChange={(event) => setDraftDue(event.target.value)}
                      aria-label="Due date"
                    />
                    <div className="task-inline-actions">
                      <button type="submit" disabled={!draftTitle.trim()}><Check size={13} />Save</button>
                      <button type="button" onClick={() => complete(task)}><Check size={13} />Complete</button>
                      <button type="button" onClick={() => setDraftDue(localInputValue(new Date(Date.now() + 86400000)))}><CalendarClock size={13} />Tomorrow</button>
                      <button type="button" className="is-danger" onClick={() => remove(task)}><Trash2 size={13} />Delete</button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}

          {isDraftingNew ? (
            <div className="task-module-item task-module-new-entry is-active">
              <span className="module-task-check placeholder" aria-hidden="true">[ ]</span>
              <input
                ref={newDraftInputRef}
                type="text"
                className="task-new-inline-input"
                placeholder="New task..."
                value={newDraftTitle}
                onChange={(e) => setNewDraftTitle(e.target.value)}
                onKeyDown={handleNewDraftKeyDown}
                onBlur={handleNewDraftBlur}
                aria-label="New task title"
                autoFocus
              />
            </div>
          ) : (
            <div
              className={`task-module-next-line ${visibleTasks.length === 0 ? "is-empty-state" : ""}`}
              role="button"
              tabIndex={0}
              onClick={startNewDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  startNewDraft();
                }
              }}
              aria-label="Add task"
            >
              <span className="module-task-check placeholder" aria-hidden="true">[ ]</span>
              <span className="task-next-line-prompt">
                {visibleTasks.length === 0 ? "No tasks in this view. Click to add a task..." : "New task..."}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
