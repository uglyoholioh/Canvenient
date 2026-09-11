import { useState, useEffect, useRef, useMemo } from "react";
import { WHEEL_PALETTE } from "./wheelDefaults";

class ReelSoundSynthesizer {
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

  playTick(speedFactor = 1) {
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(540 * speedFactor, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.02);

      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.02);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.021);

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

const reelSound = new ReelSoundSynthesizer();
const ROW_HEIGHT = 56; // height of each item row in px

export default function ReelDecider({
  items = [],
  isSpinning = false,
  onSpinStart,
  onSpinEnd,
  soundEnabled = false,
  targetWinnerIndex = null,
}) {
  const activeItems = items.filter((it) => it.enabled !== false);
  const numItems = activeItems.length;

  const stripRef = useRef(null);
  const currentOffsetYRef = useRef(0);
  const [isLocked, setIsLocked] = useState(false);
  const animationFrameRef = useRef(null);
  const lastIndexTickRef = useRef(-1);

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

  // We repeat items multiple times to create a seamless infinite strip
  const REPEAT_COUNT = 8;
  const stripItems = useMemo(() => {
    if (numItems === 0) return [];
    const repeated = [];
    for (let r = 0; r < REPEAT_COUNT; r++) {
      activeItems.forEach((item, originalIndex) => {
        repeated.push({
          ...item,
          stripKey: `${r}-${item.id}`,
          originalIndex,
        });
      });
    }
    return repeated;
  }, [activeItems, numItems]);

  useEffect(() => {
    if (!isSpinning) return;

    const currentList = activeItemsRef.current;
    const count = currentList.length;
    if (count === 0) {
      onSpinEndRef.current?.(null);
      return;
    }

    if (soundEnabledRef.current) {
      reelSound.init();
    }

    setIsLocked(false);

    // Pick target winner
    const targetIdx = targetWinnerIndexRef.current;
    const chosenIndex =
      targetIdx !== null && targetIdx >= 0 && targetIdx < count
        ? targetIdx
        : Math.floor(Math.random() * count);

    // Target position lands on round 4
    const targetRound = 4;
    const targetGlobalIndex = targetRound * count + chosenIndex;
    const startOffset = currentOffsetYRef.current % (count * ROW_HEIGHT);
    const targetOffset = targetGlobalIndex * ROW_HEIGHT;

    const duration = 2000; // ms (2.0s: fast, clean, stops reliably)
    const startTime = performance.now();
    const easeOutQuartic = (t) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutQuartic(progress);

      const currentY = startOffset + (targetOffset - startOffset) * eased;
      currentOffsetYRef.current = currentY;

      // Update DOM transform directly
      if (stripRef.current) {
        stripRef.current.style.transform = `translateY(-${currentY}px)`;
      }

      // Track item under center target
      const currentItemIndex = Math.round(currentY / ROW_HEIGHT);
      if (currentItemIndex !== lastIndexTickRef.current) {
        lastIndexTickRef.current = currentItemIndex;
        if (soundEnabledRef.current) {
          reelSound.playTick(1 - progress * 0.35);
        }
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Snapped
        if (stripRef.current) {
          stripRef.current.style.transform = `translateY(-${targetOffset}px)`;
        }
        currentOffsetYRef.current = targetOffset;
        setIsLocked(true);
        onSpinEndRef.current?.(currentList[chosenIndex]);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isSpinning]);

  const viewportHeight = 280;
  const centerTargetTop = viewportHeight / 2 - ROW_HEIGHT / 2;

  return (
    <div
      onClick={!isSpinning && numItems > 0 ? onSpinStart : undefined}
      style={{
        width: "100%",
        maxWidth: "460px",
        height: `${viewportHeight}px`,
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.25)",
        cursor: isSpinning ? "default" : "pointer",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Sliding Strip */}
      <div
        ref={stripRef}
        style={{
          position: "absolute",
          top: `${centerTargetTop}px`,
          left: 0,
          right: 0,
          /* eslint-disable-next-line react-hooks/refs -- the reel strip is driven imperatively by the animation loop; this read is its resting position */
          transform: `translateY(-${currentOffsetYRef.current}px)`,
          willChange: "transform",
        }}
      >
        {numItems === 0 ? (
          <div
            style={{
              height: `${ROW_HEIGHT}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: "13px",
            }}
          >
            No active options
          </div>
        ) : (
          stripItems.map((item) => {
            const sliceColor =
              item.color || WHEEL_PALETTE[item.originalIndex % WHEEL_PALETTE.length];

            return (
              <div
                key={item.stripKey}
                style={{
                  height: `${ROW_HEIGHT}px`,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 24px",
                  gap: "14px",
                }}
              >
                {/* Accent indicator bar */}
                <span
                  style={{
                    width: "4px",
                    height: "22px",
                    borderRadius: "2px",
                    backgroundColor: sliceColor,
                    flexShrink: 0,
                  }}
                />

                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--text-h)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {item.label}
                </span>

                {item.tag && (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "var(--surface-muted)",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {item.tag}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Center Reticle / Target Guide Frame */}
      <div
        style={{
          position: "absolute",
          top: `${centerTargetTop}px`,
          left: "12px",
          right: "12px",
          height: `${ROW_HEIGHT}px`,
          borderTop: "1.5px solid var(--accent, #38bdf8)",
          borderBottom: "1.5px solid var(--accent, #38bdf8)",
          borderRadius: "4px",
          pointerEvents: "none",
          boxShadow: isLocked
            ? "0 0 12px rgba(56, 189, 248, 0.25)"
            : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 4px",
        }}
      >
        <span
          style={{
            width: "5px",
            height: "10px",
            background: "var(--accent, #38bdf8)",
            borderRadius: "0 2px 2px 0",
          }}
        />
        <span
          style={{
            width: "5px",
            height: "10px",
            background: "var(--accent, #38bdf8)",
            borderRadius: "2px 0 0 2px",
          }}
        />
      </div>

      {/* Top Fading Mask Gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "90px",
          background: "linear-gradient(to bottom, var(--surface) 20%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Bottom Fading Mask Gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "90px",
          background: "linear-gradient(to top, var(--surface) 20%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
    </div>
  );
}
