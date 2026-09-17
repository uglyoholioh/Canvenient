// Decide — the wheel, one mode, every option live. No deciders gallery.

import { useMemo, useState } from "react";
import WheelCanvas from "../../components/wheel/WheelCanvas";
import {
  INITIAL_WHEELS_DATA,
  loadWheelData,
  saveWheelData,
} from "../../components/wheel/wheelDefaults";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import "./decide.css";

export default function DecideView() {
  const [data, setData] = useState(() => loadWheelData() || INITIAL_WHEELS_DATA);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

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

  const pick = (wheelId) => {
    setResult(null);
    setData((prev) => ({ ...prev, activeWheelId: wheelId }));
  };

  const toggleItem = (itemId) => {
    setResult(null);
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

  return (
    <div className="ins-decide">
      <div className="ins-decide-wheel">
        <WheelCanvas
          items={items}
          isSpinning={spinning}
          size={380}
          onSpinStart={() => {
            setSpinning(true);
            setResult(null);
          }}
          onSpinEnd={(winnerIndex) => {
            setSpinning(false);
            setResult(items[winnerIndex] || null);
          }}
        />
        <button
          type="button"
          className="ins-btn is-primary ins-decide-spin"
          disabled={spinning || items.length < 2}
          onClick={() => {
            setResult(null);
            setSpinning(true);
          }}
        >
          {spinning ? "Spinning" : "Spin"}
        </button>
        <p className="ins-cap ins-decide-result ins-mono">
          {spinning ? "spinning" : result ? result.label : ""}
        </p>
      </div>

      <aside className="ins-decide-side">
        <div className="ins-sec">
          <div className="ins-sec-head">
            <h2>Wheels</h2>
          </div>
          <div className="ins-seg ins-decide-wheelmenu">
            {data.wheels.map((w) => (
              <button
                key={w.id}
                type="button"
                className={w.id === wheel?.id ? "is-active" : ""}
                onClick={() => pick(w.id)}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>
        <div className="ins-sec">
          <div className="ins-sec-head">
            <h2>Options</h2>
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
