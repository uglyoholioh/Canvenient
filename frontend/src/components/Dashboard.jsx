import { useEffect, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { getTasks, createTask, updateTask, deleteTask } from "../api"

function Dashboard({ token, currentUser, onLogout }) {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [newTitle, setNewTitle] = useState("")
  const [error, setError] = useState("")

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
    const nextStatus = currentStatus === "done" ? "todo" : "done"
    try {
      const updatedTask = await updateTask(token, id, { status: nextStatus })
      setTasks(tasks.map(t => t.id === id ? updatedTask : t))
    } catch (err) {
      setError(err.message || "Could not update task.")
    }
  }

  const handleDeleteTask = async (id) => {
    setError("")
    try {
      await deleteTask(token, id)
      setTasks(tasks.filter(t => t.id !== id))
    } catch (err) {
      setError(err.message || "Could not delete task.")
    }
  }

  const handleLogout = () => {
    onLogout()
    navigate("/login")
  }

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <h1>Canvenient</h1>
        <button onClick={handleLogout} className="btn-secondary">Log Out</button>
      </header>

      <main className="dashboard-grid">
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
            {tasks.length === 0 ? (
              <p className="empty-message">No tasks found. Add one above!</p>
            ) : (
              tasks.map(task => (
                <div key={task.id} className={`task-item ${task.status === "done" ? "completed" : ""}`}>
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={() => toggleTask(task.id, task.status)}
                  />
                  <span className="task-title">{task.title}</span>
                  <button className="delete-task" onClick={() => handleDeleteTask(task.id)} title="Delete task">×</button>
                </div>
              ))
            )}
          </div>
          <Link to="/tasks" className="btn-secondary" style={{ display: 'block', textAlign: 'center', marginTop: '10px', textDecoration: 'none' }}>
            Open Full Task Planner →
          </Link>
        </div>

        <div className="card placeholder-card">
          <div className="card-header">
            <h3>Canvas Sync</h3>
            <span className="badge badge-progress">In Progress</span>
          </div>
          <p className="card-description">
            Automatically pull and track deadlines from your registered Canvas courses.
          </p>
          <div className="placeholder-graphic">
            <span>Syncing modules soon...</span>
          </div>
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
    </div>
  )
}

export default Dashboard
