import { useEffect, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getCanvasCourses,
  getCanvasAnnouncements,
  getCanvasAssignments,
  loadCachedCanvasFiles,
  getSchedule,
  importIcs,
  getGroups,
  createEvent
} from "../api"

import { Megaphone, BookOpen, FolderOpen, RefreshCw, ExternalLink, Calendar, FileText } from "lucide-react"
import AiBrief from "./AiBrief"

function Dashboard({ token, currentUser, onLogout }) {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [newTitle, setNewTitle] = useState("")
  const [error, setError] = useState("")
  const [updatingTaskId, setUpdatingTaskId] = useState(null)

  // Canvas data states
  const [courses, setCourses] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loadingCanvas, setLoadingCanvas] = useState(false)
  const [canvasError, setCanvasError] = useState("")

  // Schedule states
  const [schedule, setSchedule] = useState({ classes: [], exams: [], events: [] })
  const [uploadingSchedule, setUploadingSchedule] = useState(false)
  const [groups, setGroups] = useState([])
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventTitle, setEventTitle] = useState("")
  const [eventVenue, setEventVenue] = useState("")
  const [eventDesc, setEventDesc] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventEnd, setEventEnd] = useState("")

  // Modal overlays state
  const [activeModal, setActiveModal] = useState(null) // { courseId, courseCode, type }
  const [modalItems, setModalItems] = useState([])
  const [loadingModal, setLoadingModal] = useState(false)
  const [modalError, setModalError] = useState("")

  // Fetch Canvas data
  useEffect(() => {
    async function loadCanvasData() {
      const canvasToken = currentUser?.canvas_token
      if (!token || !canvasToken) {
        setCourses([])
        setAnnouncements([])
        setAssignments([])
        return
      }

      setLoadingCanvas(true)
      setCanvasError("")
      try {
        const [coursesData, announcementsData, assignmentsData] = await Promise.all([
          getCanvasCourses(token),
          getCanvasAnnouncements(token),
          getCanvasAssignments(token)
        ])
        setCourses(coursesData || [])
        setAnnouncements(announcementsData || [])
        setAssignments(assignmentsData || [])
      } catch (err) {
        console.error("Error loading Canvas data:", err)
        setCanvasError(err.message || "Failed to load Canvas data.")
      } finally {
        setLoadingCanvas(false)
      }
    }

    loadCanvasData()
  }, [token, currentUser?.canvas_token])

  // Load modal details on demand (specifically for files, others are filtered)
  useEffect(() => {
    if (!activeModal || activeModal.type !== "files") return
    let cancelled = false

    async function loadFiles() {
      setLoadingModal(true)
      setModalError("")
      try {
        const data = await loadCachedCanvasFiles(token)
        const courseFiles = (data.files || []).filter(
          file => String(file.courseId) === String(activeModal.courseId)
        )
        if (!cancelled) setModalItems(courseFiles)
      } catch (err) {
        if (!cancelled) setModalError(err.message || "Failed to load course files.")
      } finally {
        if (!cancelled) setLoadingModal(false)
      }
    }

    loadFiles()
    return () => { cancelled = true }
  }, [activeModal, token])

  // Load schedule
  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await getSchedule(token)
        setSchedule(data || { classes: [], exams: [], events: [] })
      } catch (err) {
        setError(err.message || "Could not load schedule.")
      }
    }
    if (token) {
      loadSchedule()
    }
  }, [token])

  const fetchTasks = async () => {
    try {
      const data = await getTasks(token)
      setTasks(data || [])
    } catch (err) {
      setError(err.message || "Could not load tasks.")
    }
  }

  // Load Tasks
  useEffect(() => {
    let cancelled = false

    async function loadTasks() {
      try {
        const data = await getTasks(token)
        if (!cancelled) setTasks(data || [])
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load tasks.")
      }
    }

    if (token) loadTasks()
    return () => { cancelled = true }
  }, [token])

  // Load Groups
  useEffect(() => {
    async function loadGroups() {
      if (token) {
        try {
          const data = await getGroups(token)
          setGroups(data || [])
        } catch (err) {
          console.error("Could not load groups:", err)
        }
      }
    }
    loadGroups()
  }, [token])

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setError("")
    try {
      const newTask = await createTask(token, {
        title: newTitle,
        status: "todo",
        priority_manual: "medium"
      })
      setTasks([...tasks, newTask])
      setNewTitle("")
    } catch (err) {
      setError(err.message || "Could not add task.")
    }
  }

  const handleIcsUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploadingSchedule(true)
    setError("")
    try {
      await importIcs(token, file)
      const data = await getSchedule(token)
      setSchedule(data || { classes: [], exams: [], events: [] })
    } catch (err) {
      setError(err.message || "Failed to upload calendar.")
    } finally {
      setUploadingSchedule(false)
    }
  }

  const handleCreatePersonalEvent = async (e) => {
    e.preventDefault()
    if (!eventTitle.trim() || !eventStart) return
    setError("")
    try {
      await createEvent(token, {
        title: eventTitle,
        description: eventDesc,
        venue: eventVenue,
        start_at: new Date(eventStart).toISOString(),
        end_at: eventEnd ? new Date(eventEnd).toISOString() : null,
        is_all_day: false,
        c_id: null,
        g_id: null,
        module_code: null,
        event_type: null
      })
      setEventTitle("")
      setEventVenue("")
      setEventDesc("")
      setEventStart("")
      setEventEnd("")
      setShowEventModal(false)
      const data = await getSchedule(token)
      setSchedule(data || { classes: [], exams: [], events: [] })
    } catch (err) {
      setError(err.message || "Failed to create event.")
    }
  }

  const getTimeline = () => {
    const timeline = []
    const now = new Date()

    if (schedule?.events) {
      schedule.events.forEach(event => {
        const start = new Date(event.start_at)
        const end = event.end_at ? new Date(event.end_at) : start

        if (end > now) {
          timeline.push({
            id: `event-${event.id}`,
            title: event.title,
            type: "event",
            start_at: start,
            end_at: end,
            venue: event.venue || "No venue"
          })
        }
      })
    }

    if (schedule?.exams) {
      schedule.exams.forEach(exam => {
        const start = new Date(exam.start_at)
        const end = exam.end_at ? new Date(exam.end_at) : start

        if (end > now) {
          timeline.push({
            id: `exam-${exam.id}`,
            title: `${exam.module_code} Exam`,
            type: "exam",
            start_at: start,
            end_at: end,
            venue: "See Exam Venue"
          })
        }
      })
    }

    if (schedule?.classes) {
      schedule.classes.forEach(cls => {
        const start = new Date(`${cls.class_date}T${cls.start_time}+08:00`)
        const end = new Date(`${cls.class_date}T${cls.end_time}+08:00`)

        if (end > now) {
          timeline.push({
            id: `class-${cls.id}`,
            title: `${cls.module_code} ${cls.lesson_type}`,
            type: "class",
            start_at: start,
            end_at: end,
            venue: cls.venue || "No venue"
          })
        }
      })
    }

    timeline.sort((a, b) => a.start_at - b.start_at)
    return timeline
  }

  const toggleTask = async (id, currentStatus) => {
    setError("")
    setUpdatingTaskId(id)
    const nextStatus = currentStatus === "done" ? "todo" : "done"
    const previousTasks = tasks
    setTasks(current =>
      current.map(task =>
        task.id === id ? { ...task, status: nextStatus } : task
      )
    )

    try {
      const updatedTask = await updateTask(token, id, { status: nextStatus })
      setTasks(current => current.map(t => t.id === id ? updatedTask : t))
    } catch (err) {
      setTasks(previousTasks)
      setError(err.message || "Could not update task.")
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleDeleteTask = async (task) => {
    if (task.source_type === "canvas") {
      return
    }

    setError("")
    try {
      await deleteTask(token, task.id)
      setTasks(tasks.filter(t => t.id !== task.id))
    } catch (err) {
      setError(err.message || "Could not delete task.")
    }
  }

  const handleLogout = () => {
    onLogout()
    navigate("/login")
  }

  // 1. Convert standard dates (e.g. "2026-06-01T23:59:59Z") to Singapore format (e.g. "1 Jun, 11:59 pm")
  const formatDate = (dateStr) => {
    if (!dateStr) return "No due date"
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  // 2. Calculate relative elapsed time for announcements (e.g. "2h ago")
  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const upcomingAssignments = (assignments || [])
    .filter(ass => {
      if (!ass.due_at) return false
      const due = new Date(ass.due_at)
      return due > new Date() && !ass.has_submitted
    })
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
  const displayedModalItems = !activeModal
    ? []
    : activeModal.type === "announcements"
      ? (announcements || []).filter(ann => ann.course_id === activeModal.courseId)
      : activeModal.type === "assignments"
        ? (assignments || []).filter(ass => ass.course_id === activeModal.courseId)
        : (modalItems || [])
  const upcomingTasks = [...(tasks || [])]
    .filter(task => task.status !== "done")
    .sort((left, right) => {
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
    .slice(0, 5)
  const timelineItems = getTimeline()
  const hasScheduleData = (schedule?.classes && schedule.classes.length > 0) || (schedule?.exams && schedule.exams.length > 0)

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <h1>Welcome, {currentUser?.name}</h1>
        <button onClick={handleLogout} className="btn btn--secondary">Log Out</button>
      </header>

      {token && (
        <div style={{ padding: "0 2rem", marginBottom: "1.5rem" }}>
          <AiBrief key={token} token={token} onTaskCreated={fetchTasks} />
        </div>
      )}

      <main className="dashboard-top-row">
        <div className="card">
          <div className="card-header">
            <h3>Task Manager</h3>
            <span className="badge badge--primary">Active</span>
          </div>

          {error && <p className="text-error text-xs text-center" style={{ margin: "10px 0" }}>{error}</p>}

          <form onSubmit={handleAddTask} className="flex gap-sm mb-lg">
            <input
              type="text"
              className="form-input"
              placeholder="Add a new academic task..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
            <button type="submit" className="btn btn--primary btn--icon">
              +
            </button>
          </form>

          <div className="list" style={{ marginBottom: "15px" }}>
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted text-center">
                No tasks found. Add one above!
              </p>
            ) : (
              upcomingTasks.map(task => (
                <div key={task.id} className="list-item list-item--compact list-item--row">
                  <div className="flex items-center gap-sm flex-1">
                    <input
                      type="checkbox"
                      checked={task.status === "done"}
                      disabled={updatingTaskId === task.id}
                      onChange={() => toggleTask(task.id, task.status)}
                    />
                    <span
                      className={`text-base flex flex-col gap-xs ${task.status === "done" ? "text-muted" : "text-h"}`}
                      style={{ textDecoration: task.status === "done" ? "line-through" : "none" }}
                    >
                      {task.title}
                      <small className="text-xs text-muted">
                        {formatDate(task.effective_due_at)}
                      </small>
                    </span>
                  </div>
                  {task.source_type !== "canvas" && (
                    <button
                      className="text-muted cursor-pointer"
                      style={{ background: "none", border: "none", fontSize: "18px" }}
                      onClick={() => handleDeleteTask(task)}
                      title="Delete task"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <Link
            to="/planner"
            className={`btn btn--secondary btn--full no-underline ${updatingTaskId !== null ? "opacity-55" : ""}`}
            onClick={(event) => {
              if (updatingTaskId !== null) {
                event.preventDefault()
              }
            }}
            style={{ pointerEvents: updatingTaskId !== null ? 'none' : 'auto' }}
          >
            Open Full Task Planner &rarr;
          </Link>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>My Schedule</h3>
            <div className="flex gap-xs items-center">
              <button onClick={() => setShowEventModal(true)} className="btn btn--secondary btn--sm">
                + New Event
              </button>
              {hasScheduleData && (
                <label className="btn btn--secondary btn--sm cursor-pointer" title="Import new .ics calendar">
                  Re-import
                  <input
                    type="file"
                    accept=".ics"
                    onChange={handleIcsUpload}
                    style={{ display: "none" }}
                    disabled={uploadingSchedule}
                  />
                </label>
              )}
            </div>
          </div>
          {uploadingSchedule ? (
            <div className="state-box">
              <RefreshCw className="spin" size={20} />
              <span>Updating schedule...</span>
            </div>
          ) : !hasScheduleData ? (
            <div className="state-box state-box--dashed">
              <p>Import your class timetable to get started.</p>
              <label className="btn btn--primary cursor-pointer">
                Import .ics Calendar
                <input
                  type="file"
                  accept=".ics"
                  onChange={handleIcsUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          ) : (
            <div className="list list--scrollable">
              {timelineItems.length === 0 ? (
                <p className="text-sm text-muted text-center">
                  No upcoming classes or exams.
                </p>
              ) : (
                timelineItems.slice(0, 5).map(item => (
                  <div key={item.id} className="list-item">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted">
                        {item.start_at.toLocaleDateString("en-SG", { day: "numeric", month: "short" })}{" "}
                        {item.start_at.toLocaleTimeString("en-SG", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span
                        className={`badge badge--square badge--${item.type === "class" ? "primary" : item.type === "exam" ? "danger" : "warning"
                          }`}
                      >
                        {item.type}
                      </span>
                    </div>
                    <div className="timeline-item-body">
                      <h4 className="timeline-title">{item.title}</h4>
                      <p className="timeline-venue">{item.venue}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          <button className="btn btn--secondary btn--full" onClick={() => navigate("/schedule")}>Open Full Schedule</button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Groups</h3>
          </div>
          {groups.length === 0 ? (
            <div className="state-box state-box--dashed" style={{ height: "120px" }}>
              <p className="text-sm text-muted">You are not part of any groups yet.</p>
              <button className="btn btn--primary btn--sm" onClick={() => navigate("/organisations")} style={{ marginTop: "8px" }}>
                Join / Create Group
              </button>
            </div>
          ) : (
            <div className="list list--scrollable" style={{ maxHeight: "220px", marginBottom: "15px" }}>
              {groups.slice(0, 3).map(group => (
                <div key={group.id} className="list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" }}>
                  <div className="flex-col" style={{ gap: "2px", minWidth: 0, flex: 1, marginRight: "10px" }}>
                    <span
                      onClick={() => navigate("/organisations", { state: { openGroupId: group.id } })}
                      className="text-sm cursor-pointer truncate"
                      style={{ color: "var(--text-h)", fontWeight: 600, display: "block" }}
                      title="Open group page"
                    >
                      {group.name}
                    </span>
                    {group.description && (
                      <span className="text-xs text-muted truncate" style={{ display: "block" }}>
                        {group.description}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-xs" style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => navigate("/organisations", { state: { openGroupId: group.id, openTab: "events" } })}
                      className="btn btn--icon btn--sm"
                      style={{ width: "28px", height: "28px" }}
                      title="Events"
                    >
                      <Calendar size={13} />
                    </button>
                    <button
                      onClick={() => navigate("/organisations", { state: { openGroupId: group.id, openTab: "forms" } })}
                      className="btn btn--icon btn--sm"
                      style={{ width: "28px", height: "28px" }}
                      title="Forms"
                    >
                      <FileText size={13} />
                    </button>
                    <button
                      onClick={() => navigate("/organisations", { state: { openGroupId: group.id } })}
                      className="btn btn--icon btn--sm"
                      style={{ width: "28px", height: "28px" }}
                      title="Open group page"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn--secondary btn--full" onClick={() => navigate("/organisations")}>
            View all groups
          </button>
        </div>
      </main>

      <hr className="dashboard-separator" />

      <div className="canvas-hub-container">
        <div className="canvas-courses-panel">
          <div className="panel-header mb-lg">
            <h2>Courses</h2>
            <p className="text-sm text-muted">Access your course resources and materials</p>
          </div>
          {!currentUser?.canvas_token ? (
            <div className="card state-box state-box--dashed" style={{ padding: "30px 24px" }}>
              <h4 className="text-h mb-sm" style={{ fontSize: "22px" }}>Connect Canvas Account</h4>
              <p className="text-base" style={{ maxWidth: "320px" }}>
                Bring your academic schedule and courses together. Set your API access token during onboarding or in your account setup to get started.
              </p>
            </div>
          ) : loadingCanvas ? (
            <div className="state-box">
              <RefreshCw size={24} className="spin" />
              <span>Fetching courses from Canvas...</span>
            </div>
          ) : canvasError ? (
            <div className="state-box state-box--dashed">
              <p>{canvasError}</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="state-box state-box--dashed">
              <p>You are not enrolled in any active courses.</p>
            </div>
          ) : (
            <div className="list">
              {courses.map(course => (
                <div key={course.id} className="list-item list-item--lg list-item--row list-item--hover">
                  <div className="flex-col gap-xs">
                    <span style={{ fontSize: "22px", fontFamily: "var(--font-serif)", fontWeight: "500", color: "var(--text-h)", lineHeight: "1.1" }}>
                      {course.course_code}
                    </span>
                    <span className="text-xs text-muted">{course.name}</span>
                  </div>
                  <div className="flex gap-sm">
                    <button
                      onClick={() => setActiveModal({ courseId: course.id, courseCode: course.course_code, type: "announcements" })}
                      className="btn btn--icon"
                      title="Announcements"
                    >
                      <Megaphone size={16} />
                    </button>
                    <button
                      onClick={() => setActiveModal({ courseId: course.id, courseCode: course.course_code, type: "assignments" })}
                      className="btn btn--icon"
                      title="Assignments"
                    >
                      <BookOpen size={16} />
                    </button>
                    <button
                      onClick={() => setActiveModal({ courseId: course.id, courseCode: course.course_code, type: "files" })}
                      className="btn btn--icon"
                      title="Files"
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card--accent">
          <div className="panel-header mb-lg">
            <h2>Assignment Deadlines</h2>
            <p className="text-sm text-muted">Upcoming Canvas assignment deadlines</p>
          </div>
          {!currentUser?.canvas_token ? (
            <p className="text-sm text-muted" style={{ fontStyle: "italic", padding: "10px 0" }}>
              Connect Canvas to show deadlines.
            </p>
          ) : loadingCanvas ? (
            <div className="state-box">
              <RefreshCw size={20} className="spin" />
              <span>Checking deadlines...</span>
            </div>
          ) : (
            <div className="list list--scrollable" style={{ maxHeight: "360px" }}>
              {upcomingAssignments.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic", padding: "10px 0" }}>
                  No upcoming deadlines.
                </p>
              ) : (
                upcomingAssignments.map(ass => (
                  <div key={ass.id} className="list-item list-item--md" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div className="flex justify-between items-center gap-md">
                      <span className="badge badge--primary">{ass.course_code}</span>
                      <span className="badge badge--danger" style={{ backgroundColor: "rgba(211, 47, 47, 0.1)", color: "var(--error)", border: "none" }}>
                        Due: {formatDate(ass.due_at)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-md">
                      <h5 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-h)", lineHeight: "1.3", margin: 0 }} className="truncate">
                        {ass.title}
                      </h5>
                      <a
                        href={ass.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--secondary btn--sm"
                        style={{ padding: "4px 8px", fontSize: "11px", height: "24px", borderRadius: "4px", flexShrink: 0 }}
                      >
                        Canvas
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {activeModal.courseCode} &mdash; {activeModal.type.charAt(0).toUpperCase() + activeModal.type.slice(1)}
              </h3>
              <button className="close-modal" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {loadingModal ? (
                <div className="state-box">
                  <RefreshCw size={24} className="spin" />
                  <span>Loading resources...</span>
                </div>
              ) : modalError ? (
                <p className="text-base text-error">{modalError}</p>
              ) : displayedModalItems.length === 0 ? (
                <p className="text-sm text-muted text-center">No items found.</p>
              ) : (
                <div className="list">
                  {activeModal.type === "announcements" && (
                    displayedModalItems.map(ann => (
                      <div key={ann.id} className="list-item list-item--md">
                        <div className="flex justify-between text-xs text-muted mb-sm">
                          <span>{ann.author}</span>
                          <span>{formatDate(ann.posted_at)}</span>
                        </div>
                        <h4 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-h)", marginBottom: "10px", lineHeight: "1.3" }}>
                          {ann.title}
                        </h4>
                        <div
                          className="ann-body-content"
                          dangerouslySetInnerHTML={{ __html: ann.body }}
                        />
                        <a
                          href={ann.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn--secondary btn--sm inline-flex mt-sm"
                          style={{ alignSelf: "flex-start" }}
                        >
                          Open in Canvas <ExternalLink size={12} style={{ marginLeft: "4px" }} />
                        </a>
                      </div>
                    ))
                  )}

                  {activeModal.type === "assignments" && (
                    displayedModalItems.map(ass => (
                      <div key={ass.id} className="list-item list-item--md">
                        <div className="flex justify-between text-xs text-muted mb-sm">
                          <span>Due: {formatDate(ass.due_at)}</span>
                          {ass.has_submitted ? (
                            <span className="badge badge--success">Submitted</span>
                          ) : (
                            <span className="badge badge--danger">Not Submitted</span>
                          )}
                        </div>
                        <h4 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-h)", marginBottom: "10px", lineHeight: "1.3" }}>
                          {ass.title}
                        </h4>
                        <a
                          href={ass.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn--secondary btn--sm inline-flex mt-sm"
                          style={{ alignSelf: "flex-start" }}
                        >
                          Submit on Canvas <ExternalLink size={12} style={{ marginLeft: "4px" }} />
                        </a>
                      </div>
                    ))
                  )}

                  {activeModal.type === "files" && (
                    displayedModalItems.map(file => (
                      <div key={file.id} className="list-item list-item--md list-item--row">
                        <div className="flex items-center gap-lg">
                          <div
                            style={{
                              backgroundColor: "rgba(53, 74, 47, 0.08)",
                              color: "var(--primary)",
                              width: "42px",
                              height: "42px",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0
                            }}
                          >
                            <FolderOpen size={20} />
                          </div>
                          <div className="file-details">
                            <h4 className="file-name">{file.display_name}</h4>
                            <span className="file-meta">
                              {(file.size / 1024 / 1024).toFixed(2)} MB &bull; {formatDate(file.updated_at)}
                            </span>
                          </div>
                        </div>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn--icon"
                          title="Download file"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setActiveModal(null)} className="btn btn--secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {showEventModal && (
        <div className="modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h3>New Personal Event</h3>
              <button className="close-modal" onClick={() => setShowEventModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreatePersonalEvent} className="form modal-body">
              <div className="form-group">
                <label>Event Title</label>
                <input type="text" className="form-input" required value={eventTitle} onChange={e => setEventTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Venue (optional)</label>
                <input type="text" className="form-input" value={eventVenue} onChange={e => setEventVenue(e.target.value)} />
              </div>
              <div className="form-grid form-grid--2col">
                <div className="form-group">
                  <label>Start Date & Time</label>
                  <input type="datetime-local" className="form-input" required value={eventStart} onChange={e => setEventStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End (optional)</label>
                  <input type="datetime-local" className="form-input" value={eventEnd} onChange={e => setEventEnd(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea className="form-input" rows={3} value={eventDesc} onChange={e => setEventDesc(e.target.value)} />
              </div>
              <div className="modal-footer flex gap-sm" style={{ padding: "16px 0 0" }}>
                <button type="button" className="btn btn--secondary" onClick={() => setShowEventModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary">Create Event</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
