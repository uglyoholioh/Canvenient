import { useEffect, useState } from "react";

import {
  createCategory,
  createTask,
  deleteCategory,
  deleteTask,
  getAcademicModules,
  getCategories,
  getTasks,
  syncCanvasTasks,
  updateTask,
} from "../api";

const emptyTaskForm = {
  title: "",
  description: "",
  moduleId: "",
  categoryId: "",
  priorityManual: "medium",
  dueAtOverride: "",
};

const emptyCategoryForm = {
  name: "",
  color: "#2F7A72",
};

const categoryColorPresets = [
  { label: "Teal", value: "#2F7A72" },
  { label: "Blue", value: "#3B6EA8" },
  { label: "Purple", value: "#7656A6" },
  { label: "Rose", value: "#B85C70" },
  { label: "Orange", value: "#C8753D" },
  { label: "Gold", value: "#B6922E" },
];

const priorityLanes = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function formatDueDate(value) {
  if (!value) {
    return "No due date";
  }

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sortTasks(taskList) {
  return [...taskList].sort((left, right) => {
    if (left.status === "done" && right.status !== "done") {
      return 1;
    }

    if (left.status !== "done" && right.status === "done") {
      return -1;
    }

    const leftDue = left.effective_due_at
      ? new Date(left.effective_due_at).getTime()
      : Number.POSITIVE_INFINITY;
    const rightDue = right.effective_due_at
      ? new Date(right.effective_due_at).getTime()
      : Number.POSITIVE_INFINITY;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  });
}

function isPastDue(task, currentTime) {
  if (!task.effective_due_at) {
    return false;
  }

  return new Date(task.effective_due_at).getTime() <= currentTime;
}

async function loadWorkspaceData(token) {
  const [allTasks, allCategories, allModules] = await Promise.all([
    getTasks(token),
    getCategories(token),
    getAcademicModules(token),
  ]);

  return {
    tasks: sortTasks(allTasks),
    categories: allCategories.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    academicModules: allModules.sort((left, right) =>
      `${left.module_code}${left.name}`.localeCompare(
        `${right.module_code}${right.name}`,
      ),
    ),
  };
}

function TaskManagerDashboard({ token, currentUser, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [academicModules, setAcademicModules] = useState([]);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [statusFilter, setStatusFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState("");
  const [dragOverPriority, setDragOverPriority] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  async function reloadWorkspace() {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      const workspace = await loadWorkspaceData(token);
      setTasks(workspace.tasks);
      setCategories(workspace.categories);
      setAcademicModules(workspace.academicModules);
    } catch (loadError) {
      setError(loadError.message || "Failed to load workspace data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialWorkspace() {
      try {
        const workspace = await loadWorkspaceData(token);
        if (cancelled) return;
        setTasks(workspace.tasks);
        setCategories(workspace.categories);
        setAcademicModules(workspace.academicModules);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load workspace data.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (token) loadInitialWorkspace();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function reloadTasksOnly() {
    setBusyKey("canvas-sync");
    setError("");
    setNotice("");

    try {
      await syncCanvasTasks(token);
      const workspace = await loadWorkspaceData(token);
      setTasks(workspace.tasks);
      setCategories(workspace.categories);
      setAcademicModules(workspace.academicModules);
      setNotice("Synced successfully with Canvas.");
    } catch (syncError) {
      setError(syncError.message || "Canvas sync failed.");
    } finally {
      setBusyKey("");
    }
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    setBusyKey("task-create");
    setError("");
    setNotice("");

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      status: "todo",
      priority_manual: taskForm.priorityManual,
    };

    if (taskForm.moduleId) {
      payload.module_id = Number.parseInt(taskForm.moduleId, 10);
    }
    if (taskForm.categoryId) {
      payload.category_id = Number.parseInt(taskForm.categoryId, 10);
    }
    if (taskForm.dueAtOverride.trim()) {
      payload.due_at_override = new Date(taskForm.dueAtOverride).toISOString();
    }

    try {
      const created = await createTask(token, payload);
      setTasks((current) => sortTasks([...current, created]));
      setTaskForm(emptyTaskForm);
      setNotice("Task captured.");
    } catch (submitError) {
      setError(submitError.message || "Could not add task.");
    } finally {
      setBusyKey("");
    }
  }

  function handleTaskDragStart(event, taskId) {
    if (busyKey !== "") {
      event.preventDefault();
      return;
    }
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
  }

  function handleTaskDragEnd() {
    setDraggedTaskId("");
    setDragOverPriority("");
  }

  async function handlePriorityDrop(event, priorityValue) {
    event.preventDefault();
    setDragOverPriority("");

    const taskIdStr = event.dataTransfer.getData("text/plain");
    if (!taskIdStr) {
      return;
    }

    const taskId = Number.parseInt(taskIdStr, 10);
    const task = tasks.find((t) => t.id === taskId);

    if (!task || task.priority_manual === priorityValue) {
      return;
    }

    await handleTaskPriorityChange(taskId, priorityValue);
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    setBusyKey("category-create");
    setError("");
    setNotice("");

    try {
      const category = await createCategory(token, {
        name: categoryForm.name,
        color: categoryForm.color,
      });

      setCategories((current) =>
        [...current, category].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setCategoryForm(emptyCategoryForm);
      setNotice("Category added.");
    } catch (submitError) {
      setError(submitError.message || "Could not create the category.");
    } finally {
      setBusyKey("");
    }
  }

  async function handleTaskStatusChange(taskId, statusValue) {
    setBusyKey(`task-status-${taskId}`);
    setError("");

    try {
      const updated = await updateTask(token, taskId, { status: statusValue });
      setTasks((current) =>
        sortTasks(current.map((task) => (task.id === taskId ? updated : task))),
      );
    } catch (updateError) {
      setError(updateError.message || "Could not update the task.");
    } finally {
      setBusyKey("");
    }
  }

  async function handleTaskPriorityChange(taskId, priorityValue) {
    setBusyKey(`task-priority-${taskId}`);
    setError("");

    try {
      const updated = await updateTask(token, taskId, {
        priority_manual: priorityValue,
      });
      setTasks((current) =>
        sortTasks(current.map((task) => (task.id === taskId ? updated : task))),
      );
    } catch (updateError) {
      setError(updateError.message || "Could not update the task.");
    } finally {
      setBusyKey("");
    }
  }

  async function handleDeleteTask(taskId) {
    setBusyKey(`task-delete-${taskId}`);
    setError("");

    try {
      await deleteTask(token, taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove the task.");
    } finally {
      setBusyKey("");
    }
  }

  async function handleDeleteCategory(categoryId) {
    setBusyKey(`category-delete-${categoryId}`);
    setError("");

    try {
      await deleteCategory(token, categoryId);
      await reloadWorkspace();
      setNotice("Category removed. Tasks linked to it were kept.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove the category.");
    } finally {
      setBusyKey("");
    }
  }

  const visibleTasks = tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) {
      return false;
    }
    if (moduleFilter !== "all" && String(task.module_id) !== moduleFilter) {
      return false;
    }
    return true;
  });

  const visibleTasksByPriority = {
    urgent: visibleTasks.filter((t) => t.priority_manual === "urgent"),
    high: visibleTasks.filter((t) => t.priority_manual === "high"),
    medium: visibleTasks.filter((t) => t.priority_manual === "medium"),
    low: visibleTasks.filter((t) => t.priority_manual === "low"),
  };

  const dueSoonTasks = tasks.filter(
    (task) =>
      task.status !== "done" &&
      task.effective_due_at &&
      new Date(task.effective_due_at).getTime() - currentTime <= 259200000 &&
      new Date(task.effective_due_at).getTime() > currentTime,
  );

  const completedTaskCount = tasks.filter(
    (task) => task.status === "done",
  ).length;
  const completionPercentage = tasks.length
    ? Math.round((completedTaskCount / tasks.length) * 100)
    : 0;

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="card card--xl state-box">
          <p className="eyebrow">Task Manager</p>
          <h1>Loading your planning workspace...</h1>
          <p className="text-muted">
            We're gathering tasks, modules, and categories for{" "}
            {currentUser?.email}.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section
        className="card card--hero flex justify-between items-start"
        style={{ gap: "20px" }}
      >
        <div>
          <p className="eyebrow">CanVenient Task Manager</p>
          <h1>Plan your coursework and personal work here.</h1>
        </div>

        <div className="hero-actions">
          <div className="user-chip">
            <span>Signed in as</span>
            <strong>{currentUser.email}</strong>
          </div>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={onLogout}
          >
            Log Out
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <article className="card card--summary task-completion-card">
          <div
            className="task-completion-wheel"
            style={{ "--completion": `${completionPercentage * 3.6}deg` }}
            role="img"
            aria-label={`${completionPercentage}% of tasks completed`}
          >
            <div className="task-completion-wheel__center">
              <strong>{completionPercentage}%</strong>
            </div>
          </div>
          <div className="task-completion-copy">
            <span>Tasks completed</span>
            <strong>
              {completedTaskCount} / {tasks.length}
            </strong>
            <small>{tasks.length - completedTaskCount} not done</small>
          </div>
        </article>
        <article className="card card--summary due-soon-card">
          <div className="due-soon-card__icon" aria-hidden="true">
            !
          </div>
          <div className="due-soon-card__copy">
            <span>Due within 72 hours</span>
            <strong>{dueSoonTasks.length}</strong>
            <small>
              {dueSoonTasks.length === 1
                ? "task needs your attention"
                : "tasks need your attention"}
            </small>
          </div>
        </article>
      </section>

      {(error || notice) && (
        <section className="flex w-full">
          {error && (
            <p
              className="badge badge--danger w-full text-center"
              style={{ display: "block", padding: "12px", borderRadius: "8px" }}
            >
              {error}
            </p>
          )}
          {!error && notice && (
            <p
              className="badge badge--success w-full text-center"
              style={{ display: "block", padding: "12px", borderRadius: "8px" }}
            >
              {notice}
            </p>
          )}
        </section>
      )}

      <section className="workspace-grid">
        <article className="card card--xl">
          <div className="flex-col gap-md" style={{ marginBottom: "22px" }}>
            <div>
              <p className="eyebrow">Capture</p>
              <h2>Add a task</h2>
            </div>
            <p className="text-base text">
              Link tasks to modules and categories, set a priority, and choose a
              due date.
            </p>
          </div>

          <form className="form" onSubmit={handleTaskSubmit}>
            <label className="form-group">
              <span>Task title</span>
              <input
                type="text"
                className="form-input"
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Finish CS2100 lab write-up"
                required
              />
            </label>

            <label className="form-group">
              <span>Notes</span>
              <textarea
                className="form-input"
                rows="3"
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Break this into subtasks or add context."
              />
            </label>

            <div className="form-grid form-grid--2col">
              <label className="form-group">
                <span>Module</span>
                <select
                  className="form-input"
                  value={taskForm.moduleId}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      moduleId: event.target.value,
                    }))
                  }
                >
                  <option value="">None</option>
                  {academicModules.map((moduleRecord) => (
                    <option key={moduleRecord.id} value={moduleRecord.id}>
                      {moduleRecord.module_code} - {moduleRecord.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-group">
                <span>Category</span>
                <select
                  className="form-input"
                  value={taskForm.categoryId}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">None</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid form-grid--2col">
              <label className="form-group">
                <span>Priority</span>
                <select
                  className="form-input"
                  value={taskForm.priorityManual}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      priorityManual: event.target.value,
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>

              <label className="form-group">
                <span>Due date</span>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={taskForm.dueAtOverride}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      dueAtOverride: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <button
              className="btn btn--primary"
              type="submit"
              disabled={busyKey === "task-create"}
            >
              {busyKey === "task-create" ? "Adding task..." : "Add Task"}
            </button>
          </form>
        </article>

        <article className="card card--xl card--accent">
          <div className="flex-col gap-md" style={{ marginBottom: "22px" }}>
            <div>
              <p className="eyebrow">Structure</p>
              <h2>Personal categories</h2>
            </div>
            <p className="text-base text">
              Create colour-coded categories to organise tasks in a way that
              works for you.
            </p>
          </div>

          <form className="form" onSubmit={handleCategorySubmit}>
            <label className="form-group">
              <span>Category name</span>
              <input
                type="text"
                className="form-input"
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Revision"
                required
              />
            </label>
            <fieldset className="form-group category-color-fieldset">
              <legend>Category colour</legend>
              <div className="category-color-presets">
                {categoryColorPresets.map((preset) => (
                  <button
                    className={`category-color-swatch${
                      categoryForm.color.toLowerCase() ===
                      preset.value.toLowerCase()
                        ? " category-color-swatch--selected"
                        : ""
                    }`}
                    type="button"
                    key={preset.value}
                    style={{ "--swatch-color": preset.value }}
                    onClick={() =>
                      setCategoryForm((current) => ({
                        ...current,
                        color: preset.value,
                      }))
                    }
                    aria-label={`Use ${preset.label}`}
                    aria-pressed={
                      categoryForm.color.toLowerCase() ===
                      preset.value.toLowerCase()
                    }
                    title={preset.label}
                  />
                ))}
              </div>
              <label className="category-custom-color">
                <span>Custom colour</span>
                <input
                  type="color"
                  value={categoryForm.color}
                  onChange={(event) =>
                    setCategoryForm((current) => ({
                      ...current,
                      color: event.target.value,
                    }))
                  }
                />
                <code>{categoryForm.color.toUpperCase()}</code>
              </label>
            </fieldset>
            <button
              className="btn btn--secondary"
              type="submit"
              disabled={busyKey === "category-create"}
            >
              {busyKey === "category-create" ? "Saving..." : "Save Category"}
            </button>

            <div className="list" style={{ marginTop: "16px" }}>
              {categories.length === 0 && (
                <p className="text-sm text-muted">
                  Your categories will appear here.
                </p>
              )}
              {categories.map((category) => (
                <div
                  className="list-item list-item--compact list-item--row"
                  key={category.id}
                >
                  <div className="flex items-center gap-sm">
                    <span
                      className="color-dot"
                      style={{ backgroundColor: category.color }}
                      aria-hidden="true"
                    />
                    <strong className="text-h">{category.name}</strong>
                  </div>
                  <button
                    className="btn btn--ghost-danger btn--sm"
                    type="button"
                    onClick={() => handleDeleteCategory(category.id)}
                    disabled={busyKey === `category-delete-${category.id}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </form>
        </article>
      </section>

      <section className="card card--xl" style={{ marginTop: "24px" }}>
        <div
          className="flex justify-between items-end flex-wrap gap-md"
          style={{ marginBottom: "22px" }}
        >
          <div>
            <p className="eyebrow">Execution</p>
            <h2>Task board</h2>
          </div>

          <div
            className="flex gap-md flex-wrap items-end"
            style={{ marginLeft: "auto" }}
          >
            <label className="form-group">
              <span>Status</span>
              <select
                className="form-input"
                className="text-sm"
                style={{ padding: "8px 12px" }}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>

            <label className="form-group">
              <span>Module</span>
              <select
                className="form-input"
                className="text-sm"
                style={{ padding: "8px 12px" }}
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option value="all">All modules</option>
                {academicModules.map((moduleRecord) => (
                  <option key={moduleRecord.id} value={String(moduleRecord.id)}>
                    {moduleRecord.module_code}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="btn btn--secondary btn--sm"
              type="button"
              onClick={reloadTasksOnly}
              disabled={busyKey !== "" || !currentUser?.canvas_token}
            >
              {busyKey === "canvas-sync" ? "Syncing..." : "Sync Canvas"}
            </button>
          </div>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="state-box state-box--dashed">
            <h3>No tasks yet</h3>
            <p>
              Start with one manual task now, or sync Canvas to bring in your
              assignments and due dates.
            </p>
          </div>
        ) : (
          <div className="planner-board">
            {priorityLanes.map((lane) => (
              <section
                className={`planner-column ${
                  dragOverPriority === lane.value
                    ? "planner-column--dragover"
                    : ""
                }`}
                key={lane.value}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverPriority(lane.value);
                }}
                onDragLeave={() => setDragOverPriority("")}
                onDrop={(event) => handlePriorityDrop(event, lane.value)}
              >
                <div className="planner-column-header">
                  <h3>{lane.label}</h3>
                  <span>{visibleTasksByPriority[lane.value].length}</span>
                </div>

                <div className="list">
                  {visibleTasksByPriority[lane.value].length === 0 ? (
                    <p
                      className="text-sm text-muted text-center"
                      style={{ fontStyle: "italic", padding: "10px 0" }}
                    >
                      Drop tasks here.
                    </p>
                  ) : (
                    visibleTasksByPriority[lane.value].map((task) => (
                      <article
                        className={`card--draggable card--status-${task.status === "in_progress" ? "progress" : task.status} ${
                          draggedTaskId === task.id ? "is-dragging" : ""
                        }`}
                        draggable={busyKey === ""}
                        key={task.id}
                        onDragStart={(event) =>
                          handleTaskDragStart(event, task.id)
                        }
                        onDragEnd={handleTaskDragEnd}
                      >
                        <div className="flex justify-between items-start gap-lg">
                          <div>
                            <p
                              style={{
                                margin: "0 0 10px",
                                padding: "4px 8px",
                                backgroundColor: "var(--surface-warm)",
                                borderRadius: "var(--radius-pill)",
                                display: "inline-block",
                                fontSize: "12px",
                                color: "var(--text-muted)",
                              }}
                            >
                              {task.module_code || "No module"}
                              {task.category_name
                                ? ` - ${task.category_name}`
                                : ""}
                            </p>
                            <h3 className="text-h" style={{ fontSize: "18px" }}>
                              {task.title}
                            </h3>
                          </div>

                          {task.source_type !== "canvas" && (
                            <button
                              className="btn btn--ghost-danger btn--sm"
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={busyKey === `task-delete-${task.id}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-base text line-clamp-3">
                            {task.description}
                          </p>
                        )}

                        <div className="flex gap-md flex-wrap">
                          <span className="text-xs text-muted">
                            Source:{" "}
                            <strong className="text-h">
                              {task.source_type}
                            </strong>
                          </span>
                          <span className="text-xs text-muted">
                            Due:{" "}
                            <strong
                              className={
                                isPastDue(task, currentTime) &&
                                task.status !== "done"
                                  ? "text-error"
                                  : "text-h"
                              }
                            >
                              {formatDueDate(task.effective_due_at)}
                            </strong>
                          </span>
                          <span className="text-xs text-muted">
                            Suggested:{" "}
                            <strong className="text-h">
                              {task.recommended_priority}
                            </strong>
                          </span>
                        </div>

                        {task.external_url && (
                          <a
                            className="text-info no-underline text-sm"
                            style={{ fontWeight: "700" }}
                            href={task.external_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in Canvas
                          </a>
                        )}

                        <div style={{ marginTop: "10px" }}>
                          <label className="form-group">
                            <span>Status</span>
                            <select
                              className="form-input text-xs"
                              style={{ padding: "6px 10px" }}
                              value={task.status}
                              onChange={(event) =>
                                handleTaskStatusChange(
                                  task.id,
                                  event.target.value,
                                )
                              }
                              disabled={busyKey === `task-status-${task.id}`}
                            >
                              <option value="todo">To do</option>
                              <option value="in_progress">In progress</option>
                              <option value="done">Done</option>
                            </select>
                          </label>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default TaskManagerDashboard;
