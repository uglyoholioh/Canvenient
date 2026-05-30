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
  getCanvasFiles
} from "../api"

import { Megaphone, BookOpen, FolderOpen, RefreshCw, ExternalLink } from "lucide-react"


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

    async function loadFiles() {
      setLoadingModal(true)
      setModalError("")
      try {
        const filesData = await getCanvasFiles(token, activeModal.courseId)
        setModalItems(filesData)
      } catch (err) {
        setModalError(err.message || "Failed to load course files.")
      } finally {
        setLoadingModal(false)
      }
    }

    loadFiles()
  }, [activeModal, token])


  //Load Tasks
  useEffect(() => {
    async function loadTasks() {
      try {
        const data = await getTasks(token)
        setTasks(data)
      } catch (err) {
        setError(err.message || "Could not load tasks.")
      }
    }
    if (token) {
      loadTasks()
    }
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

  // 3. Extract only the high-priority alerts and deadlines for the Priority Lane
  const priorityAnnouncements = (announcements || []).filter(ann => ann.is_priority)
  const priorityAssignments = (assignments || []).filter(ass => ass.is_priority)
  const displayedModalItems = !activeModal
    ? []
    : activeModal.type === "announcements"
      ? announcements.filter(ann => ann.course_id === activeModal.courseId)
      : activeModal.type === "assignments"
        ? assignments.filter(ass => ass.course_id === activeModal.courseId)
        : modalItems
  const upcomingTasks = [...tasks]
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


  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <h1>Welcome, {currentUser?.name}</h1>
        <button onClick={handleLogout} className="btn-secondary">Log Out</button>
      </header>

      <main className="dashboard-top-row">
        <div className="card task-card">
          <div className="card-header">
            <h3>Task Manager</h3>
            <span className="badge badge-active">Active</span>
          </div>

          {error && <p style={{ color: "red", fontSize: "12px", textAlign: "center", margin: "10px 0" }}>{error}</p>}

          <form onSubmit={handleAddTask} className="add-task-form">
            <input
              type="text"
              placeholder="Add a new academic task..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
            <button type="submit" className="add-btn">+</button>
          </form>

          <div className="task-list">
            {upcomingTasks.length === 0 ? (
              <p className="empty-message">No tasks found. Add one above!</p>
            ) : (
              upcomingTasks.map(task => (
                <div key={task.id} className={`task-item ${task.status === "done" ? "completed" : ""}`}>
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    disabled={updatingTaskId === task.id}
                    onChange={() => toggleTask(task.id, task.status)}
                  />
                  <span className="task-title">
                    {task.title}
                    <small className="task-due-label">{formatDate(task.effective_due_at)}</small>
                  </span>
                  {task.source_type !== "canvas" && (
                    <button
                      className="delete-task"
                      onClick={() => handleDeleteTask(task)}
                      title="Delete task"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <Link
            to="/planner"
            className="btn-secondary"
            onClick={(event) => {
              if (updatingTaskId !== null) {
                event.preventDefault()
              }
            }}
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: '10px',
              textDecoration: 'none',
              opacity: updatingTaskId !== null ? 0.55 : 1,
              pointerEvents: updatingTaskId !== null ? 'none' : 'auto',
            }}
          >
            Open Full Task Planner →
          </Link>
        </div>

        <div className="card placeholder-card">
          <div className="card-header">
            <h3>NUSMods Timetable</h3>
            <span className="badge badge-progress">In Progress</span>
          </div>
          <p className="card-description">
            Import your class schedule and view your daily timetable.
          </p>
          <div className="placeholder-graphic">
            <span>Calendar view...</span>
          </div>
        </div>

        <div className="card placeholder-card">
          <div className="card-header">
            <h3>Group Scheduler</h3>
            <span className="badge badge-progress">In Progress</span>
          </div>
          <p className="card-description">
            Find common free slots and schedule meetings with your project peers.
          </p>
          <div className="placeholder-graphic">
            <span>Scheduling calendar...</span>
          </div>
        </div>
      </main>
      <hr className="dashboard-separator" />
      <div className="canvas-hub-container">
        <div className="canvas-courses-panel">
          <div className="panel-header">
            <h2>Courses</h2>
            <p className="panel-subtitle">Access your course resources and materials</p>
          </div>
          {!currentUser?.canvas_token ? (
            <div className="connect-canvas-card">
              <h4>Connect Canvas Account</h4>
              <p>Bring your academic schedule and courses together. Set your API access token during onboarding or in your account setup to get started.</p>
            </div>
          ) : loadingCanvas ? (
            <div className="canvas-loading">
              <RefreshCw size={24} className="spin" />
              <span>Fetching courses from Canvas...</span>
            </div>
          ) : canvasError ? (
            <div className="canvas-error-state">
              <p>{canvasError}</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="canvas-empty-state">
              <p>You are not enrolled in any active courses.</p>
            </div>
          ) : (
            <div className="course-list">
              {courses.map(course => (
                <div key={course.id} className="course-item">
                  <div className="course-info">
                    <span className="course-code">{course.course_code}</span>
                    <span className="course-name">{course.name}</span>
                  </div>
                  <div className="course-actions">
                    <button 
                      onClick={() => setActiveModal({ courseId: course.id, courseCode: course.course_code, type: "announcements" })}
                      className="action-btn" 
                      title="Announcements"
                    >
                      <Megaphone size={16} />
                    </button>
                    <button 
                      onClick={() => setActiveModal({ courseId: course.id, courseCode: course.course_code, type: "assignments" })}
                      className="action-btn" 
                      title="Assignments"
                    >
                      <BookOpen size={16} />
                    </button>
                    <button 
                      onClick={() => setActiveModal({ courseId: course.id, courseCode: course.course_code, type: "files" })}
                      className="action-btn" 
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
        <div className="priority-lane">
          <div className="panel-header">
            <h2>Priority items</h2>
            <p className="panel-subtitle">Urgent alerts & upcoming deadlines</p>
          </div>
          {!currentUser?.canvas_token ? (
            <p className="empty-message-subtle">Connect Canvas to show priority items.</p>
          ) : loadingCanvas ? (
            <div className="canvas-loading">
              <RefreshCw size={20} className="spin" />
              <span>Checking priority updates...</span>
            </div>
          ) : (
            <div className="priority-stream">
              <div className="priority-section">
                <h4 className="priority-section-title">Critical Alerts</h4>
                <div className="priority-list">
                  {priorityAnnouncements.length === 0 ? (
                    <p className="empty-message-subtle">No critical alerts found.</p>
                  ) : (
                    priorityAnnouncements.map(ann => (
                      <div key={ann.id} className="priority-item announcement-item">
                        <div className="priority-item-header">
                          <span className="priority-course">{ann.course_code}</span>
                          <span className="priority-date">{formatRelativeTime(ann.posted_at)}</span>
                        </div>
                        <h5 className="priority-title">{ann.title}</h5>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="priority-section">
                <h4 className="priority-section-title">Upcoming Deadlines (Next 7 Days)</h4>
                <div className="priority-list">
                  {priorityAssignments.length === 0 ? (
                    <p className="empty-message-subtle">No upcoming deadlines.</p>
                  ) : (
                    priorityAssignments.map(ass => (
                      <div key={ass.id} className="priority-item assignment-item">
                        <div className="priority-item-header">
                          <span className="priority-course">{ass.course_code}</span>
                          <span className="due-date">Due: {formatDate(ass.due_at)}</span>
                        </div>
                        <h5 className="priority-title">{ass.title}</h5>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {activeModal.courseCode} — {activeModal.type.charAt(0).toUpperCase() + activeModal.type.slice(1)}
              </h3>
              <button className="close-modal" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {loadingModal ? (
                <div className="modal-loading">
                  <RefreshCw size={24} className="spin" />
                  <span>Loading resources...</span>
                </div>
              ) : modalError ? (
                <p className="error-text">{modalError}</p>
              ) : displayedModalItems.length === 0 ? (
                <p className="empty-message">No items found.</p>
              ) : (
                <div className="modal-items-list">
                  {activeModal.type === "announcements" && (
                    displayedModalItems.map(ann => (
                      <div key={ann.id} className="modal-list-item announcement-item">
                        <div className="item-meta">
                          <span className="item-author">{ann.author}</span>
                          <span className="item-date">{formatDate(ann.posted_at)}</span>
                        </div>
                        <h4 className="item-title">{ann.title}</h4>
                        <div 
                          className="ann-body-content"
                          dangerouslySetInnerHTML={{ __html: ann.body }} 
                        />
                        <a href={ann.external_url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-small inline-flex align-center gap-6 mt-10">
                          Open in Canvas <ExternalLink size={12} />
                        </a>
                      </div>
                    ))
                  )}

                  {activeModal.type === "assignments" && (
                    displayedModalItems.map(ass => (
                      <div key={ass.id} className="modal-list-item assignment-item">
                        <div className="item-meta">
                          <span className="item-date">Due: {formatDate(ass.due_at)}</span>
                          {ass.has_submitted ? (
                            <span className="submission-badge submitted">Submitted</span>
                          ) : (
                            <span className="submission-badge pending">Not Submitted</span>
                          )}
                        </div>
                        <h4 className="item-title">{ass.title}</h4>
                        <a href={ass.external_url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-small inline-flex align-center gap-6 mt-10">
                          Submit on Canvas <ExternalLink size={12} />
                        </a>
                      </div>
                    ))
                  )}

                  {activeModal.type === "files" && (
                    displayedModalItems.map(file => (
                      <div key={file.id} className="modal-list-item file-item">
                        <div className="file-icon-wrapper">
                          <FolderOpen size={20} />
                        </div>
                        <div className="file-details">
                          <h4 className="file-name">{file.display_name}</h4>
                          <span className="file-meta">
                            {(file.size / 1024 / 1024).toFixed(2)} MB • {formatDate(file.updated_at)}
                          </span>
                        </div>
                        <a 
                          href={file.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="action-btn"
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
              <button onClick={() => setActiveModal(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
