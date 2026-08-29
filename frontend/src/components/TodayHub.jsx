import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FolderOpen,
  MapPin,
  Megaphone,
  Plus,
  RefreshCw,
  Sparkles,
  Zap,
  BookOpen,
  ChevronRight
} from "lucide-react"
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getSchedule,
  getCanvasAnnouncements,
  getCanvasAssignments,
  getCategories,
  getAcademicModules
} from "../api"

export default function TodayHub({ token, currentUser }) {
  const [tasks, setTasks] = useState([])
  const [categories, setCategories] = useState([])
  const [modules, setModules] = useState([])
  const [schedule, setSchedule] = useState({ classes: [], exams: [], events: [] })
  const [announcements, setAnnouncements] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(false)
  const [quickTitle, setQuickTitle] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Load all data
  const loadAllData = useCallback(async (isSilent = false) => {
    if (!token) return
    if (!isSilent) setLoading(true)
    try {
      const [tRes, catRes, modRes, schRes, annRes, assRes] = await Promise.allSettled([
        getTasks(token),
        getCategories(token),
        getAcademicModules(token),
        getSchedule(token),
        getCanvasAnnouncements(token),
        getCanvasAssignments(token),
      ])

      if (tRes.status === "fulfilled" && Array.isArray(tRes.value)) {
        setTasks(tRes.value)
        localStorage.setItem("canvenient.cache.tasks", JSON.stringify(tRes.value))
      }
      if (catRes.status === "fulfilled" && Array.isArray(catRes.value)) {
        setCategories(catRes.value)
      }
      if (modRes.status === "fulfilled" && Array.isArray(modRes.value)) {
        setModules(modRes.value)
      }
      if (schRes.status === "fulfilled" && schRes.value) {
        setSchedule(schRes.value)
        localStorage.setItem("canvenient.cache.schedule", JSON.stringify(schRes.value))
      }
      if (annRes.status === "fulfilled" && Array.isArray(annRes.value)) {
        setAnnouncements(annRes.value)
        localStorage.setItem("canvenient.cache.announcements", JSON.stringify(annRes.value))
      }
      if (assRes.status === "fulfilled" && Array.isArray(assRes.value)) {
        setAssignments(assRes.value)
        localStorage.setItem("canvenient.cache.assignments", JSON.stringify(assRes.value))
      }
      setLastRefreshed(new Date())
    } catch (err) {
      console.error("Failed to load hub data:", err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [token])

  // Hydrate from localStorage cache instantly on mount, then trigger background fetch
  useEffect(() => {
    try {
      const cTasks = localStorage.getItem("canvenient.cache.tasks")
      if (cTasks) setTasks(JSON.parse(cTasks))
      const cSch = localStorage.getItem("canvenient.cache.schedule")
      if (cSch) setSchedule(JSON.parse(cSch))
      const cAnn = localStorage.getItem("canvenient.cache.announcements")
      if (cAnn) setAnnouncements(JSON.parse(cAnn))
      const cAss = localStorage.getItem("canvenient.cache.assignments")
      if (cAss) setAssignments(JSON.parse(cAss))
    } catch {}

    loadAllData(false)

    // Background refresh interval every 5 minutes
    const interval = setInterval(() => {
      loadAllData(true)
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [loadAllData])

  // Handle Quick Add Task
  const handleQuickAdd = async (e) => {
    e.preventDefault()
    const trimmed = quickTitle.trim()
    if (!trimmed || isSubmitting) return

    setIsSubmitting(true)
    try {
      const newTask = await createTask(token, {
        title: trimmed,
        priority_manual: "medium",
        status: "todo",
      })
      setTasks((prev) => [newTask, ...prev])
      setQuickTitle("")
    } catch (err) {
      alert(err.message || "Failed to create task")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle Task Status
  const handleToggleTask = async (task) => {
    const nextStatus = task.status === "done" ? "todo" : "done"
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    )
    try {
      await updateTask(token, task.id, { status: nextStatus })
    } catch {
      // rollback
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      )
    }
  }

  // Today's classes logic (day of week: 1=Mon, 2=Tue, ..., 7=Sun)
  const currentDayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()
  const todaysClasses = (schedule.classes || [])
    .filter((c) => Number(c.day_of_week) === currentDayOfWeek)
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))

  // Tasks due today or active
  const activeTasks = tasks.filter((t) => t.status !== "done")
  const completedTodayTasks = tasks.filter((t) => t.status === "done")

  // Upcoming Canvas assignments (next 7 days)
  const now = new Date()
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const upcomingAssignments = assignments
    .filter((a) => {
      if (!a.due_at) return false
      const d = new Date(a.due_at)
      return d >= now && d <= sevenDaysLater
    })
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date())

  return (
    <div className="hub-container">
      {/* Editorial Header */}
      <header className="hub-header">
        <div className="hub-date-section">
          <span className="hub-eyebrow">TODAY’S OVERVIEW</span>
          <h1 className="hub-title">{formattedDate}</h1>
          <div className="hub-meta-strip">
            <span className="hub-meta-item">
              <span className="hub-meta-dot" /> {todaysClasses.length} {todaysClasses.length === 1 ? "class" : "classes"} today
            </span>
            <span className="hub-meta-item">
              <span className="hub-meta-dot" /> {activeTasks.length} pending {activeTasks.length === 1 ? "task" : "tasks"}
            </span>
            <span className="hub-meta-item">
              <span className="hub-meta-dot" /> {upcomingAssignments.length} upcoming Canvas {upcomingAssignments.length === 1 ? "deadline" : "deadlines"}
            </span>
          </div>
        </div>

        <button
          className={`btn btn--subtle btn-refresh ${loading ? "spinning" : ""}`}
          onClick={() => loadAllData(false)}
          title="Refresh Data"
        >
          <RefreshCw size={15} />
          <span className="text-xs">{loading ? "Syncing..." : "Sync"}</span>
        </button>
      </header>

      {/* Global Quick Add Bar */}
      <form className="quick-add-bar" onSubmit={handleQuickAdd}>
        <div className="quick-add-input-wrap">
          <Plus size={18} className="quick-add-icon" />
          <input
            type="text"
            className="quick-add-input"
            placeholder="Add a new task... (press Enter to create)"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            disabled={isSubmitting}
          />
          <kbd className="quick-add-kbd">↵</kbd>
        </div>
      </form>

      {/* Grid Layout for Hub */}
      <div className="hub-grid">
        {/* Left Column: Schedule + Tasks */}
        <div className="hub-column hub-column-main">
          {/* Today's Schedule */}
          <section className="hub-card">
            <div className="hub-card-header">
              <div className="flex items-center gap-xs">
                <Calendar size={16} className="text-accent" />
                <h3 className="hub-card-title">Today's Schedule</h3>
              </div>
              <Link to="/schedule" className="hub-link-more">
                Full Timetable <ChevronRight size={14} />
              </Link>
            </div>

            <div className="hub-schedule-list">
              {todaysClasses.length === 0 ? (
                <div className="hub-empty-state">
                  <Clock size={20} className="text-muted" />
                  <p>No classes scheduled for today.</p>
                </div>
              ) : (
                todaysClasses.map((cls, idx) => (
                  <div key={cls.id || idx} className="hub-class-item">
                    <div className="hub-class-time font-mono">
                      <span>{cls.start_time?.slice(0, 5)}</span>
                      <span className="time-sep">-</span>
                      <span>{cls.end_time?.slice(0, 5)}</span>
                    </div>
                    <div className="hub-class-info">
                      <div className="flex items-center gap-xs">
                        <span className="badge-module">{cls.module_code}</span>
                        <span className="hub-class-name">{cls.module_name || cls.lesson_type}</span>
                      </div>
                      {cls.venue && (
                        <span className="hub-class-venue">
                          <MapPin size={12} /> {cls.venue}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Focus Tasks Checklist */}
          <section className="hub-card">
            <div className="hub-card-header">
              <div className="flex items-center gap-xs">
                <CheckCircle2 size={16} className="text-accent" />
                <h3 className="hub-card-title">Focus Tasks</h3>
                <span className="badge-count">{activeTasks.length}</span>
              </div>
              <Link to="/planner" className="hub-link-more">
                All Tasks <ChevronRight size={14} />
              </Link>
            </div>

            <div className="hub-task-list">
              {activeTasks.length === 0 ? (
                <div className="hub-empty-state">
                  <Sparkles size={20} className="text-accent" />
                  <p>All caught up! No pending tasks.</p>
                </div>
              ) : (
                activeTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="hub-task-row" onClick={() => handleToggleTask(task)}>
                    <button className="hub-task-checkbox">
                      {task.status === "done" ? (
                        <CheckCircle2 size={18} className="text-success" />
                      ) : (
                        <Circle size={18} className="text-muted" />
                      )}
                    </button>
                    <div className="hub-task-content">
                      <span className={`hub-task-title ${task.status === "done" ? "done" : ""}`}>
                        {task.title}
                      </span>
                      {task.due_at_override && (
                        <span className="hub-task-due font-mono">
                          Due {new Date(task.due_at_override).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                    {task.priority_manual === "high" && (
                      <span className="priority-dot high" title="High Priority" />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Canvas Deadlines & Announcements */}
        <div className="hub-column hub-column-side">
          {/* Canvas Deadlines */}
          <section className="hub-card">
            <div className="hub-card-header">
              <div className="flex items-center gap-xs">
                <BookOpen size={16} className="text-accent" />
                <h3 className="hub-card-title">Canvas Deadlines (7 Days)</h3>
              </div>
              <Link to="/canvas" className="hub-link-more">
                Canvas Hub <ChevronRight size={14} />
              </Link>
            </div>

            <div className="hub-deadline-list">
              {upcomingAssignments.length === 0 ? (
                <div className="hub-empty-state">
                  <p className="text-xs text-muted">No Canvas assignments due in the next 7 days.</p>
                </div>
              ) : (
                upcomingAssignments.slice(0, 6).map((item) => {
                  const dueDate = new Date(item.due_at)
                  return (
                    <div key={item.id} className="hub-deadline-item">
                      <div className="flex items-start justify-between gap-xs">
                        <div>
                          <span className="badge-module text-xs">{item.course_code || "Canvas"}</span>
                          <h4 className="hub-deadline-title">{item.name}</h4>
                        </div>
                        {item.html_url && (
                          <a
                            href={item.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-icon-subtle"
                            title="Open in Canvas"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                      <div className="hub-deadline-meta font-mono">
                        <Clock size={11} />
                        <span>
                          {dueDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}{" "}
                          at {dueDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* Recent Announcements */}
          <section className="hub-card">
            <div className="hub-card-header">
              <div className="flex items-center gap-xs">
                <Megaphone size={16} className="text-accent" />
                <h3 className="hub-card-title">Recent Announcements</h3>
              </div>
            </div>

            <div className="hub-announcement-list">
              {announcements.length === 0 ? (
                <div className="hub-empty-state">
                  <p className="text-xs text-muted">No recent announcements found.</p>
                </div>
              ) : (
                announcements.slice(0, 4).map((ann, idx) => (
                  <div key={ann.id || idx} className="hub-announcement-item">
                    <div className="flex justify-between items-center mb-xs">
                      <span className="badge-module text-xs">{ann.course_code || "Module"}</span>
                      <span className="text-xs text-muted font-mono">
                        {ann.posted_at ? new Date(ann.posted_at).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                      </span>
                    </div>
                    <h4 className="hub-announcement-title">{ann.title}</h4>
                    {ann.message && (
                      <p
                        className="hub-announcement-snippet"
                        dangerouslySetInnerHTML={{
                          __html: ann.message.replace(/<[^>]*>?/gm, "").slice(0, 100) + "...",
                        }}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
