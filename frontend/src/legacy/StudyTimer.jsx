import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BarChart3, Flame, Pause, Play, RotateCcw, Trophy } from "lucide-react"
import {
  cancelStudySession,
  completeStudySession,
  createStudySession,
  getAcademicModules,
  getCategories,
  getStudyLeaderboard,
  getStudySessions,
  getStudySummary,
  getTasks,
} from "../api"

const presets = [25, 50, 90]

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function StudyTimer({ token, currentUser }) {
  const [title, setTitle] = useState("Focused study")
  const [duration, setDuration] = useState(25)
  const [taskId, setTaskId] = useState("")
  const [moduleId, setModuleId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [tasks, setTasks] = useState([])
  const [modules, setModules] = useState([])
  const [categories, setCategories] = useState([])
  const [sessions, setSessions] = useState([])
  const [summary, setSummary] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [period, setPeriod] = useState("week")
  const [activeSession, setActiveSession] = useState(null)
  const [remaining, setRemaining] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [pauseCount, setPauseCount] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const completingRef = useRef(false)

  const loadData = useCallback(async () => {
    setError("")
    try {
      const results = await Promise.allSettled([
          getTasks(token), getAcademicModules(token), getCategories(token),
          getStudySessions(token), getStudySummary(token), getStudyLeaderboard(token, period),
        ])
      const valueAt = (index, fallback) =>
        results[index].status === "fulfilled" ? results[index].value : fallback
      const taskData = valueAt(0, [])
      const moduleData = valueAt(1, [])
      const categoryData = valueAt(2, [])
      const sessionData = valueAt(3, [])
      const safeSessionData = Array.isArray(sessionData) ? sessionData : []
      setTasks(Array.isArray(taskData) ? taskData.filter((task) => task.status !== "done") : [])
      setModules(Array.isArray(moduleData) ? moduleData : [])
      setCategories(Array.isArray(categoryData) ? categoryData : [])
      setSessions(safeSessionData)
      setSummary(valueAt(4, null))
      setLeaderboard(valueAt(5, []))
      const failure = results.find((result) => result.status === "rejected")
      if (failure) setError(failure.reason?.message || "Some study data could not be loaded.")
      const active = safeSessionData.find((session) => session.status === "active")
      if (active && !activeSession) {
        const elapsed = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000)
        setActiveSession(active)
        setRemaining(Math.max(0, active.planned_minutes * 60 - elapsed))
        setIsRunning(true)
      }
    } catch (err) {
      setError(err.message || "Could not load study data.")
    } finally {
      setLoading(false)
    }
  }, [token, period, activeSession])

  useEffect(() => {
    const kickoff = window.setTimeout(loadData, 0)
    return () => window.clearTimeout(kickoff)
  }, [loadData])

  const finishSession = useCallback(async (focusedOverride = null) => {
    if (!activeSession || completingRef.current) return
    completingRef.current = true
    try {
      const focused = focusedOverride ?? activeSession.planned_minutes * 60 - remaining
      await completeStudySession(token, activeSession.id, {
        actual_seconds: Math.max(0, focused), pause_count: pauseCount,
      })
      setActiveSession(null)
      setIsRunning(false)
      setRemaining(duration * 60)
      setPauseCount(0)
      await loadData()
    } catch (err) {
      setError(err.message || "Could not save the session.")
    } finally {
      completingRef.current = false
    }
  }, [activeSession, duration, loadData, pauseCount, remaining, token])

  useEffect(() => {
    if (!activeSession || !isRunning) return undefined
    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.setTimeout(() => finishSession(activeSession.planned_minutes * 60), 0)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [activeSession, finishSession, isRunning])

  async function startSession() {
    setError("")
    try {
      const created = await createStudySession(token, {
        title: title.trim() || "Focused study",
        planned_minutes: Number(duration),
        task_id: taskId ? Number(taskId) : null,
        module_id: moduleId ? Number(moduleId) : null,
        category_id: categoryId ? Number(categoryId) : null,
      })
      setActiveSession(created)
      setRemaining(created.planned_minutes * 60)
      setPauseCount(0)
      setIsRunning(true)
    } catch (err) {
      setError(err.message || "Could not start the session.")
    }
  }

  async function cancelSession() {
    if (!activeSession) return
    try {
      await cancelStudySession(token, activeSession.id)
      setActiveSession(null)
      setIsRunning(false)
      setRemaining(duration * 60)
      setPauseCount(0)
      await loadData()
    } catch (err) {
      setError(err.message || "Could not cancel the session.")
    }
  }

  const progress = activeSession
    ? ((activeSession.planned_minutes * 60 - remaining) / (activeSession.planned_minutes * 60)) * 100
    : 0
  const clock = useMemo(() => {
    const minutes = Math.floor(remaining / 60).toString().padStart(2, "0")
    const seconds = (remaining % 60).toString().padStart(2, "0")
    return `${minutes}:${seconds}`
  }, [remaining])

  if (loading) return <main className="study-page"><div className="card">Loading study timer...</div></main>

  return (
    <main className="study-page">
      <header className="study-header">
        <div><p className="eyebrow">Focus workspace</p><h1>Study Timer</h1>
          <p className="text-muted">Welcome, {currentUser.name}. Make one focused block count.</p></div>
        <div className="streak-pill"><Flame size={18} /> {summary?.current_streak || 0} day streak</div>
      </header>
      {error && <div className="study-error">{error}</div>}

      <section className="study-grid">
        <div className="card timer-card">
          <div className="timer-progress" style={{ "--progress": `${progress}%` }}>
            <div className="timer-face"><span>{clock}</span><small>{activeSession ? activeSession.title : "Ready when you are"}</small></div>
          </div>
          {activeSession ? (
            <div className="timer-actions">
              <button className="btn btn--secondary" onClick={() => { if (isRunning) setPauseCount((n) => n + 1); setIsRunning(!isRunning) }}>
                {isRunning ? <Pause size={18} /> : <Play size={18} />} {isRunning ? "Pause" : "Resume"}
              </button>
              <button className="btn" onClick={() => finishSession()}>Complete</button>
              <button className="icon-button danger" onClick={cancelSession} title="Cancel session"><RotateCcw size={18} /></button>
            </div>
          ) : (
            <div className="timer-setup">
              <label>Session title<input value={title} maxLength="160" onChange={(e) => setTitle(e.target.value)} /></label>
              <div className="preset-row">{presets.map((value) => <button key={value} className={duration === value ? "active" : ""} onClick={() => { setDuration(value); setRemaining(value * 60) }}>{value} min</button>)}</div>
              <label>Custom minutes<input type="number" min="1" max="480" value={duration} onChange={(e) => { const value = Math.min(480, Math.max(1, Number(e.target.value))); setDuration(value); setRemaining(value * 60) }} /></label>
              <div className="link-grid">
                <label>Task<select value={taskId} onChange={(e) => { setTaskId(e.target.value); const task = tasks.find((item) => item.id === Number(e.target.value)); if (task?.module_id) setModuleId(String(task.module_id)); if (task?.category_id) setCategoryId(String(task.category_id)) }}><option value="">No task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
                <label>Module<select value={moduleId} onChange={(e) => setModuleId(e.target.value)}><option value="">No module</option>{modules.map((item) => <option key={item.id} value={item.id}>{item.module_code}</option>)}</select></label>
                <label>Category<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              </div>
              <button className="btn start-button" onClick={startSession}><Play size={18} /> Start focus session</button>
            </div>
          )}
        </div>

        <aside className="study-side">
          <div className="summary-cards">
            <div className="card metric"><small>Today</small><strong>{formatDuration(summary?.today_seconds)}</strong></div>
            <div className="card metric"><small>This week</small><strong>{formatDuration(summary?.week_seconds)}</strong></div>
            <div className="card metric"><small>Sessions</small><strong>{summary?.completed_sessions || 0}</strong></div>
            <div className="card metric"><small>Average</small><strong>{formatDuration(summary?.average_seconds)}</strong></div>
          </div>
          <div className="card module-card"><h3><BarChart3 size={18} /> Focus by module</h3>
            {(summary?.by_module || []).map((item) => <div className="module-row" key={item.module_code}><span>{item.module_code}</span><strong>{formatDuration(item.total_seconds)}</strong></div>)}
            {!summary?.by_module?.length && <p className="text-muted">Complete a session to see your breakdown.</p>}
          </div>
        </aside>
      </section>

      <section className="study-bottom">
        <div className="card history-card"><h2>Recent sessions</h2>
          {sessions.filter((s) => s.status !== "active").slice(0, 8).map((session) => <div className="history-row" key={session.id}><div><strong>{session.title}</strong><small>{session.module_code || session.category_name || "General focus"} · {new Date(session.started_at).toLocaleDateString()}</small></div><span className={`status-tag ${session.status}`}>{session.status === "completed" ? formatDuration(session.actual_seconds) : "Cancelled"}</span></div>)}
          {!sessions.some((s) => s.status !== "active") && <p className="text-muted">Your completed focus sessions will appear here.</p>}
        </div>
        <div className="card leaderboard-card"><div className="leaderboard-heading"><h2><Trophy size={21} /> Leaderboard</h2><select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="week">This week</option><option value="day">Today</option></select></div>
          {leaderboard.map((entry) => <div className={`leader-row ${entry.is_current_user ? "current" : ""}`} key={entry.user_id}><span className="rank">#{entry.rank}</span><strong>{entry.name}{entry.is_current_user ? " (you)" : ""}</strong><span>{formatDuration(entry.total_seconds)}</span></div>)}
          {!leaderboard.length && <p className="text-muted">The leaderboard is waiting for its first completed session.</p>}
        </div>
      </section>
    </main>
  )
}

export default StudyTimer
