import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Dices, RotateCcw, ArrowUpRight, Utensils, BookOpen } from "lucide-react";
import WheelCanvas from "../wheel/WheelCanvas";
import SplitFlapDecider from "../wheel/SplitFlapDecider";
import ReelDecider from "../wheel/ReelDecider";
import CardDeckDecider from "../wheel/CardDeckDecider";
import { loadWheelData, saveWheelData } from "../wheel/wheelDefaults";

export default function WheelModule({ token, onNavigate }) {
  const [wheelData, setWheelData] = useState(() => loadWheelData());
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [deciderStyle, setDeciderStyle] = useState(() => {
    return localStorage.getItem("canvenient-decider-style") || "splitflap";
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("canvenient-wheel-sound") === "true";
  });

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) setWheelData(e.detail);
      else setWheelData(loadWheelData());
    };
    window.addEventListener("canvenient-wheel-updated", handleUpdate);
    return () => window.removeEventListener("canvenient-wheel-updated", handleUpdate);
  }, []);

  const activeWheel = useMemo(() => {
    const found = wheelData.wheels.find((w) => w.id === wheelData.activeWheelId);
    return found || wheelData.wheels[0];
  }, [wheelData]);

  const items = activeWheel?.items || [];
  const activeItems = items.filter((it) => it.enabled !== false);

  const handleSelectWheel = (wheelId) => {
    if (isSpinning) return;
    setWinner(null);
    setWheelData((prev) => {
      const next = { ...prev, activeWheelId: wheelId };
      saveWheelData(next);
      return next;
    });
  };

  const handleSpinStart = useCallback(() => {
    if (isSpinning || activeItems.length === 0) return;
    setWinner(null);
    setIsSpinning(true);
  }, [isSpinning, activeItems.length]);

  const handleSpinEnd = useCallback((winningItem) => {
    setIsSpinning(false);
    setWinner(winningItem);
  }, []);

  const isFood = activeWheel?.id === "eat_nus";
  const isModule = activeWheel?.id === "study_modules";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "12px",
        boxSizing: "border-box",
        gap: "10px",
        position: "relative",
      }}
    >
      {/* Top Bar: Wheel tabs & full view link */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
          {wheelData.wheels.slice(0, 3).map((w) => {
            const isActive = w.id === activeWheel?.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => handleSelectWheel(w.id)}
                disabled={isSpinning}
                style={{
                  background: isActive ? "var(--surface-hover)" : "var(--surface-muted)",
                  border: `1px solid ${isActive ? "var(--accent, #38bdf8)" : "var(--border)"}`,
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  color: isActive ? "var(--text-h)" : "var(--text-muted)",
                  cursor: isSpinning ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {w.name}
              </button>
            );
          })}
        </div>

        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate("wheel")}
            title="Open full Spin the Wheel view"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>

      {/* Interactive Decider Animation */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "180px",
          overflow: "hidden",
        }}
      >
        {deciderStyle === "wheel" && (
          <WheelCanvas
            items={items}
            isSpinning={isSpinning}
            onSpinStart={handleSpinStart}
            onSpinEnd={handleSpinEnd}
            soundEnabled={soundEnabled}
            size={180}
          />
        )}
        {deciderStyle === "splitflap" && (
          <SplitFlapDecider
            items={items}
            isSpinning={isSpinning}
            onSpinStart={handleSpinStart}
            onSpinEnd={handleSpinEnd}
            soundEnabled={soundEnabled}
          />
        )}
        {deciderStyle === "reel" && (
          <ReelDecider
            items={items}
            isSpinning={isSpinning}
            onSpinStart={handleSpinStart}
            onSpinEnd={handleSpinEnd}
            soundEnabled={soundEnabled}
          />
        )}
        {deciderStyle === "cards" && (
          <CardDeckDecider
            items={items}
            isSpinning={isSpinning}
            onSpinStart={handleSpinStart}
            onSpinEnd={handleSpinEnd}
            soundEnabled={soundEnabled}
          />
        )}
      </div>

      {/* Winner Callout or Spin Button */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {winner && !isSpinning ? (
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--accent, #38bdf8)",
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            🎉 {winner.label}
          </div>
        ) : (
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {activeItems.length} options active
          </div>
        )}

        <button
          type="button"
          onClick={handleSpinStart}
          disabled={isSpinning || activeItems.length === 0}
          style={{
            width: "100%",
            background: isSpinning ? "var(--surface-muted)" : "var(--accent, #38bdf8)",
            color: isSpinning ? "var(--text-muted)" : "#090a0d",
            border: "none",
            borderRadius: "6px",
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isSpinning || activeItems.length === 0 ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <Dices size={14} />
          <span>{isSpinning ? "Spinning..." : "Spin"}</span>
        </button>
      </div>
    </div>
  );
}
