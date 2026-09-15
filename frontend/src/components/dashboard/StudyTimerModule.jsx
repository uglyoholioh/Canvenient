import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, Check, Timer } from "lucide-react";
import { createFocusSession } from "../../api";
import {
  clearRunning,
  enqueueSession,
  flushQueue,
  loadRunning,
  newClientId,
  saveRunning,
} from "../../focusStore";

// Builds the completed-session record for a run. Persistence (POST, or
// offline queue on failure) happens in persistSession below.
function buildSessionRecord({ startedAt, plannedMinutes, elapsedSeconds, isBreak = false }) {
  return {
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date().toISOString(),
    planned_minutes: plannedMinutes,
    actual_seconds: Math.max(0, Math.round(elapsedSeconds)),
    source: isBreak ? "break" : "manual",
    is_break: isBreak,
    client_id: newClientId(),
  };
}

const RulerSlider = ({ value, onChange }) => {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const internalValueRef = useRef(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (scrollRef.current) {
      if (isFirstRender.current) {
        scrollRef.current.scrollLeft = (value - 1) * 8;
        isFirstRender.current = false;
        internalValueRef.current = value;
      } else if (internalValueRef.current !== value) {
        scrollRef.current.scrollTo({
          left: (value - 1) * 8,
          behavior: "smooth",
        });
        internalValueRef.current = value;
      }
    }
  }, [value]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    let newValue = Math.round(scrollLeft / 8) + 1;
    if (newValue < 1) newValue = 1;
    if (newValue > 120) newValue = 120;

    if (newValue !== internalValueRef.current) {
      internalValueRef.current = newValue;
      onChange(newValue);
    }
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    startXRef.current = e.pageX;
    startScrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDragging || !scrollRef.current) return;
      e.preventDefault();
      const x = e.pageX;
      const walk = startXRef.current - x;
      scrollRef.current.scrollLeft = startScrollLeftRef.current + walk;
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [isDragging]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "56px",
        userSelect: "none",
        margin: "8px 0",
      }}
    >
      <style>{`
        .ruler-scroll-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {/* Center indicator */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "16px",
          bottom: 0,
          width: "2px",
          marginLeft: "-1px",
          backgroundColor: "var(--accent)",
          zIndex: 2,
          borderRadius: "2px",
        }}
      />

      {/* Scrollable area */}
      <div
        className="ruler-scroll-container"
        ref={scrollRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          scrollSnapType: isDragging ? "none" : "x mandatory",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        <div
          style={{
            display: "flex",
            padding: "0 calc(50% - 4px)",
            height: "100%",
            alignItems: "flex-end",
            paddingBottom: "4px",
          }}
        >
          {Array.from({ length: 120 }).map((_, i) => {
            const min = i + 1;
            const isTen = min % 10 === 0;
            const isFive = min % 5 === 0;
            return (
              <div
                key={min}
                style={{
                  width: "8px",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  flexShrink: 0,
                  position: "relative",
                  scrollSnapAlign: "center",
                }}
              >
                {isTen && (
                  <span
                    style={{
                      position: "absolute",
                      top: "2px",
                      fontSize: "10px",
                      fontWeight: 500,
                      color: "var(--color-mac-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {min}
                  </span>
                )}
                <div
                  style={{
                    width: "1px",
                    height: isTen ? "16px" : isFive ? "12px" : "6px",
                    backgroundColor: "var(--color-mac-divider, #ccc)",
                    marginTop: "auto",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default function StudyTimerModule({ token }) {
  const [isOpen, setIsOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const startedAtRef = useRef(null);
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

  // Restore a run that survived a restart, and flush any sessions that were
  // queued while the backend was unreachable. A restored run whose planned
  // time already passed while the app was closed is logged at once.
  useEffect(() => {
    flushQueue(createFocusSession, token).catch(() => {});
    const restored = loadRunning();
    if (!restored?.startedAt) return;
    const elapsed = Math.round((Date.now() - new Date(restored.startedAt).getTime()) / 1000);
    const planned = restored.plannedMinutes || 25;
    setDurationMinutes(planned);
    setHasSession(true);
    if (elapsed >= planned * 60) {
      clearRunning();
      setRemainingSeconds(0);
      persistSession({ startedAt: restored.startedAt, plannedMinutes: planned, elapsedSeconds: planned * 60 });
      return;
    }
    setRemainingSeconds(planned * 60 - elapsed);
    startedAtRef.current = new Date(restored.startedAt).getTime();
    setIsRunning(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function persistSession({ startedAt, plannedMinutes, elapsedSeconds, isBreak = false }) {
    const record = buildSessionRecord({ startedAt, plannedMinutes, elapsedSeconds, isBreak });
    try {
      await createFocusSession(token, record);
    } catch {
      enqueueSession(record);
    }
  }

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

  const handleStart = () => {
    if (!hasSession) {
      startedAtRef.current = Date.now();
      setHasSession(true);
      setRemainingSeconds(durationMinutes * 60);
      saveRunning({ startedAt: new Date().toISOString(), plannedMinutes: durationMinutes });
    }
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
    clearInterval(timerRef.current);
  };

  const elapsedThisRun = () => durationMinutes * 60 - remainingSeconds;

  const finishRun = async ({ minSeconds }) => {
    setIsRunning(false);
    clearInterval(timerRef.current);
    const startedAt = startedAtRef.current;
    const planned = durationMinutes;
    const elapsed = elapsedThisRun();
    setHasSession(false);
    setRemainingSeconds(planned * 60);
    startedAtRef.current = null;
    clearRunning();
    // Finish always logs; a cancel only counts once a real minute was focused.
    if (startedAt && elapsed >= minSeconds) {
      await persistSession({ startedAt, plannedMinutes: planned, elapsedSeconds: elapsed });
    }
  };

  const handleReset = async () => {
    await finishRun({ minSeconds: 60 });
  };

  const handleComplete = async () => {
    await finishRun({ minSeconds: 1 });
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
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button
        type="button"
        className="mac-toolbar-action"
        style={{
          width: "auto",
          padding: "0 8px",
          gap: "6px",
          color: isRunning ? "var(--text-h)" : "var(--color-mac-muted)",
          background: isRunning ? "var(--color-mac-control-hover)" : "var(--color-mac-control)",
          fontWeight: isRunning ? 600 : 500,
        }}
        onClick={() => setIsOpen(!isOpen)}
        title="Pomodoro Timer"
      >
        <Timer size={13} />
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>
          {formatTime(remainingSeconds)}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "6px",
            width: "200px",
            background: "var(--color-mac-panel)",
            border: "1px solid var(--color-mac-divider)",
            borderRadius: "8px",
            boxShadow: "0 4px 14px 0 var(--color-mac-shadow)",
            padding: "12px",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: 200,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.04em",
                color: "var(--text-h)",
                lineHeight: 1,
              }}
            >
              {formatTime(remainingSeconds)}
            </div>
            {hasSession && (
              <div style={{ fontSize: "11px", color: "var(--color-mac-muted)", marginTop: "4px" }}>
                Deep Focus
              </div>
            )}
          </div>

          {!isRunning && !hasSession ? (
            <>
              <RulerSlider value={durationMinutes} onChange={handlePreset} />
              <button
                className="mac-toolbar-action is-primary"
                style={{ width: "100%", height: "28px", justifyContent: "center" }}
                onClick={handleStart}
              >
                Start
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className="mac-toolbar-action"
                style={{ flex: 1, height: "28px" }}
                onClick={isRunning ? handlePause : handleStart}
                title={isRunning ? "Pause" : "Resume"}
              >
                {isRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                className="mac-toolbar-action"
                style={{ flex: 1, height: "28px" }}
                onClick={handleComplete}
                title="Finish & Save"
              >
                <Check size={14} />
              </button>
              <button
                className="mac-toolbar-action"
                style={{ flex: 1, height: "28px", color: "#ef4444" }}
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
