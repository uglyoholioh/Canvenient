import { useState, useEffect, useCallback, useRef } from "react"
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Calendar,
  Tag,
  Filter,
  Check,
  X,
  Clock,
  Sparkles,
  Edit2,
  AlertCircle
} from "lucide-react"
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getCategories,
  createCategory,
  getAcademicModules
} from "../api"

export default function TasksPage({ token, currentUser }) {
  const [tasks, setTasks] = useState([])
  const [categories, setCategories] = useState([])
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState("active") // "all" | "active" | "done"
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Quick Add State
  const [newTitle, setNewTitle] = useState("")
  const [newPriority, setNewPriority] = useState("medium")
  const [newCategory, setNewCategory] = useState("")
  const [newDueDate, setNewDueDate] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Inline edit
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editTitle, setEditTitle] = useState("")

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [tRes, cRes, mRes] = await Promise.allSettled([
        getTasks(token),
        getCategories(token),
        getAcademicModules(token),
      ])
      if (tRes.status === "fulfilled" && Array.isArray(tRes.value)) {
        setTasks(tRes.value)
        localStorage.setItem("canvenient.cache.tasks", JSON.stringify(tRes.value))
      }
      if (cRes.status === "fulfilled" && Array.isArray(cRes.value)) {
        setCategories(cRes.value)
      }
      if (mRes.status === "fulfilled" && Array.isArray(mRes.value)) {
        setModules(mRes.value)
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    try {
      const cached = localStorage.getItem("canvenient.cache.tasks")
      if (cached) setTasks(JSON.parse(cached))
    } catch {}
    loadData()
  }, [loadData])

  // Quick Add handler
  const handleCreateTask = async (e) => {
    e.preventDefault()
    const trimmed = newTitle.trim()
    if (!trimmed || isSubmitting) return

    setIsSubmitting(true)
    try {
      const payload = {
        title: trimmed,
        priority_manual: newPriority,
        status: "todo",
      }
      if (newCategory) payload.category_id = Number(newCategory)
      if (newDueDate) payload.due_at_override = new Date(newDueDate).toISOString()

      const created = await createTask(token, payload)
      setTasks((prev) => [created, ...prev])
      setNewTitle("")
      setNewDueDate("")
      setNewCategory("")
      setNewPriority("medium")
    } catch (err) {
      alert(err.message || "Failed to create task")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle status
  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === "done" ? "todo" : "done"
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    )
    try {
      await updateTask(token, task.id, { status: nextStatus })
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      )
    }
  }

  // Delete task
  const handleDeleteTask = async (taskId, e) => {
    e.stopPropagation()
    if (!window.confirm("Delete this task?")) return
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    try {
      await deleteTask(token, taskId)
    } catch (err) {
      alert(err.message || "Failed to delete task")
      loadData()
    }
  }

  // Start inline editing
  const startEditing = (task) => {
    setEditingTaskId(task.id)
    setEditTitle(task.title)
  }

  // Save inline edit
  const saveInlineEdit = async (taskId) => {
    const trimmed = editTitle.trim()
    if (!trimmed) {
      setEditingTaskId(null)
      return
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: trimmed } : t))
    )
    setEditingTaskId(null)
    try {
      await updateTask(token, taskId, { title: trimmed })
    } catch {
      loadData()
    }
  }

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    // status
    if (statusFilter === "active" && t.status === "done") return false
    if (statusFilter === "done" && t.status !== "done") return false

    // priority
    if (priorityFilter !== "all" && t.priority_manual !== priorityFilter) return false

    // category
    if (categoryFilter !== "all") {
      if (t.category_id !== Number(categoryFilter)) return false
    }

    // search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const titleMatch = (t.title || "").toLowerCase().includes(q)
      const descMatch = (t.description || "").toLowerCase().includes(q)
      if (!titleMatch && !descMatch) return false
    }

    return true
  })

  const activeCount = tasks.filter((t) => t.status !== "done").length
  const doneCount = tasks.filter((t) => t.status === "done").length

  return (
    <div className="tasks-page-container">
      {/* Editorial Header */}
      <header className="page-header">
        <div>
          <span className="hub-eyebrow">TASK MANAGEMENT</span>
          <h1 className="hub-title">Planner & Tasks</h1>
          <p className="text-sm text-muted mt-xs">
            {activeCount} pending · {doneCount} completed
          </p>
        </div>
      </header>

      {/* Quick Add Form */}
      <form className="task-add-form" onSubmit={handleCreateTask}>
        <div className="task-add-main-row">
          <input
            type="text"
            className="task-add-input"
            placeholder="Write a new task... (press Enter to save)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={isSubmitting}
          />
          <button type="submit" className="btn btn--primary btn-sm" disabled={!newTitle.trim() || isSubmitting}>
            <Plus size={15} />
            <span>Add Task</span>
          </button>
        </div>

        <div className="task-add-meta-row">
          {/* Priority selector */}
          <div className="flex items-center gap-xs">
            <span className="text-xs text-muted">Priority:</span>
            {["low", "medium", "high"].map((p) => (
              <button
                key={p}
                type="button"
                className={`pill-btn ${newPriority === p ? "active" : ""}`}
                onClick={() => setNewPriority(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Category selector */}
          {categories.length > 0 && (
            <select
              className="meta-select"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            >
              <option value="">No Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Due date */}
          <input
            type="date"
            className="meta-date-input"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
        </div>
      </form>

      {/* Filter Toolbar */}
      <div className="task-filter-bar">
        {/* Status filters */}
        <div className="filter-group">
          {["active", "all", "done"].map((s) => (
            <button
              key={s}
              className={`filter-pill ${statusFilter === s ? "active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "active" ? "Active" : s === "all" ? "All Tasks" : "Completed"}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <div className="filter-group">
          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          {/* Category filter */}
          {categories.length > 0 && (
            <select
              className="filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search Input */}
        <div className="filter-search-wrap">
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="btn-icon-subtle" onClick={() => setSearchQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="task-master-list">
        {filteredTasks.length === 0 ? (
          <div className="task-empty-state">
            <Sparkles size={24} className="text-muted" />
            <p className="mt-xs">No tasks matching your filter.</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const category = categories.find((c) => c.id === task.category_id)
            const isEditing = editingTaskId === task.id

            return (
              <div
                key={task.id}
                className={`task-row ${task.status === "done" ? "is-done" : ""}`}
              >
                {/* Checkbox */}
                <button
                  className="task-checkbox-btn"
                  onClick={() => handleToggleStatus(task)}
                >
                  {task.status === "done" ? (
                    <CheckCircle2 size={18} className="text-success" />
                  ) : (
                    <Circle size={18} className="text-muted" />
                  )}
                </button>

                {/* Title / Inline input */}
                <div className="task-body" onClick={() => !isEditing && startEditing(task)}>
                  {isEditing ? (
                    <div className="task-inline-edit-wrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="task-inline-edit-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveInlineEdit(task.id)
                          if (e.key === "Escape") setEditingTaskId(null)
                        }}
                        autoFocus
                      />
                      <button className="btn-icon-subtle" onClick={() => saveInlineEdit(task.id)}>
                        <Check size={14} />
                      </button>
                      <button className="btn-icon-subtle" onClick={() => setEditingTaskId(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="task-title-wrap">
                      <span className={`task-text ${task.status === "done" ? "done-line" : ""}`}>
                        {task.title}
                      </span>
                    </div>
                  )}

                  {/* Metadata Chips */}
                  <div className="task-meta-chips">
                    {category && (
                      <span
                        className="task-chip-category"
                        style={{ borderColor: category.color, color: category.color }}
                      >
                        {category.name}
                      </span>
                    )}

                    {task.due_at_override && (
                      <span className="task-chip-due font-mono">
                        <Calendar size={11} />
                        {new Date(task.due_at_override).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}

                    {task.priority_manual && task.priority_manual !== "medium" && (
                      <span className={`task-priority-tag ${task.priority_manual}`}>
                        {task.priority_manual}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="task-actions-wrap">
                  <button
                    className="btn-icon-subtle opacity-hover"
                    onClick={(e) => handleDeleteTask(task.id, e)}
                    title="Delete task"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
