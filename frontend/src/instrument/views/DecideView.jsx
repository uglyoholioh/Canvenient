// Decide — pickers that live in the app's language: a soft pastel wheel and
// a card draw, both drawn from the same washed palette, plus the option
// manager. The wheel prints its options on the slices — shortened to the
// radius, dropped only when a slice is too narrow to carry type. The deck
// deals real cards: flip one and it's spent, reset to gather and reshuffle.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INITIAL_WHEELS_DATA,
  loadWheelData,
  saveWheelData,
} from "../../components/wheel/wheelDefaults";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import "./decide.css";

// Washed pastels for slices and cards — same family as the live accents.
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

const DISC_SIZE = 340; // px — matches .ins-wheelwrap
const discFont = (count) =>
  `600 ${count <= 16 ? 11 : count <= 24 ? 9.5 : 8.5}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;

// Party randomness, but drawn from crypto so the scanners sleep.
function randInt(count) {
  const buf = new Uint32Array(1);
  window.crypto.getRandomValues(buf);
  return buf[0] % count;
}

const newOptionId = () => `opt-${Date.now().toString(36)}-${randInt(0xfffffff).toString(36)}`;

function shuffled(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randInt(i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

// Shorten a label to the radial space; empty when even the ellipsis can't fit.
function fitRadialLabel(ctx, label, maxWidth) {
  if (!label) return "";
  if (ctx.measureText(label).width <= maxWidth) return label;
  for (let cut = label.length - 1; cut > 0; cut -= 1) {
    const candidate = `${label.slice(0, cut).trimEnd()}…`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return "";
}

// Paint slices, hairline spokes, and radial labels onto the disc. Rotation
// stays a CSS transform on the wrapper — the canvas only renders content.
function drawDisc(canvas, items, ink, halo) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = DISC_SIZE * dpr;
  canvas.height = DISC_SIZE * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, DISC_SIZE, DISC_SIZE);

  const centre = DISC_SIZE / 2;
  const radius = centre; // the wrapper's border frames the disc
  const count = items.length;
  if (count === 0) return;

  const per = (Math.PI * 2) / count;
  const top = -Math.PI / 2; // 12 o'clock, where the pointer sits

  items.forEach((item, i) => {
    ctx.beginPath();
    ctx.moveTo(centre, centre);
    ctx.arc(centre, centre, radius, top + i * per, top + (i + 1) * per);
    ctx.closePath();
    ctx.fillStyle = sliceColor(i);
    ctx.fill();
  });

  ctx.strokeStyle = halo;
  ctx.lineWidth = 2;
  for (let i = 0; i < count; i += 1) {
    const angle = top + i * per;
    ctx.beginPath();
    ctx.moveTo(centre, centre);
    ctx.lineTo(centre + Math.cos(angle) * radius, centre + Math.sin(angle) * radius);
    ctx.stroke();
  }

  // Radial labels: hub-clearing start, shortened to the radius. Once the
  // spokes are tighter than the type's height, cut the labels entirely —
  // the sidebar list stays the reference for very crowded wheels.
  const hub = 50; // clears the 84px hub
  const pad = 10;
  const band = radius - hub - pad;
  const font = count <= 16 ? 11 : count <= 24 ? 9.5 : 8.5;
  if ((hub + pad) * per < font * 1.3) return;
  ctx.font = discFont(count);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  items.forEach((item, i) => {
    const mid = top + (i + 0.5) * per;
    const text = fitRadialLabel(ctx, item.label, band);
    if (!text) return;
    ctx.save();
    ctx.translate(centre, centre);
    if (Math.cos(mid) >= 0) {
      // Right half: read hub → rim.
      ctx.rotate(mid);
      ctx.textAlign = "left";
      paintLabel(ctx, text, hub + pad, ink, halo);
    } else {
      // Left half: flip so the line still reads left-to-right.
      ctx.rotate(mid + Math.PI);
      ctx.textAlign = "right";
      paintLabel(ctx, text, -(hub + pad), ink, halo);
    }
    ctx.restore();
  });
}

function paintLabel(ctx, text, x, ink, halo) {
  ctx.strokeStyle = halo;
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, 0);
  ctx.fillStyle = ink;
  ctx.fillText(text, x, 0);
}

export default function DecideView() {
  const [data, setData] = useState(() => loadWheelData() || INITIAL_WHEELS_DATA);
  const [mode, setMode] = useState("wheel"); // wheel | cards
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [deck, setDeck] = useState([]);
  const [spent, setSpent] = useState([]);
  const [lastReveal, setLastReveal] = useState(null);
  const [draft, setDraft] = useState("");

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

  const discRef = useRef(null);

  const paintDisc = useCallback(() => {
    const canvas = discRef.current;
    if (!canvas) return;
    const style = getComputedStyle(canvas);
    drawDisc(
      canvas,
      items,
      style.getPropertyValue("--ins-ink").trim() || "#45403a",
      style.getPropertyValue("--ins-bg-raise").trim() || "#fdfcf9",
    );
  }, [items]);

  useEffect(() => {
    paintDisc();
  }, [paintDisc]);

  // Repaint when Fog/Dusk flips — ink and halo are theme tokens.
  useEffect(() => {
    window.addEventListener("canvenient-theme-changed", paintDisc);
    return () => window.removeEventListener("canvenient-theme-changed", paintDisc);
  }, [paintDisc]);

  // A fresh shuffle whenever the option set changes; flipping modes keeps an
  // open session.
  const deckSigRef = useRef(null);
  useEffect(() => {
    if (mode !== "cards") return;
    const sig = items.map((item) => item.id).join("|");
    if (deckSigRef.current === sig) return;
    deckSigRef.current = sig;
    setDeck(shuffled(items).map((item, i) => ({ ...item, tone: sliceColor(i) })));
    setSpent([]);
    setLastReveal(null);
  }, [mode, items]);

  const spentSet = useMemo(() => new Set(spent), [spent]);
  const liveCount = deck.length - spentSet.size;

  // Spent cards hold their dealt slot; live cards re-fan around them.
  const fanSlots = useMemo(() => {
    const slots = new Map();
    let live = 0;
    deck.forEach((card, index) => {
      if (spentSet.has(card.id)) {
        slots.set(card.id, index);
      } else {
        slots.set(card.id, live);
        live += 1;
      }
    });
    return slots;
  }, [deck, spentSet]);

  const mutateWheel = (fn) => {
    setResult(null);
    setLastReveal(null);
    setData((prev) => {
      const next = {
        ...prev,
        wheels: prev.wheels.map((w) => (w.id !== wheel.id ? w : fn(w))),
      };
      saveWheelData(next);
      return next;
    });
  };

  const toggleItem = (itemId) =>
    mutateWheel((w) => ({
      ...w,
      items: w.items.map((item) =>
        item.id === itemId ? { ...item, enabled: item.enabled === false } : item,
      ),
    }));

  const removeItem = (itemId) =>
    mutateWheel((w) => ({ ...w, items: w.items.filter((item) => item.id !== itemId) }));

  const addItem = () => {
    const label = draft.trim();
    if (!label) return;
    mutateWheel((w) => ({
      ...w,
      items: [...w.items, { id: newOptionId(), label, enabled: true }],
    }));
    setDraft("");
  };

  // Wheel: land the pointer inside the chosen slice. Five turns plus the
  // offset to the slice centre, on the long ease — the suspense is the point.
  const spin = () => {
    if (spinning || items.length < 2) return;
    setResult(null);
    const target = randInt(items.length);
    const per = 360 / items.length;
    // Pointer sits at 0°; slice i's centre is at (i + 0.5) * per.
    const offset = 360 * 5 + (360 - (target * per + per / 2));
    setRotation((prev) => prev + offset - (prev % 360));
    setSpinning(true);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(items[target] || null);
    }, 3300);
  };

  // Cards: flip the card you choose. It was shuffled face-down; the flip
  // spends it — out of the pool, still on the table.
  const flipCard = (card) => {
    if (spentSet.has(card.id)) return;
    setSpent((prev) => [...prev, card.id]);
    setLastReveal(card);
  };

  const resetDeck = () => {
    setDeck(shuffled(items).map((item, i) => ({ ...item, tone: sliceColor(i) })));
    setSpent([]);
    setLastReveal(null);
  };

  return (
    <div className="ins-decide">
      <div className="ins-decide-stage">
        {mode === "wheel" && (
          <div className="ins-wheelwrap">
            <div className="ins-wheel-pointer" />
            <div
              className={`ins-wheel ${spinning ? "is-spinning" : ""}`}
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <canvas ref={discRef} className="ins-wheel-disc" aria-hidden="true" />
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
          <>
            <div className="ins-cardstage">
              {deck.map((card) => {
                const isSpent = spentSet.has(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`ins-deckcard ${isSpent ? "is-spent" : ""}`}
                    style={{
                      "--tone": card.tone,
                      "--i": fanSlots.get(card.id),
                      "--n": isSpent ? deck.length : liveCount,
                    }}
                    onClick={() => flipCard(card)}
                    disabled={isSpent}
                    aria-label={
                      isSpent
                        ? `Drawn: ${card.label}`
                        : `Face-down card, ${fanSlots.get(card.id) + 1} of ${liveCount}`
                    }
                  >
                    <span className="ins-deckcard-flip">
                      <span className="ins-deckcard-face ins-deckcard-back" aria-hidden="true" />
                      <span className="ins-deckcard-face ins-deckcard-front">
                        <span className="ins-deckcard-name">{card.label}</span>
                        {card.tag && <span className="ins-deckcard-tag">{card.tag}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
              {deck.length === 0 && (
                <p className="ins-cap ins-decide-emptystage">
                  no options — add some to deal a deck
                </p>
              )}
            </div>
            <div className="ins-decide-cardmeta">
              <span className="ins-cap ins-mono">
                {liveCount} of {deck.length} left
              </span>
              <button type="button" className="ins-cap ins-decide-reset" onClick={resetDeck}>
                reset deck
              </button>
            </div>
          </>
        )}
        <p className="ins-cap ins-decide-result" role="status">
          {mode === "wheel"
            ? spinning
              ? "deciding…"
              : result
                ? result.label
                : "press the hub"
            : lastReveal
              ? lastReveal.label
              : liveCount > 0
                ? "pick a card"
                : "deck spent — reset to go again"}
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
              <div key={item.id} className="ins-decide-option">
                <label className="ins-decide-optionmain">
                  <input
                    type="checkbox"
                    className="ins-check"
                    checked={item.enabled !== false}
                    onChange={() => toggleItem(item.id)}
                  />
                  <span className={item.enabled === false ? "is-off" : ""}>{item.label}</span>
                </label>
                <button
                  type="button"
                  className="ins-decide-x"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.label}`}
                >
                  ×
                </button>
              </div>
            ))}
            {(wheel?.items || []).length === 0 && (
              <p className="ins-cap ins-decide-emptynote">nothing here yet — add an option below</p>
            )}
          </div>
          <form
            className="ins-decide-add"
            onSubmit={(event) => {
              event.preventDefault();
              addItem();
            }}
          >
            <input
              className="ins-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="add an option"
              aria-label="New option"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Add option">
              +
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
