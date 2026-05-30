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
  code: "",
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
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverPriority, setDragOverPriority] = useState("")
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      setIsLoading(true)
      setError("")

      try {
        const [taskResults, categoryResults, moduleResults] = await Promise.all([
          getTasks(token),
          getCategories(token),
          getAcademicModules(token),
        ])

        if (cancelled) {
          return
        }

        setTasks(taskResults)
        setCategories(categoryResults)
        setAcademicModules(moduleResults)

        if (currentUser?.canvas_token) {
          try {
            const syncedTasks = await syncCanvasTasks(token)
            const syncedModules = await getAcademicModules(token)

            if (!cancelled) {
              setTasks(syncedTasks)
              setAcademicModules(syncedModules)
            }
          } catch {
            if (!cancelled) {
              setNotice("Planner loaded. Canvas sync is available from the button.")
            }
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load the Task Manager.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [token, currentUser?.canvas_token])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 60000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const visibleTasks = sortTasks(
    tasks.filter((task) => {
      if (statusFilter !== "done" && task.status === "done") {
        return false
      }
      if (
        statusFilter !== "done" &&
        task.source_type === "canvas" &&
        isPastDue(task)
      ) {
        return false
      }
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false
      }
      if (moduleFilter !== "all" && String(task.module_id || "") !== moduleFilter) {
        return false
      }
      return true
    })
  )
  const dueSoonTasks = visibleTasks.filter((task) => {
    if (!task.effective_due_at) {
      return false
    }

    const dueTime = new Date(task.effective_due_at).getTime()
    const cutoff = currentTime + 1000 * 60 * 60 * 72
    return dueTime <= cutoff
  })
  const plannedHours = visibleTasks.reduce((total, task) => {
    return total + (task.estimated_minutes || 0)
  }, 0)

  const visibleTasksByPriority = priorityLanes.reduce((groups, lane) => {
    groups[lane.value] = visibleTasks.filter(
      (task) => task.priority_manual === lane.value
    )
    return groups
  }, {})

  async function reloadTasksOnly() {
    setBusyKey("canvas-sync")
    setError("")
    setNotice("")

    try {
      const refreshedTasks = currentUser?.canvas_token
        ? await syncCanvasTasks(token)
        : await getTasks(token)
      setTasks(refreshedTasks)
      setNotice(
        currentUser?.canvas_token ? "Canvas tasks synced." : "Tasks refreshed."
      )
    } catch (refreshError) {
      setError(refreshError.message || "Could not refresh tasks.")
    } finally {
      setBusyKey("")
    }
  }

  async function reloadWorkspace() {
    if (currentUser?.canvas_token) {
      await syncCanvasTasks(token)
    }

    const [taskResults, categoryResults, moduleResults] = await Promise.all([
      getTasks(token),
      getCategories(token),
      getAcademicModules(token),
    ])

    setTasks(taskResults)
    setCategories(categoryResults)
    setAcademicModules(moduleResults)
  }

  async function handleTaskSubmit(event) {
    event.preventDefault()
    setBusyKey("task-create")
    setError("")
    setNotice("")

    try {
      const newTask = await createTask(token, {
        title: taskForm.title,
        description: taskForm.description,
        module_id: taskForm.moduleId ? Number(taskForm.moduleId) : null,
        category_id: taskForm.categoryId ? Number(taskForm.categoryId) : null,
        priority_manual: taskForm.priorityManual,
        estimated_minutes: taskForm.estimatedMinutes
          ? Number(taskForm.estimatedMinutes)
          : null,
        due_at_override: taskForm.dueAtOverride
          ? new Date(taskForm.dueAtOverride).toISOString()
          : null,
      })

      setTasks((current) => sortTasks([newTask, ...current]))
      setTaskForm(emptyTaskForm)
      setNotice("Task added to your planner.")
    } catch (submitError) {
      setError(submitError.message || "Could not create the task.")
    } finally {
      setBusyKey("")
    }
  }

  function handleTaskDragStart(event, taskId) {
    setDraggedTaskId(taskId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(taskId))
  }

  function handleTaskDragEnd() {
    setDraggedTaskId(null)
    setDragOverPriority("")
  }

  async function handlePriorityDrop(event, priorityValue) {
    event.preventDefault()
    const taskId = Number(event.dataTransfer.getData("text/plain") || draggedTaskId)
    setDragOverPriority("")
    setDraggedTaskId(null)

    if (!taskId) {
      return
    }

    const task = tasks.find((candidate) => candidate.id === taskId)
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
        code: moduleForm.code,
        name: moduleForm.name,
      })

      setAcademicModules((current) =>
        [...current, moduleRecord].sort((left, right) =>
          `${left.code}${left.name}`.localeCompare(`${right.code}${right.name}`)
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

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="loading-panel">
          <p className="eyebrow">Task Manager</p>
          <h1>Loading your planning workspace...</h1>
          <p>We're gathering tasks, modules, and categories for {currentUser.email}.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">CanVenient Task Manager</p>
          <h1>Plan your coursework and personal work here.</h1>
        </div>

        <div className="hero-actions">
          <div className="user-chip">
            <span>Signed in as</span>
            <strong>{currentUser.email}</strong>
          </div>
          <button className="secondary-button" type="button" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span>Open tasks</span>
          <strong>{visibleTasks.length}</strong>
        </article>
        <article className="summary-card">
          <span>Due within 72h</span>
          <strong>{dueSoonTasks.length}</strong>
        </article>
        <article className="summary-card">
          <span>Planned effort</span>
          <strong>{Math.round(plannedHours / 60)} hrs</strong>
        </article>
      </section>

      {(error || notice) && (
        <section className="feedback-row">
          {error && <p className="status-banner error">{error}</p>}
          {!error && notice && <p className="status-banner success">{notice}</p>}
        </section>
      )}

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Capture</p>
              <h2>Add a task</h2>
            </div>
            <p className="panel-copy">
              Link tasks to modules and categories, set a priority, and estimate
              effort.
            </p>
          </div>

          <form className="stack-form" onSubmit={handleTaskSubmit}>
            <label>
              <span>Task title</span>
              <input
                type="text"
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

            <label>
              <span>Notes</span>
              <textarea
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

            <div className="form-grid two-up">
              <label>
                <span>Module</span>
                <select
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
                      {moduleRecord.code} - {moduleRecord.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Category</span>
                <select
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

            <div className="form-grid three-up">
              <label>
                <span>Priority</span>
                <select
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

              <label>
                <span>Time needed (mins)</span>
                <input
                  type="number"
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

              <label>
                <span>Due date</span>
                <input
                  type="datetime-local"
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
              className="primary-button"
              type="submit"
              disabled={busyKey === "task-create"}
            >
              {busyKey === "task-create" ? "Adding task..." : "Add Task"}
            </button>
          </form>
        </article>

        <article className="panel panel-accent">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Structure</p>
              <h2>Modules and categories</h2>
            </div>
            <p className="panel-copy">
              Keep academic modules separate from personal categories so Canvas
              sync can slot into the same structure later.
            </p>
          </div>

          <div className="mini-grid">
            <form className="stack-form compact" onSubmit={handleModuleSubmit}>
              <h3>Academic modules</h3>
              <label>
                <span>Module code</span>
                <input
                  type="text"
                  value={moduleForm.code}
                  onChange={(event) =>
                    setModuleForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  placeholder="CS2103T"
                  required
                />
              </label>
              <label>
                <span>Module name</span>
                <input
                  type="text"
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
                className="secondary-button"
                type="submit"
                disabled={busyKey === "module-create"}
              >
                {busyKey === "module-create" ? "Saving..." : "Save Module"}
              </button>

              <div className="tag-list">
                {academicModules.map((moduleRecord) => (
                  <div className="tag-card" key={moduleRecord.id}>
                    <div>
                      <strong>{moduleRecord.code}</strong>
                      {moduleRecord.name &&
                        moduleRecord.name !== moduleRecord.code && (
                          <span>{moduleRecord.name}</span>
                        )}
                    </div>
                    {moduleRecord.source_type !== "canvas" && (
                      <button
                        className="tag-delete"
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

            <form className="stack-form compact" onSubmit={handleCategorySubmit}>
              <h3>Personal categories</h3>
              <label>
                <span>Category name</span>
                <input
                  type="text"
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
              <label>
                <span>Color</span>
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
              </label>
              <button
                className="secondary-button"
                type="submit"
                disabled={busyKey === "category-create"}
              >
                {busyKey === "category-create" ? "Saving..." : "Save Category"}
              </button>

              <div className="tag-list">
                {categories.map((category) => (
                  <div className="tag-card" key={category.id}>
                    <div className="category-badge-row">
                      <span
                        className="color-dot"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                      <strong>{category.name}</strong>
                    </div>
                    <button
                      className="tag-delete"
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

      <section className="panel">
        <div className="panel-heading split">
          <div>
            <p className="eyebrow">Execution</p>
            <h2>Task board</h2>
          </div>

          <div className="toolbar">
            <label>
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>

            <label>
              <span>Module</span>
              <select
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option value="all">All modules</option>
                {academicModules.map((moduleRecord) => (
                  <option key={moduleRecord.id} value={String(moduleRecord.id)}>
                    {moduleRecord.code}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="secondary-button compact-button"
              type="button"
              onClick={reloadTasksOnly}
              disabled={busyKey !== "" || !currentUser?.canvas_token}
            >
              {busyKey === "canvas-sync" ? "Syncing..." : "Sync Canvas"}
            </button>
          </div>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="empty-state">
            <h3>No tasks yet</h3>
            <p>
              Start with one manual task now, or sync Canvas to bring in your
              assignments and due dates.
            </p>
          </div>
        ) : (
          <div className="priority-board">
            {priorityLanes.map((lane) => (
              <section
                className={`priority-column ${
                  dragOverPriority === lane.value ? "drag-over" : ""
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
                <div className="priority-column-heading">
                  <h3>{lane.label}</h3>
                  <span>{visibleTasksByPriority[lane.value].length}</span>
                </div>

                <div className="task-list">
                  {visibleTasksByPriority[lane.value].length === 0 ? (
                    <p className="empty-message-subtle">Drop tasks here.</p>
                  ) : (
                    visibleTasksByPriority[lane.value].map((task) => (
                      <article
                        className={`task-card task-${task.status} ${
                          draggedTaskId === task.id ? "is-dragging" : ""
                        }`}
                        draggable={busyKey === ""}
                        key={task.id}
                        onDragStart={(event) =>
                          handleTaskDragStart(event, task.id)
                        }
                        onDragEnd={handleTaskDragEnd}
                      >
                        <div className="task-card-top">
                          <div>
                            <p className="task-meta">
                              {task.module_code || "No module"}
                              {task.category_name
                                ? ` - ${task.category_name}`
                                : ""}
                            </p>
                            <h3>{task.title}</h3>
                          </div>

                          {task.source_type !== "canvas" && (
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={busyKey === `task-delete-${task.id}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        {task.description && (
                          <p className="task-description">
                            {task.description}
                          </p>
                        )}

                        <div className="task-facts">
                          <span>
                            Source: <strong>{task.source_type}</strong>
                          </span>
                          <span>
                            Due:{" "}
                            <strong>{formatDueDate(task.effective_due_at)}</strong>
                          </span>
                          <span>
                            Suggested: <strong>{task.recommended_priority}</strong>
                          </span>
                        </div>

                        {task.external_url && (
                          <a
                            className="external-task-link"
                            href={task.external_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in Canvas
                          </a>
                        )}

                        <div className="task-controls">
                          <label>
                            <span>Status</span>
                            <select
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

                          <label>
                            <span>Priority</span>
                            <select
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
