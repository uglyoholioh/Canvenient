import { useState, useEffect, useRef } from "react"
import { Timer, Play, Pause, RotateCcw, Check, X, Flame } from "lucide-react"
import {
  createStudySession,
  completeStudySession,
  cancelStudySession,
  getStudySessions,
} from "../api"

export default function FloatingStudyTimer({ token }) {
  const [isOpen, setIsOpen] = useState(false)
  const [durationMinutes, setDurationMinutes] = useState(25)
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [title, setTitle] = useState("Deep Focus")
  const timerRef = useRef(null)

  // Check active session from backend on mount
  useEffect(() => {
    if (!token) return
    let mounted = true
    getStudySessions(token)
      .then((sessions) => {
        if (!mounted || !Array.isArray(sessions)) return
        const active = sessions.find((s) => s.status === "active")
        if (active) {
          setActiveSession(active)
          setTitle(active.title || "Deep Focus")
          const plannedSec = (active.planned_minutes || 25) * 60
          const elapsed = active.actual_seconds || 0
          const rem = Math.max(0, plannedSec - elapsed)
          setRemainingSeconds(rem)
          setIsRunning(true)
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [token])

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            setIsRunning(false)
            handleComplete()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }

    return () => clearInterval(timerRef.current)
  }, [isRunning, activeSession])

  const handleStart = async () => {
    if (!isRunning && !activeSession) {
      try {
        const session = await createStudySession(token, {
          title: title || "Deep Focus",
          planned_minutes: durationMinutes,
        })
        setActiveSession(session)
      } catch {
        // Fallback local
      }
    }
    setIsRunning(true)
  }

  const handlePause = () => {
    setIsRunning(false)
  }

  const handleReset = async () => {
    setIsRunning(false)
    if (activeSession) {
      try {
        await cancelStudySession(token, activeSession.id)
      } catch {}
      setActiveSession(null)
    }
    setRemainingSeconds(durationMinutes * 60)
  }

  const handleComplete = async () => {
    setIsRunning(false)
    if (activeSession) {
      try {
        const elapsed = durationMinutes * 60 - remainingSeconds
        await completeStudySession(token, activeSession.id, {
          actual_seconds: Math.max(60, elapsed),
          pause_count: 0,
        })
      } catch {}
      setActiveSession(null)
    }
    setRemainingSeconds(durationMinutes * 60)
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const progressPercent = Math.max(
    0,
    Math.min(100, (1 - remainingSeconds / (durationMinutes * 60)) * 100)
  )

  return (
    <div className={`floating-timer-container ${isOpen ? "open" : "collapsed"}`}>
      {!isOpen ? (
        <button
          className={`floating-timer-pill ${isRunning ? "running" : ""}`}
          onClick={() => setIsOpen(true)}
          title="Study Timer"
        >
          <div className="flex items-center gap-xs">
            <Timer size={15} className={isRunning ? "pulse-icon" : ""} />
            <span className="font-mono text-xs font-semibold">{formatTime(remainingSeconds)}</span>
          </div>
          {isRunning && <span className="running-dot" />}
        </button>
      ) : (
        <div className="floating-timer-card">
          <div className="floating-timer-header">
            <div className="flex items-center gap-xs">
              <Flame size={15} className="text-accent" />
              <span className="text-xs font-medium tracking-wide">STUDY SPRINT</span>
            </div>
            <button className="btn-icon-subtle" onClick={() => setIsOpen(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="floating-timer-display">
            <div className="floating-timer-digits font-mono">{formatTime(remainingSeconds)}</div>
            <div className="floating-timer-progress-track">
              <div
                className="floating-timer-progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {!isRunning && !activeSession && (
            <div className="floating-timer-presets">
              {[15, 25, 45, 60].map((m) => (
                <button
                  key={m}
                  className={`preset-btn ${durationMinutes === m ? "active" : ""}`}
                  onClick={() => {
                    setDurationMinutes(m)
                    setRemainingSeconds(m * 60)
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          )}

          <div className="floating-timer-controls">
            {!isRunning ? (
              <button className="btn btn--primary flex-1 text-xs" onClick={handleStart}>
                <Play size={13} />
                <span>Start</span>
              </button>
            ) : (
              <button className="btn btn--secondary flex-1 text-xs" onClick={handlePause}>
                <Pause size={13} />
                <span>Pause</span>
              </button>
            )}

            {(isRunning || remainingSeconds < durationMinutes * 60) && (
              <button
                className="btn btn--subtle text-xs"
                onClick={handleComplete}
                title="Finish & Save"
              >
                <Check size={14} />
              </button>
            )}

            <button
              className="btn btn--subtle text-xs"
              onClick={handleReset}
              title="Reset"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
