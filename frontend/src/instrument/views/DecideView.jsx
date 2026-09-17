// Decide — pickers that live in the app's language: a soft pastel wheel and
// a card draw, both drawn from the same washed palette, plus the option
// manager. Three ways to let chance decide; the facts stay the facts.

import { useCallback, useMemo, useState } from "react";
import {
  INITIAL_WHEELS_DATA,
  loadWheelData,
  saveWheelData,
} from "../../components/wheel/wheelDefaults";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import "./decide.css";

// Washed pastels for slices and card backs — same family as the live accents.
const PASTELS = [
  "#d98a70",
  "#93a8c4",
  "#8aa98c",
  "#c2a265",
  "#b3a3c9",
  "#9db8a0",
  "#c9a0a0",
  "#a8c0bf",
];

const sliceColor = (index) => PASTELS[index % PASTELS.length];

function conicGradient(items) {
  const per = 100 / Math.max(items.length, 1);
  const stops = items.map((item, i) => `${sliceColor(i)} ${i * per}% ${(i + 1) * per}%`).join(", ");
  return `conic-gradient(${stops})`;
}

export default function DecideView() {
  const [data, setData] = useState(() => loadWheelData() || INITIAL_WHEELS_DATA);
  const [mode, setMode] = useState("wheel"); // wheel | cards
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [drawn, setDrawn] = useState(null);
  const [shuffling, setShuffling] = useState(false);

  const wheel = useMemo(
    () => data.wheels.find((w) => w.id === data.activeWheelId) || data.wheels[0],
    [data],
  );
  const items = useMemo(
    () => (wheel?.items || []).filter((item) => item.enabled !== false),
    [wheel],
  );

  const fact = useMemo(() => {
    if (!wheel) return "";
    return `${wheel.name} · ${items.length} options`;
  }, [wheel, items.length]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const pickWheel = (wheelId) => {
    setResult(null);
    setDrawn(null);
    setData((prev) => ({ ...prev, activeWheelId: wheelId }));
  };

  const toggleItem = (itemId) => {
    setResult(null);
    setDrawn(null);
    setData((prev) => {
      const next = {
        ...prev,
        wheels: prev.wheels.map((w) =>
          w.id !== wheel.id
            ? w
            : {
                ...w,
                items: w.items.map((item) =>
                  item.id === itemId ? { ...item, enabled: item.enabled === false } : item,
                ),
              },
        ),
      };
      saveWheelData(next);
      return next;
    });
  };

  // Wheel: land the pointer inside the chosen slice. Five turns plus the
  // offset to the slice centre, on the long ease — the suspense is the point.
  const spin = () => {
    if (spinning || items.length < 2) return;
    setResult(null);
    const target = Math.floor(Math.random() * items.length);
    const per = 360 / items.length;
    // Pointer sits at 0°; slice i's centre is at (i + 0.5) * per.
    const offset = 360 * 5 + (360 - (target * per + per / 2));
    setRotation((prev) => prev + offset - (prev % 360));
    setSpinning(true);
    setResult(null);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(items[target] || null);
    }, 3300);
  };

  // Cards: shuffle, then draw.
  const draw = () => {
    if (shuffling || items.length < 1) return;
    setShuffling(true);
    setResult(null);
    setDrawn(null);
    const target = Math.floor(Math.random() * items.length);
    window.setTimeout(() => {
      setShuffling(false);
      setDrawn(items[target] || null);
    }, 900);
  };

  return (
    <div className="ins-decide">
      <div className="ins-decide-stage">
        {mode === "wheel" && (
          <div className="ins-wheelwrap">
            <div className="ins-wheel-pointer" />
            <div
              className={`ins-wheel ${spinning ? "is-spinning" : ""}`}
              style={{
                background: conicGradient(items),
                transform: `rotate(${rotation}deg)`,
              }}
            >
              <button
                type="button"
                className="ins-wheel-hub"
                disabled={spinning || items.length < 2}
                onClick={spin}
              >
                spin
              </button>
            </div>
          </div>
        )}
        {mode === "cards" && (
          <div className="ins-cardstage">
            {items.map((item, index) => {
              const isDrawn = drawn && drawn.id === item.id && !shuffling;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ins-deckcard ${shuffling ? "is-shuffling" : ""} ${isDrawn ? "is-drawn" : ""}`}
                  style={{
                    "--tone": sliceColor(index),
                    "--i": index,
                    "--n": items.length,
                  }}
                  onClick={draw}
                  disabled={shuffling}
                  aria-label={`Draw ${item.label}`}
                >
                  {isDrawn ? item.label : ""}
                </button>
              );
            })}
          </div>
        )}
        <p className="ins-cap ins-decide-result">
          {spinning || shuffling
            ? "deciding…"
            : result
              ? result.label
              : drawn
                ? drawn.label
                : mode === "wheel"
                  ? "press the hub"
                  : "tap the deck"}
        </p>
      </div>

      <aside className="ins-decide-side">
        <div className="ins-sec">
          <div className="ins-sec-head">
            <h2 className="ins-title">Pickers</h2>
          </div>
          <div className="ins-seg ins-decide-modemenu">
            <button
              type="button"
              className={mode === "wheel" ? "is-active" : ""}
              onClick={() => setMode("wheel")}
            >
              Wheel
            </button>
            <button
              type="button"
              className={mode === "cards" ? "is-active" : ""}
              onClick={() => setMode("cards")}
            >
              Cards
            </button>
          </div>
        </div>
        <div className="ins-sec">
          <div className="ins-sec-head">
            <h2 className="ins-title">{wheel?.name}</h2>
            <span className="ins-cap ins-mono">{items.length} live</span>
          </div>
          <div className="ins-decide-options">
            {(wheel?.items || []).map((item) => (
              <label key={item.id} className="ins-decide-option">
                <input
                  type="checkbox"
                  className="ins-check"
                  checked={item.enabled !== false}
                  onChange={() => toggleItem(item.id)}
                />
                <span className={item.enabled === false ? "is-off" : ""}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
