import { useEffect, useState } from "react"

import {
  createAcademicModule,
  createCategory,
  createTask,
  deleteAcademicModule,
  deleteCategory,
  deleteTask,
  getAcademicModules,
  getCategories,
  getTasks,
  syncCanvasTasks,
  updateTask,
} from "../api"

const emptyTaskForm = {
  title: "",
  description: "",
  moduleId: "",
  categoryId: "",
  priorityManual: "medium",
  estimatedMinutes: "",
  dueAtOverride: "",
}

const emptyCategoryForm = {
  name: "",
  color: "#2F7A72",
}

const emptyModuleForm = {
  moduleCode: "",
  name: "",
}

const priorityLanes = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

function formatDueDate(value) {
  if (!value) {
    return "No due date"
  }

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function sortTasks(taskList) {
  return [...taskList].sort((left, right) => {
    if (left.status === "done" && right.status !== "done") {
      return 1
    }

    if (left.status !== "done" && right.status === "done") {
      return -1
    }

    const leftDue = left.effective_due_at
      ? new Date(left.effective_due_at).getTime()
      : Number.POSITIVE_INFINITY
    const rightDue = right.effective_due_at
      ? new Date(right.effective_due_at).getTime()
      : Number.POSITIVE_INFINITY

    if (leftDue !== rightDue) {
      return leftDue - rightDue
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
}

function isPastDue(task) {
  if (!task.effective_due_at) {
    return false
  }

  return new Date(task.effective_due_at).getTime() <= Date.now()
}

function TaskManagerDashboard({ token, currentUser, onLogout }) {
  const [tasks, setTasks] = useState([])
  const [categories, setCategories] = useState([])
  const [academicModules, setAcademicModules] = useState([])
  const [taskForm, setTaskForm] = useState(emptyTaskForm)
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [moduleForm, setModuleForm] = useState(emptyModuleForm)
  const [statusFilter, setStatusFilter] = useState("all")
  const [moduleFilter, setModuleFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyKey, setBusyKey] = useState("")
  const [draggedTaskId, setDraggedTaskId] = useState("")
  const [dragOverPriority, setDragOverPriority] = useState("")

  async function reloadWorkspace() {
    setIsLoading(true)
    setError("")
    setNotice("")

    try {
      const [allTasks, allCategories, allModules] = await Promise.all([
        getTasks(token),
        getCategories(token),
        getAcademicModules(token),
      ])

      setTasks(sortTasks(allTasks))
      setCategories(allCategories.sort((left, right) => left.name.localeCompare(right.name)))
      setAcademicModules(
        allModules.sort((left, right) =>
          `${left.module_code}${left.name}`.localeCompare(`${right.module_code}${right.name}`)
        )
      )
    } catch (loadError) {
      setError(loadError.message || "Failed to load workspace data.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      reloadWorkspace()
    }
  }, [token])

  async function reloadTasksOnly() {
    setBusyKey("canvas-sync")
    setError("")
    setNotice("")

    try {
      await syncCanvasTasks(token)
      const allTasks = await getTasks(token)
      setTasks(sortTasks(allTasks))
      setNotice("Synced successfully with Canvas.")
    } catch (syncError) {
      setError(syncError.message || "Canvas sync failed.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleTaskSubmit(event) {
    event.preventDefault()
    setBusyKey("task-create")
    setError("")
    setNotice("")

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      status: "todo",
      priority_manual: taskForm.priorityManual,
    }

    if (taskForm.moduleId) {
      payload.module_id = Number.parseInt(taskForm.moduleId, 10)
    }
    if (taskForm.categoryId) {
      payload.category_id = Number.parseInt(taskForm.categoryId, 10)
    }
    if (taskForm.estimatedMinutes.trim()) {
      payload.estimated_minutes = Number.parseInt(taskForm.estimatedMinutes, 10)
    }
    if (taskForm.dueAtOverride.trim()) {
      payload.due_at_override = new Date(taskForm.dueAtOverride).toISOString()
    }

    try {
      const created = await createTask(token, payload)
      setTasks((current) => sortTasks([...current, created]))
      setTaskForm(emptyTaskForm)
      setNotice("Task captured.")
    } catch (submitError) {
      setError(submitError.message || "Could not add task.")
    } finally {
      setBusyKey("")
    }
  }

  function handleTaskDragStart(event, taskId) {
    if (busyKey !== "") {
      event.preventDefault()
      return
    }
    setDraggedTaskId(taskId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(taskId))
  }

  function handleTaskDragEnd() {
    setDraggedTaskId("")
    setDragOverPriority("")
  }

  async function handlePriorityDrop(event, priorityValue) {
    event.preventDefault()
    setDragOverPriority("")

    const taskIdStr = event.dataTransfer.getData("text/plain")
    if (!taskIdStr) {
      return
    }

    const taskId = Number.parseInt(taskIdStr, 10)
    const task = tasks.find((t) => t.id === taskId)

    if (!task || task.priority_manual === priorityValue) {
      return
    }

    await handleTaskPriorityChange(taskId, priorityValue)
  }

  async function handleCategorySubmit(event) {
    event.preventDefault()
    setBusyKey("category-create")
    setError("")
    setNotice("")

    try {
      const category = await createCategory(token, {
        name: categoryForm.name,
        color: categoryForm.color,
      })

      setCategories((current) =>
        [...current, category].sort((left, right) => left.name.localeCompare(right.name))
      )
      setCategoryForm(emptyCategoryForm)
      setNotice("Category added.")
    } catch (submitError) {
      setError(submitError.message || "Could not create the category.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleModuleSubmit(event) {
    event.preventDefault()
    setBusyKey("module-create")
    setError("")
    setNotice("")

    try {
      const moduleRecord = await createAcademicModule(token, {
        module_code: moduleForm.moduleCode,
        name: moduleForm.name,
      })

      setAcademicModules((current) =>
        [...current, moduleRecord].sort((left, right) =>
          `${left.module_code}${left.name}`.localeCompare(`${right.module_code}${right.name}`)
        )
      )
      setModuleForm(emptyModuleForm)
      setNotice("Module saved for future task linking.")
    } catch (submitError) {
      setError(submitError.message || "Could not create the module.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleTaskStatusChange(taskId, statusValue) {
    setBusyKey(`task-status-${taskId}`)
    setError("")

    try {
      const updated = await updateTask(token, taskId, { status: statusValue })
      setTasks((current) =>
        sortTasks(current.map((task) => (task.id === taskId ? updated : task)))
      )
    } catch (updateError) {
      setError(updateError.message || "Could not update the task.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleTaskPriorityChange(taskId, priorityValue) {
    setBusyKey(`task-priority-${taskId}`)
    setError("")

    try {
      const updated = await updateTask(token, taskId, {
        priority_manual: priorityValue,
      })
      setTasks((current) =>
        sortTasks(current.map((task) => (task.id === taskId ? updated : task)))
      )
    } catch (updateError) {
      setError(updateError.message || "Could not update the task.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleDeleteTask(taskId) {
    setBusyKey(`task-delete-${taskId}`)
    setError("")

    try {
      await deleteTask(token, taskId)
      setTasks((current) => current.filter((task) => task.id !== taskId))
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove the task.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleDeleteCategory(categoryId) {
    setBusyKey(`category-delete-${categoryId}`)
    setError("")

    try {
      await deleteCategory(token, categoryId)
      await reloadWorkspace()
      setNotice("Category removed. Tasks linked to it were kept.")
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove the category.")
    } finally {
      setBusyKey("")
    }
  }

  async function handleDeleteModule(moduleId) {
    setBusyKey(`module-delete-${moduleId}`)
    setError("")

    try {
      await deleteAcademicModule(token, moduleId)
      await reloadWorkspace()
      setNotice("Module removed. Tasks linked to it were kept.")
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove the module.")
    } finally {
      setBusyKey("")
    }
  }

  const visibleTasks = tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) {
      return false
    }
    if (moduleFilter !== "all" && String(task.module_id) !== moduleFilter) {
      return false
    }
    return true
  })

  const visibleTasksByPriority = {
    urgent: visibleTasks.filter((t) => t.priority_manual === "urgent"),
    high: visibleTasks.filter((t) => t.priority_manual === "high"),
    medium: visibleTasks.filter((t) => t.priority_manual === "medium"),
    low: visibleTasks.filter((t) => t.priority_manual === "low"),
  }

  const dueSoonTasks = tasks.filter(
    (task) =>
      task.status !== "done" &&
      task.effective_due_at &&
      new Date(task.effective_due_at).getTime() - Date.now() <= 259200000 &&
      new Date(task.effective_due_at).getTime() > Date.now()
  )

  const plannedHours = tasks
    .filter((task) => task.status !== "done")
    .reduce((sum, task) => sum + (task.estimated_minutes || 0), 0)

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="card card--xl state-box">
          <p className="eyebrow">Task Manager</p>
          <h1>Loading your planning workspace...</h1>
          <p style={{ color: "var(--text-muted)" }}>
            We're gathering tasks, modules, and categories for {currentUser?.email}.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="card card--hero" style={{ display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">CanVenient Task Manager</p>
          <h1>Plan your coursework and personal work here.</h1>
        </div>

        <div className="hero-actions">
          <div className="user-chip">
            <span>Signed in as</span>
            <strong>{currentUser.email}</strong>
          </div>
          <button className="btn btn--secondary" type="button" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <article className="card card--summary">
          <span>Open tasks</span>
          <strong>{visibleTasks.length}</strong>
        </article>
        <article className="card card--summary">
          <span>Due within 72h</span>
          <strong>{dueSoonTasks.length}</strong>
        </article>
        <article className="card card--summary">
          <span>Planned effort</span>
          <strong>{Math.round(plannedHours / 60)} hrs</strong>
        </article>
      </section>

      {(error || notice) && (
        <section style={{ display: "flex", width: "100%" }}>
          {error && (
            <p
              className="badge badge--danger"
              style={{ display: "block", width: "100%", padding: "12px", textAlign: "center", borderRadius: "8px" }}
            >
              {error}
            </p>
          )}
          {!error && notice && (
            <p
              className="badge badge--success"
              style={{ display: "block", width: "100%", padding: "12px", textAlign: "center", borderRadius: "8px" }}
            >
              {notice}
            </p>
          )}
        </section>
      )}

      <section className="workspace-grid">
        <article className="card card--xl">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "22px" }}>
            <div>
              <p className="eyebrow">Capture</p>
              <h2>Add a task</h2>
            </div>
            <p style={{ color: "var(--text)", fontSize: "14px", lineHeight: "1.5" }}>
              Link tasks to modules and categories, set a priority, and estimate effort.
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

            <div className="form-grid form-grid--3col">
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
                <span>Time needed (mins)</span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={taskForm.estimatedMinutes}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      estimatedMinutes: event.target.value,
                    }))
                  }
                  placeholder="90"
                />
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
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "22px" }}>
            <div>
              <p className="eyebrow">Structure</p>
              <h2>Modules and categories</h2>
            </div>
            <p style={{ color: "var(--text)", fontSize: "14px", lineHeight: "1.5" }}>
              Keep academic modules separate from personal categories so Canvas sync can slot into the same structure later.
            </p>
          </div>

          <div className="form-grid form-grid--2col">
            <form className="form" onSubmit={handleModuleSubmit}>
              <h3 style={{ fontSize: "20px" }}>Academic modules</h3>
              <label className="form-group">
                <span>Module code</span>
                <input
                  type="text"
                  className="form-input"
                  value={moduleForm.moduleCode}
                  onChange={(event) =>
                    setModuleForm((current) => ({
                      ...current,
                      moduleCode: event.target.value,
                    }))
                  }
                  placeholder="CS2103T"
                  required
                />
              </label>
              <label className="form-group">
                <span>Module name</span>
                <input
                  type="text"
                  className="form-input"
                  value={moduleForm.name}
                  onChange={(event) =>
                    setModuleForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Software Engineering"
                  required
                />
              </label>
              <button
                className="btn btn--secondary"
                type="submit"
                disabled={busyKey === "module-create"}
              >
                {busyKey === "module-create" ? "Saving..." : "Save Module"}
              </button>

              <div className="list" style={{ marginTop: "16px" }}>
                {academicModules.map((moduleRecord) => (
                  <div className="list-item list-item--compact list-item--row" key={moduleRecord.id}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                      <strong style={{ color: "var(--text-h)" }}>{moduleRecord.module_code}</strong>
                      {moduleRecord.name &&
                        moduleRecord.name !== moduleRecord.module_code && (
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {moduleRecord.name}
                          </span>
                        )}
                    </div>
                    {moduleRecord.source_type !== "canvas" && (
                      <button
                        className="btn btn--ghost-danger btn--sm"
                        type="button"
                        onClick={() => handleDeleteModule(moduleRecord.id)}
                        disabled={busyKey === `module-delete-${moduleRecord.id}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </form>

            <form className="form" onSubmit={handleCategorySubmit}>
              <h3 style={{ fontSize: "20px" }}>Personal categories</h3>
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
              <label className="form-group">
                <span>Color</span>
                <input
                  type="color"
                  className="form-input"
                  style={{ height: "45px", padding: "4px" }}
                  value={categoryForm.color}
                  onChange={(event) =>
                    setCategoryForm((current) => ({
                      ...current,
                      color: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                className="btn btn--secondary"
                type="submit"
                disabled={busyKey === "category-create"}
              >
                {busyKey === "category-create" ? "Saving..." : "Save Category"}
              </button>

              <div className="list" style={{ marginTop: "16px" }}>
                {categories.map((category) => (
                  <div className="list-item list-item--compact list-item--row" key={category.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        className="color-dot"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                      <strong style={{ color: "var(--text-h)" }}>{category.name}</strong>
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
          </div>
        </article>
      </section>

      <section className="card card--xl" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "22px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p className="eyebrow">Execution</p>
            <h2>Task board</h2>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginLeft: "auto" }}>
            <label className="form-group">
              <span>Status</span>
              <select
                className="form-input"
                style={{ padding: "8px 12px", fontSize: "13px" }}
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
                style={{ padding: "8px 12px", fontSize: "13px" }}
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
              Start with one manual task now, or sync Canvas to bring in your assignments and due dates.
            </p>
          </div>
        ) : (
          <div className="planner-board">
            {priorityLanes.map((lane) => (
              <section
                className={`planner-column ${
                  dragOverPriority === lane.value ? "planner-column--dragover" : ""
                }`}
                key={lane.value}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = "move"
                  setDragOverPriority(lane.value)
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
                    <p style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "10px 0" }}>
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
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
                          <div>
                            <p
                              style={{
                                margin: "0 0 10px",
                                padding: "4px 8px",
                                backgroundColor: "var(--surface-warm)",
                                borderRadius: "var(--radius-pill)",
                                display: "inline-block",
                                fontSize: "12px",
                                color: "var(--text-muted)"
                              }}
                            >
                              {task.module_code || "No module"}
                              {task.category_name
                                ? ` - ${task.category_name}`
                                : ""}
                            </p>
                            <h3 style={{ fontSize: "18px", color: "var(--text-h)" }}>{task.title}</h3>
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
                          <p style={{ color: "var(--text)", margin: "0", fontSize: "14px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {task.description}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            Source: <strong style={{ color: "var(--text-h)" }}>{task.source_type}</strong>
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            Due:{" "}
                            <strong style={{ color: isPastDue(task) && task.status !== "done" ? "var(--error)" : "var(--text-h)" }}>
                              {formatDueDate(task.effective_due_at)}
                            </strong>
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            Suggested: <strong style={{ color: "var(--text-h)" }}>{task.recommended_priority}</strong>
                          </span>
                        </div>

                        {task.external_url && (
                          <a
                            style={{ color: "var(--info)", fontWeight: "700", textDecoration: "none", fontSize: "13px" }}
                            href={task.external_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in Canvas
                          </a>
                        )}

                        <div className="form-grid form-grid--2col" style={{ marginTop: "10px" }}>
                          <label className="form-group">
                            <span>Status</span>
                            <select
                              className="form-input"
                              style={{ padding: "6px 10px", fontSize: "12px" }}
                              value={task.status}
                              onChange={(event) =>
                                handleTaskStatusChange(
                                  task.id,
                                  event.target.value
                                )
                              }
                              disabled={busyKey === `task-status-${task.id}`}
                            >
                              <option value="todo">To do</option>
                              <option value="in_progress">In progress</option>
                              <option value="done">Done</option>
                            </select>
                          </label>

                          <label className="form-group">
                            <span>Priority</span>
                            <select
                              className="form-input"
                              style={{ padding: "6px 10px", fontSize: "12px" }}
                              value={task.priority_manual}
                              onChange={(event) =>
                                handleTaskPriorityChange(
                                  task.id,
                                  event.target.value
                                )
                              }
                              disabled={busyKey === `task-priority-${task.id}`}
                            >
                              <option value="urgent">Urgent</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
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
  )
}

export default TaskManagerDashboard
