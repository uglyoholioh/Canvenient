import { useState } from "react"
import { useNavigate } from "react-router-dom"

function Dashboard() {
  const navigate = useNavigate()

  // Local state for tasks
  const [tasks, setTasks] = useState([
    { id: 1, title: "Review CS2030S Lab 3", status: "todo", priority: "high" },
    { id: 2, title: "Submit MA1521 Homework", status: "completed", priority: "medium" },
    { id: 3, title: "Read Chapter 4 of GEA1000", status: "todo", priority: "low" }
  ])

  const [newTitle, setNewTitle] = useState("")

  const handleAddTask = (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const newTask = {
      id: Date.now(),
      title: newTitle,
      status: "todo",
      priority: "medium"
    }
    setTasks([...tasks, newTask])
    setNewTitle("")
  }

  const toggleTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === "completed" ? "todo" : "completed" } : t))
  }

  const deleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id))
  }

  const handleLogout = () => {
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
                <div key={task.id} className={`task-item ${task.status}`}>
                  <input
                    type="checkbox"
                    checked={task.status === "completed"}
                    onChange={() => toggleTask(task.id)}
                  />
                  <span className="task-title">{task.title}</span>
                  <button className="delete-task" onClick={() => deleteTask(task.id)} title="Delete task">×</button>
                </div>
              ))
            )}
          </div>
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
