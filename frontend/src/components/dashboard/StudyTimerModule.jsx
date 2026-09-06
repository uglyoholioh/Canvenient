import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, Check, Timer } from "lucide-react";
import {
  createStudySession,
  completeStudySession,
  cancelStudySession,
  getStudySessions,
} from "../../api";

export default function StudyTimerModule({ token }) {
  const [isOpen, setIsOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const timerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleBlur() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

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
      } catch {
        // ignore error
      }
      setActiveSession(null);
    }
    setRemainingSeconds(durationMinutes * 60);
    setIsOpen(false);
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
      } catch {
        // ignore error
      }
      setActiveSession(null);
    }
    setRemainingSeconds(durationMinutes * 60);
    setIsOpen(false);
  };

  useEffect(() => {
    completeRef.current = handleComplete;
  });

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handlePreset = (m) => {
    setDurationMinutes(m);
    setRemainingSeconds(m * 60);
  };

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button 
        type="button"
        className="mac-toolbar-action"
        style={{ 
          width: 'auto', 
          padding: '0 8px', 
          gap: '6px', 
          color: isRunning ? 'var(--text-h)' : 'var(--color-mac-muted)',
          background: isRunning ? 'var(--color-mac-control-hover)' : 'var(--color-mac-control)',
          fontWeight: isRunning ? 600 : 500
        }}
        onClick={() => setIsOpen(!isOpen)}
        title="Pomodoro Timer"
      >
        <Timer size={13} />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>
          {formatTime(remainingSeconds)}
        </span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '6px',
          width: '200px',
          background: 'var(--color-mac-panel)',
          border: '1px solid var(--color-mac-divider)',
          borderRadius: '8px',
          boxShadow: '0 4px 14px 0 var(--color-mac-shadow)',
          padding: '12px',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: 200, 
              fontVariantNumeric: 'tabular-nums', 
              letterSpacing: '-0.04em',
              color: 'var(--text-h)',
              lineHeight: 1
            }}>
              {formatTime(remainingSeconds)}
            </div>
            {activeSession && (
              <div style={{ fontSize: '11px', color: 'var(--color-mac-muted)', marginTop: '4px' }}>
                Deep Focus
              </div>
            )}
          </div>

          {!isRunning && !activeSession ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {[15, 25, 45, 60].map(m => (
                  <button
                    key={m}
                    className="mac-toolbar-action"
                    onClick={() => handlePreset(m)}
                    style={{
                      height: '24px',
                      justifyContent: 'center',
                      background: durationMinutes === m ? 'var(--color-mac-selection)' : undefined,
                      color: durationMinutes === m ? 'var(--color-mac-selection-ink)' : undefined,
                      fontSize: '11px',
                      fontWeight: durationMinutes === m ? 500 : 400
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button 
                className="mac-toolbar-action is-primary" 
                style={{ width: '100%', height: '28px', justifyContent: 'center' }}
                onClick={handleStart}
              >
                Start
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className="mac-toolbar-action" 
                style={{ flex: 1, height: '28px' }}
                onClick={isRunning ? handlePause : handleStart}
                title={isRunning ? "Pause" : "Resume"}
              >
                {isRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button 
                className="mac-toolbar-action" 
                style={{ flex: 1, height: '28px' }}
                onClick={handleComplete}
                title="Finish & Save"
              >
                <Check size={14} />
              </button>
              <button 
                className="mac-toolbar-action" 
                style={{ flex: 1, height: '28px', color: '#ef4444' }}
                onClick={handleReset}
                title="Cancel"
              >
                <Square size={12} fill="currentColor" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
