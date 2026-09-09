import React, { useState, useEffect, useRef } from "react";

class CardSoundSynthesizer {
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

  playFlick() {
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(400 + Math.random() * 100, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.025);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.025);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.026);

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

const cardSound = new CardSoundSynthesizer();

export default function CardDeckDecider({
  items = [],
  isSpinning = false,
  onSpinStart,
  onSpinEnd,
  soundEnabled = false,
  targetWinnerIndex = null,
}) {
  const activeItems = items.filter((it) => it.enabled !== false);
  const numItems = activeItems.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [flickAngle, setFlickAngle] = useState(0);
  const animationFrameRef = useRef(null);

  // Keep latest refs to prevent cancellation
  const activeItemsRef = useRef(activeItems);
  activeItemsRef.current = activeItems;

  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const targetWinnerIndexRef = useRef(targetWinnerIndex);
  targetWinnerIndexRef.current = targetWinnerIndex;

  useEffect(() => {
    if (!isSpinning && !isRevealed && activeItems.length > 0) {
      setCurrentIndex(0);
    }
  }, [items, isSpinning, isRevealed, activeItems.length]);

  useEffect(() => {
    if (!isSpinning) return;

    const currentList = activeItemsRef.current;
    const count = currentList.length;
    if (count === 0) {
      onSpinEndRef.current?.(null);
      return;
    }

    if (soundEnabledRef.current) {
      cardSound.init();
    }

    setIsRevealed(false);

    // Pick target winner
    const targetIdx = targetWinnerIndexRef.current;
    const chosenIndex =
      targetIdx !== null && targetIdx >= 0 && targetIdx < count
        ? targetIdx
        : Math.floor(Math.random() * count);

    const duration = 2000; // ms (2 seconds: guaranteed to stop)
    const startTime = performance.now();
    let lastTickTime = 0;
    let currentIdx = 0;

    const updateFrame = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      const interval = 45 + Math.pow(progress, 3) * 240;

      if (currentTime - lastTickTime >= interval) {
        lastTickTime = currentTime;
        currentIdx = (currentIdx + 1) % count;
        setCurrentIndex(currentIdx);

        // Card riffle animation flick
        setFlickAngle((Math.random() - 0.5) * 12);
        if (soundEnabledRef.current) {
          cardSound.playFlick();
        }
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(updateFrame);
      } else {
        // Stop exactly on winner
        setCurrentIndex(chosenIndex);
        setFlickAngle(0);
        setIsRevealed(true);
        onSpinEndRef.current?.(currentList[chosenIndex]);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isSpinning]);

  const currentItem = activeItems[currentIndex] || activeItems[0];

  return (
    <div
      onClick={!isSpinning && numItems > 0 ? onSpinStart : undefined}
      style={{
        width: "100%",
        maxWidth: "440px",
        height: "280px",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isSpinning ? "default" : "pointer",
        userSelect: "none",
        perspective: "1000px",
      }}
    >
      {numItems === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>No active options</div>
      ) : (
        <>
          {/* Background Card Layer 2 */}
          <div
            style={{
              position: "absolute",
              width: "280px",
              height: "170px",
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              transform: "translateY(16px) scale(0.9) rotate(-3deg)",
              opacity: 0.5,
              zIndex: 1,
            }}
          />

          {/* Background Card Layer 1 */}
          <div
            style={{
              position: "absolute",
              width: "295px",
              height: "180px",
              background: "var(--surface-warm, var(--surface-muted))",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              transform: "translateY(8px) scale(0.95) rotate(2deg)",
              opacity: 0.75,
              zIndex: 2,
            }}
          />

          {/* Foreground Active Card */}
          <div
            style={{
              position: "absolute",
              width: "310px",
              height: "190px",
              background: "var(--surface)",
              border: `1.5px solid ${isRevealed ? "var(--accent, #38bdf8)" : "var(--border-strong)"}`,
              borderRadius: "10px",
              boxShadow: isRevealed
                ? "0 8px 24px rgba(56, 189, 248, 0.2)"
                : "0 4px 16px rgba(0,0,0,0.15)",
              transform: `rotate(${flickAngle}deg) scale(${isRevealed ? 1.03 : 1})`,
              transition: isSpinning ? "none" : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
              zIndex: 3,
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {/* Top row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: isRevealed ? "var(--accent, #38bdf8)" : "var(--text-muted)",
                }}
              >
                {isRevealed ? "Drawn Choice" : isSpinning ? "Shuffling…" : "Deck Top"}
              </span>

              {currentItem?.tag && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "var(--surface-muted)",
                    color: "var(--text-muted)",
                  }}
                >
                  {currentItem.tag}
                </span>
              )}
            </div>

            {/* Center label */}
            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: isRevealed ? "var(--text-h)" : "var(--text)",
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                lineHeight: "1.3",
              }}
            >
              {currentItem?.label}
            </div>

            {/* Bottom row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border)",
                paddingTop: "8px",
              }}
            >
              <span>{activeItems.length} cards in deck</span>
              <span>{isSpinning ? "Drawing…" : "Click card or Space"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
