import { useRef, useEffect, useCallback } from "react";
import { WHEEL_PALETTE } from "./wheelDefaults";

// Synthesize a brief tick sound using Web Audio API
class TickSoundSynthesizer {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  playTick(pitchModifier = 1) {
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(650 * pitchModifier, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.025);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
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
      // Ignore audio failure
    }
  }
}

const tickSynthesizer = new TickSoundSynthesizer();

export default function WheelCanvas({
  items = [],
  isSpinning = false,
  onSpinStart,
  onSpinEnd,
  soundEnabled = false,
  size = 400,
  targetWinnerIndex = null,
}) {
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const currentRotationRef = useRef(0);
  const animationFrameRef = useRef(null);
  const lastSliceTickRef = useRef(-1);

  const activeItems = items.filter((item) => item.enabled !== false);
  const numItems = activeItems.length;

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

  // Render the wheel onto the canvas
  const drawWheel = useCallback(
    (rotation) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const currentItems = activeItemsRef.current;
      const count = currentItems.length;

      const dpr = window.devicePixelRatio || 1;
      const width = size;
      const height = size;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(centerX, centerY) - 16;

      if (count === 0) {
        // Empty state
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(100, 116, 139, 0.1)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No active items", centerX, centerY);
        ctx.restore();
        return;
      }

      const sliceAngle = (2 * Math.PI) / count;

      // Draw outer subtle drop shadow ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Draw slices
      for (let i = 0; i < count; i++) {
        const startAngle = rotation + i * sliceAngle;
        const endAngle = startAngle + sliceAngle;
        const item = currentItems[i];
        const color = item.color || WHEEL_PALETTE[i % WHEEL_PALETTE.length];

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        // 1px subtle divider
        ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw radial label text
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + sliceAngle / 2);

        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.font = "600 12.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 3;

        // Truncate text if needed
        const maxTextWidth = radius - 45;
        let label = item.label || "";
        if (ctx.measureText(label).width > maxTextWidth) {
          while (label.length > 3 && ctx.measureText(label + "…").width > maxTextWidth) {
            label = label.slice(0, -1);
          }
          label += "…";
        }

        ctx.fillText(label, radius - 18, 0);
        ctx.restore();
      }

      // Draw outer decorative rim
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw pegs along the outer rim for tactile feel
      const pegRadius = 2.5;
      for (let i = 0; i < count; i++) {
        const pegAngle = rotation + i * sliceAngle;
        const px = centerX + (radius - 3) * Math.cos(pegAngle);
        const py = centerY + (radius - 3) * Math.sin(pegAngle);

        ctx.beginPath();
        ctx.arc(px, py, pegRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw Center Hub
      const hubRadius = Math.max(28, radius * 0.18);
      ctx.beginPath();
      ctx.arc(centerX, centerY, hubRadius, 0, 2 * Math.PI);
      ctx.fillStyle = "#1e222b";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hub inner circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, hubRadius - 6, 0, 2 * Math.PI);
      ctx.fillStyle = "#15181f";
      ctx.fill();

      // Hub text "SPIN"
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = isSpinning ? "rgba(255, 255, 255, 0.4)" : "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(isSpinning ? "…" : "SPIN", centerX, centerY);

      ctx.restore();
    },
    [size, isSpinning],
  );

  // Redraw whenever items change or when idle
  useEffect(() => {
    drawWheel(currentRotationRef.current);
  }, [drawWheel, items]);

  // Handle spin execution - triggered ONLY when isSpinning turns true
  useEffect(() => {
    if (!isSpinning) return;

    const currentList = activeItemsRef.current;
    const count = currentList.length;
    if (count === 0) {
      onSpinEndRef.current?.(null);
      return;
    }

    if (soundEnabledRef.current) {
      tickSynthesizer.init();
    }

    const startRotation = currentRotationRef.current;
    const sliceAngle = (2 * Math.PI) / count;

    // Determine target index
    const targetIdx = targetWinnerIndexRef.current;
    const chosenIndex =
      targetIdx !== null && targetIdx >= 0 && targetIdx < count
        ? targetIdx
        : Math.floor(Math.random() * count);

    // Needle points at top: angle = 1.5 * Math.PI
    const targetSliceCenter = chosenIndex * sliceAngle + sliceAngle / 2;
    const desiredFinalAngle = 1.5 * Math.PI - targetSliceCenter;

    // Add 4 to 6 full rotations for a crisp, snappy ~2.2s spin
    const fullRotations = 4 + Math.floor(Math.random() * 3);
    const normalizedStart = startRotation % (2 * Math.PI);
    let delta = desiredFinalAngle - normalizedStart;
    while (delta < 0) delta += 2 * Math.PI;

    // Small random jitter within middle 50% of slice
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.5);
    const totalRotation = startRotation + fullRotations * 2 * Math.PI + delta + jitter;

    const duration = 2200; // ms (snappy, exciting, guaranteed to stop)
    const startTime = performance.now();

    // Ease-out quartic curve
    const easeOutQuartic = (t) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      const easedProgress = easeOutQuartic(progress);

      const currentRotation = startRotation + (totalRotation - startRotation) * easedProgress;
      currentRotationRef.current = currentRotation;

      // Calculate which slice currently crosses the top pointer
      const currentPointerRadian =
        (1.5 * Math.PI - (currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const currentSlice = Math.floor(currentPointerRadian / sliceAngle);

      if (currentSlice !== lastSliceTickRef.current) {
        lastSliceTickRef.current = currentSlice;
        if (soundEnabledRef.current) {
          const speedFactor = 1 - progress * 0.35;
          tickSynthesizer.playTick(speedFactor);
        }
        // Needle deflects directly via DOM without causing React re-renders
        if (pointerRef.current) {
          pointerRef.current.style.transform = "translateX(-50%) rotate(-16deg)";
          setTimeout(() => {
            if (pointerRef.current) {
              pointerRef.current.style.transform = "translateX(-50%) rotate(0deg)";
            }
          }, 35);
        }
      }

      drawWheel(currentRotation);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Spin finished definitively!
        if (pointerRef.current) {
          pointerRef.current.style.transform = "translateX(-50%) rotate(0deg)";
        }
        const finalNormalizedRadian =
          (1.5 * Math.PI - (currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const winningIndex = Math.floor(finalNormalizedRadian / sliceAngle) % count;
        const winner = currentList[winningIndex] || currentList[chosenIndex];

        onSpinEndRef.current?.(winner);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isSpinning, drawWheel]);

  // Handle click on canvas (specifically clicking the center hub or wheel to spin)
  const handleCanvasClick = (e) => {
    if (isSpinning || numItems === 0 || !onSpinStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const dist = Math.hypot(x - centerX, y - centerY);
    if (dist <= rect.width / 2) {
      onSpinStart();
    }
  };

  return (
    <div
      className="canvenient-wheel-container"
      style={{
        position: "relative",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Indicator Needle / Pointer at top */}
      <div
        ref={pointerRef}
        className="canvenient-wheel-pointer"
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%) rotate(0deg)",
          transformOrigin: "50% 15%",
          transition: "transform 0.06s ease-out",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
          <path
            d="M14 34L2 6C0.5 3 2.5 0 6 0H22C25.5 0 27.5 3 26 6L14 34Z"
            fill="var(--accent, #38bdf8)"
            stroke="var(--surface, #111318)"
            strokeWidth="2"
          />
          <circle cx="14" cy="8" r="3.5" fill="#ffffff" />
        </svg>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          cursor: isSpinning ? "default" : "pointer",
          userSelect: "none",
          touchAction: "none",
        }}
        aria-label="Spin the wheel"
        role="img"
      />
    </div>
  );
}
