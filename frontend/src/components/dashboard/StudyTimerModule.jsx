import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Check } from "lucide-react";
import {
  createStudySession,
  completeStudySession,
  cancelStudySession,
  getStudySessions,
} from "../../api";

export default function StudyTimerModule({ token }) {
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    getStudySessions(token)
      .then((sessions) => {
        if (!mounted || !Array.isArray(sessions)) return;
        const active = sessions.find((s) => s.status === "active");
        if (active) {
          setActiveSession(active);
          const plannedSec = (active.planned_minutes || 25) * 60;
          const elapsed = active.actual_seconds || 0;
          const rem = Math.max(0, plannedSec - elapsed);
          setDurationMinutes(active.planned_minutes || 25);
          setRemainingSeconds(rem);
          setIsRunning(true);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [token]);

  const completeRef = useRef(null);
  
  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsRunning(false);
            if (completeRef.current) completeRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isRunning]);

  const handleStart = async () => {
    if (!isRunning && !activeSession) {
      try {
        const session = await createStudySession(token, {
          title: "Deep Focus",
          planned_minutes: durationMinutes,
        });
        setActiveSession(session);
      } catch {
        // Fallback local
      }
    }
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = async () => {
    setIsRunning(false);
    if (activeSession) {
      try {
        await cancelStudySession(token, activeSession.id);
      } catch {}
      setActiveSession(null);
    }
    setRemainingSeconds(durationMinutes * 60);
  };

  const handleComplete = async () => {
    setIsRunning(false);
    if (activeSession) {
      try {
        const elapsed = durationMinutes * 60 - remainingSeconds;
        await completeStudySession(token, activeSession.id, {
          actual_seconds: Math.max(60, elapsed),
          pause_count: 0,
        });
      } catch {}
      setActiveSession(null);
    }
    setRemainingSeconds(durationMinutes * 60);
  };
  completeRef.current = handleComplete;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = Math.max(
    0,
    Math.min(100, (1 - remainingSeconds / (durationMinutes * 60)) * 100)
  );

  return (
    <div className="study-timer-widget" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-pill)', padding: '2px 8px', fontSize: '12px', marginRight: '8px' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: isRunning ? 'var(--accent)' : 'var(--text-h)' }}>
        {formatTime(remainingSeconds)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {!isRunning ? (
          <button type="button" className="slim-icon-btn" style={{ width: 22, height: 22, borderRadius: 4 }} onClick={handleStart} title="Start">
            <Play size={12} />
          </button>
        ) : (
          <button type="button" className="slim-icon-btn" style={{ width: 22, height: 22, borderRadius: 4 }} onClick={handlePause} title="Pause">
            <Pause size={12} />
          </button>
        )}
        {(isRunning || remainingSeconds < durationMinutes * 60) && (
          <button type="button" className="slim-icon-btn" style={{ width: 22, height: 22, borderRadius: 4 }} onClick={handleComplete} title="Finish & Save">
            <Check size={12} />
          </button>
        )}
        <button type="button" className="slim-icon-btn" style={{ width: 22, height: 22, borderRadius: 4 }} onClick={handleReset} title="Reset">
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}
