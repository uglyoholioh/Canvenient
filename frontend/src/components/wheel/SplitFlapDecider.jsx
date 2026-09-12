import { useState, useEffect, useRef, useMemo } from "react";

// Web Audio synthesizer for mechanical split-flap shutter clicks
class FlapSoundSynthesizer {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  playClick() {
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(900 + Math.random() * 200, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 0.018);

      gain.gain.setValueAtTime(0.09, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.018);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.019);

      if (this.suspendTimeout) clearTimeout(this.suspendTimeout);
      this.suspendTimeout = setTimeout(() => {
        if (this.ctx && this.ctx.state === "running") {
          this.ctx.suspend().catch(() => {});
        }
      }, 150);
    } catch {
      // Audio error suppressed
    }
  }
}

const flapSound = new FlapSoundSynthesizer();
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";

export default function SplitFlapDecider({
  items = [],
  isSpinning = false,
  onSpinStart,
  onSpinEnd,
  soundEnabled = false,
  targetWinnerIndex = null,
}) {
  const activeItems = useMemo(() => items.filter((it) => it.enabled !== false), [items]);
  const numItems = activeItems.length;

  const [displayText, setDisplayText] = useState(() => {
    return activeItems[0]?.label || "READY";
  });
  const [activeTag, setActiveTag] = useState(() => {
    return activeItems[0]?.tag || "CANVENIENT";
  });
  const [isLocked, setIsLocked] = useState(false);
  const animationTimerRef = useRef(null);

  const activeItemsRef = useRef(activeItems);
  const onSpinEndRef = useRef(onSpinEnd);
  const soundEnabledRef = useRef(soundEnabled);
  const targetWinnerIndexRef = useRef(targetWinnerIndex);

  // Mirror the latest props into refs inside an effect so the animation loop
  // always reads current values without being cancelled by re-renders.
  useEffect(() => {
    activeItemsRef.current = activeItems;
    onSpinEndRef.current = onSpinEnd;
    soundEnabledRef.current = soundEnabled;
    targetWinnerIndexRef.current = targetWinnerIndex;
  });

  // Update initial text if items change when idle
  useEffect(() => {
    if (!isSpinning && !isLocked && activeItems.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshes the idle display text when the item list changes
      setDisplayText(activeItems[0].label);
      setActiveTag(activeItems[0].tag || "");
    }
  }, [activeItems, isSpinning, isLocked]);

  // Handle spin execution - depends ONLY on isSpinning
  useEffect(() => {
    if (!isSpinning) return;

    const currentList = activeItemsRef.current;
    const count = currentList.length;
    if (count === 0) {
      onSpinEndRef.current?.(null);
      return;
    }

    if (soundEnabledRef.current) {
      flapSound.init();
    }

    setIsLocked(false);

    // Pick target winner
    const targetIdx = targetWinnerIndexRef.current;
    const chosenIndex =
      targetIdx !== null && targetIdx >= 0 && targetIdx < count
        ? targetIdx
        : Math.floor(Math.random() * count);
    const winnerItem = currentList[chosenIndex];
    const targetText = winnerItem.label.toUpperCase();

    const duration = 2000; // ms (2 seconds: fast, crisp, guaranteed to stop)
    const startTime = performance.now();
    let lastTickTime = 0;
    let tickInterval = 40;

    const updateFrame = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      tickInterval = 40 + Math.pow(progress, 3) * 280;

      if (currentTime - lastTickTime >= tickInterval) {
        lastTickTime = currentTime;

        if (soundEnabledRef.current) {
          flapSound.playClick();
        }

        if (progress < 0.7) {
          // Cycling items & scramble
          const randomItem = currentList[Math.floor(Math.random() * count)];
          const baseText = randomItem.label.toUpperCase();
          const scrambled = baseText
            .split("")
            .map((char) => {
              if (char === " " || char === "(" || char === ")" || char === "/") return char;
              return Math.random() > 0.35
                ? SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
                : char;
            })
            .join("");

          setDisplayText(scrambled);
          setActiveTag(randomItem.tag || "CYCLING");
        } else {
          // Settling phase
          const revealRatio = (progress - 0.7) / 0.3;
          const lockedCharsCount = Math.floor(revealRatio * targetText.length);

          const settled = targetText
            .split("")
            .map((char, idx) => {
              if (idx < lockedCharsCount) return char;
              if (char === " " || char === "(" || char === ")" || char === "/") return char;
              return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            })
            .join("");

          setDisplayText(settled);
          setActiveTag(winnerItem.tag || "LOCKING");
        }
      }

      if (progress < 1) {
        animationTimerRef.current = requestAnimationFrame(updateFrame);
      } else {
        // Settled completely
        setDisplayText(winnerItem.label);
        setActiveTag(winnerItem.tag || "CHOSEN");
        setIsLocked(true);
        onSpinEndRef.current?.(winnerItem);
      }
    };

    animationTimerRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (animationTimerRef.current) {
        cancelAnimationFrame(animationTimerRef.current);
      }
    };
  }, [isSpinning]);

  const displayChars = (displayText || "NO SELECTION").slice(0, 24).split("");

  return (
    <div
      onClick={!isSpinning && numItems > 0 ? onSpinStart : undefined}
      style={{
        width: "100%",
        maxWidth: "480px",
        background: "#0d0e12",
        border: "1px solid var(--border-strong, #2f3545)",
        borderRadius: "8px",
        padding: "24px 20px",
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.15)",
        fontFamily: "var(--font-mono, monospace)",
        cursor: isSpinning ? "default" : "pointer",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Terminal Board Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: isSpinning
                ? "var(--accent, #38bdf8)"
                : isLocked
                  ? "var(--success, #10b981)"
                  : "var(--text-muted)",
              boxShadow: isSpinning ? "0 0 8px var(--accent, #38bdf8)" : "none",
            }}
          />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: isSpinning ? "var(--accent, #38bdf8)" : "var(--text-muted)",
            }}
          >
            {isSpinning
              ? "STATUS: CYCLING FLAPS"
              : isLocked
                ? "STATUS: SELECTION LOCKED"
                : "STATUS: STANDBY"}
          </span>
        </div>

        {activeTag && (
          <span
            style={{
              fontSize: "10px",
              letterSpacing: "0.06em",
              padding: "2px 8px",
              borderRadius: "4px",
              background: "rgba(255, 255, 255, 0.07)",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            {activeTag}
          </span>
        )}
      </div>

      {/* Split-Flap Text Cells */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          justifyContent: "center",
          padding: "16px 0",
          minHeight: "72px",
          alignItems: "center",
        }}
      >
        {displayChars.map((char, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              width: "22px",
              height: "36px",
              background: "#161820",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "3px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: 700,
              color: isLocked ? "var(--text-h, #ffffff)" : "#e2e8f0",
              textShadow: isLocked ? "0 0 6px rgba(56, 189, 248, 0.4)" : "none",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            {/* Split line down the middle */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                height: "1px",
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                zIndex: 2,
              }}
            />
            <span style={{ zIndex: 1 }}>{char === " " ? "\u00A0" : char}</span>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingTop: "10px",
          fontSize: "11px",
          color: "var(--text-muted)",
        }}
      >
        <span>{activeItems.length} ENTRIES LOADED</span>
        <span>{isSpinning ? "PRESS TO STOP" : "CLICK BOARD OR PRESS SPACE"}</span>
      </div>
    </div>
  );
}
