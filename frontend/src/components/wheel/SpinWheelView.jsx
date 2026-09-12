import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Dices,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Shuffle,
  ExternalLink,
  BookOpen,
  Utensils,
  CheckSquare,
  Square,
  RefreshCw,
  Terminal,
  SlidersHorizontal,
  Layers,
} from "lucide-react";
import WheelCanvas from "./WheelCanvas";
import SplitFlapDecider from "./SplitFlapDecider";
import ReelDecider from "./ReelDecider";
import CardDeckDecider from "./CardDeckDecider";
import { loadWheelData, saveWheelData, resetWheelPreset, WHEEL_PALETTE } from "./wheelDefaults";
import { getAcademicModules, getCanvasCourses } from "../../api";

export default function SpinWheelView({ token, onNavigate }) {
  const [wheelData, setWheelData] = useState(() => loadWheelData());
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("canvenient-wheel-sound") === "true";
  });
  const [deciderStyle, setDeciderStyle] = useState(() => {
    return localStorage.getItem("canvenient-decider-style") || "splitflap";
  });
  const [newOptionText, setNewOptionText] = useState("");
  const [newOptionTag, setNewOptionTag] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [isCreatingWheel, setIsCreatingWheel] = useState(false);
  const [newWheelName, setNewWheelName] = useState("");
  const [isSyncingModules, setIsSyncingModules] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState("");
  const newOptionInputRef = useRef(null);
  const syncTimerRef = useRef(null);
  const respinTimerRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(syncTimerRef.current);
      clearTimeout(respinTimerRef.current);
    },
    [],
  );

  // Active wheel object
  const activeWheel = useMemo(() => {
    const found = wheelData.wheels.find((w) => w.id === wheelData.activeWheelId);
    return found || wheelData.wheels[0];
  }, [wheelData]);

  // Active items for current wheel
  const items = activeWheel?.items || [];
  const activeItems = items.filter((it) => it.enabled !== false);

  // Persist sound preference
  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("canvenient-wheel-sound", next.toString());
      return next;
    });
  };

  // Every wheel mutation funnels through here so persistence is never missed.
  const commitWheelData = (updater) => {
    setWheelData((prev) => {
      const next = updater(prev);
      saveWheelData(next);
      return next;
    });
  };

  // Apply a transform to one wheel by id.
  const updateWheel = (wheelId, mutator) => {
    commitWheelData((prev) => ({
      ...prev,
      wheels: prev.wheels.map((wheel) => (wheel.id === wheelId ? mutator(wheel) : wheel)),
    }));
  };

  // Apply a transform to whichever wheel is currently active.
  const updateActiveWheel = (mutator) => {
    commitWheelData((prev) => ({
      ...prev,
      wheels: prev.wheels.map((wheel) =>
        wheel.id === prev.activeWheelId ? mutator(wheel) : wheel,
      ),
    }));
  };

  // Switch active wheel
  const handleSelectWheel = (wheelId) => {
    if (isSpinning) return;
    setWinner(null);
    commitWheelData((prev) => ({ ...prev, activeWheelId: wheelId }));
  };

  // Switch animation style
  const handleSelectStyle = (style) => {
    if (isSpinning) return;
    setDeciderStyle(style);
    localStorage.setItem("canvenient-decider-style", style);
  };

  // Start spinning
  const handleSpinStart = useCallback(() => {
    if (isSpinning || activeItems.length === 0) return;
    setWinner(null);
    setIsSpinning(true);
  }, [isSpinning, activeItems.length]);

  // Spin complete callback
  const handleSpinEnd = useCallback((winningItem) => {
    setIsSpinning(false);
    setWinner(winningItem);
  }, []);

  // Keyboard shortcut: Spacebar to spin
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes(e.target?.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleSpinStart();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSpinStart]);

  // Toggle item enabled/disabled
  const handleToggleItem = (itemId) => {
    if (isSpinning) return;
    updateActiveWheel((wheel) => ({
      ...wheel,
      items: wheel.items.map((item) =>
        item.id === itemId ? { ...item, enabled: item.enabled === false ? true : false } : item,
      ),
    }));
  };

  // Select all or deselect all
  const handleSetAll = (enableAll) => {
    if (isSpinning) return;
    updateActiveWheel((wheel) => ({
      ...wheel,
      items: wheel.items.map((item) => ({ ...item, enabled: enableAll })),
    }));
  };

  // Add new option
  const handleAddOption = (e) => {
    e.preventDefault();
    const trimmed = newOptionText.trim();
    if (!trimmed || isSpinning) return;

    const newItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: trimmed,
      tag: newOptionTag.trim() || "Custom",
      enabled: true,
      color: WHEEL_PALETTE[items.length % WHEEL_PALETTE.length],
    };

    updateActiveWheel((wheel) => ({
      ...wheel,
      items: [newItem, ...wheel.items],
    }));

    setNewOptionText("");
    setNewOptionTag("");
    newOptionInputRef.current?.focus();
  };

  // Delete option
  const handleDeleteOption = (itemId) => {
    if (isSpinning) return;
    updateActiveWheel((wheel) => ({
      ...wheel,
      items: wheel.items.filter((item) => item.id !== itemId),
    }));
    if (winner?.id === itemId) {
      setWinner(null);
    }
  };

  // Start editing item label
  const handleStartEdit = (item) => {
    if (isSpinning) return;
    setEditingItemId(item.id);
    setEditingItemText(item.label);
  };

  // Save edited item label
  const handleSaveEdit = () => {
    if (!editingItemId) return;
    const trimmed = editingItemText.trim();
    if (!trimmed) {
      setEditingItemId(null);
      return;
    }

    updateActiveWheel((wheel) => ({
      ...wheel,
      items: wheel.items.map((item) =>
        item.id === editingItemId ? { ...item, label: trimmed } : item,
      ),
    }));

    setEditingItemId(null);
    setEditingItemText("");
  };

  // Shuffle items order
  const handleShuffle = () => {
    if (isSpinning || items.length <= 1) return;
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    updateActiveWheel((wheel) => ({ ...wheel, items: shuffled }));
  };

  // Reset preset to default
  const handleResetPreset = () => {
    if (isSpinning || !activeWheel.isPreset) return;
    const defaultWheel = resetWheelPreset(activeWheel.id);
    if (!defaultWheel) return;

    updateWheel(activeWheel.id, () => defaultWheel);
    setWinner(null);
  };

  // Create new custom wheel
  const handleCreateWheel = (e) => {
    e.preventDefault();
    const trimmed = newWheelName.trim();
    if (!trimmed) return;

    const newId = `wheel-${Date.now()}`;
    const newWheel = {
      id: newId,
      name: trimmed,
      description: "Custom choice list",
      isPreset: false,
      items: [
        { id: `opt-1`, label: "Option 1", enabled: true, color: WHEEL_PALETTE[0] },
        { id: `opt-2`, label: "Option 2", enabled: true, color: WHEEL_PALETTE[1] },
        { id: `opt-3`, label: "Option 3", enabled: true, color: WHEEL_PALETTE[2] },
      ],
    };

    commitWheelData((prev) => ({
      activeWheelId: newId,
      wheels: [...prev.wheels, newWheel],
    }));

    setNewWheelName("");
    setIsCreatingWheel(false);
    setWinner(null);
  };

  // Delete custom wheel
  const handleDeleteWheel = (wheelId) => {
    if (isSpinning || wheelData.wheels.length <= 1) return;
    commitWheelData((prev) => {
      const nextWheels = prev.wheels.filter((w) => w.id !== wheelId);
      return { activeWheelId: nextWheels[0]?.id || "eat_nus", wheels: nextWheels };
    });
    setWinner(null);
  };

  // Sync user's enrolled academic/Canvas modules
  const handleSyncEnrolledModules = async () => {
    if (!token || isSpinning) return;
    setIsSyncingModules(true);
    setSyncFeedback("");
    try {
      const [academic, canvas] = await Promise.allSettled([
        getAcademicModules(token),
        getCanvasCourses(token),
      ]);

      const foundCodes = new Set();
      const syncedItems = [];

      if (academic.status === "fulfilled" && Array.isArray(academic.value)) {
        academic.value.forEach((mod) => {
          const code = mod.module_code || mod.code;
          if (code && !foundCodes.has(code)) {
            foundCodes.add(code);
            syncedItems.push({
              id: `mod-sync-${code}`,
              label: mod.name ? `${code} ${mod.name}` : code,
              tag: "Enrolled",
              enabled: true,
              color: WHEEL_PALETTE[syncedItems.length % WHEEL_PALETTE.length],
            });
          }
        });
      }

      if (canvas.status === "fulfilled" && Array.isArray(canvas.value)) {
        canvas.value.forEach((course) => {
          const code = course.course_code || course.name;
          if (code && !foundCodes.has(code)) {
            foundCodes.add(code);
            syncedItems.push({
              id: `canvas-sync-${course.id || code}`,
              label: course.name ? `${course.course_code || ""} ${course.name}`.trim() : code,
              tag: "Canvas",
              enabled: true,
              color: WHEEL_PALETTE[syncedItems.length % WHEEL_PALETTE.length],
            });
          }
        });
      }

      if (syncedItems.length > 0) {
        updateWheel("study_modules", (wheel) => ({ ...wheel, items: syncedItems }));
        setSyncFeedback(`Synced ${syncedItems.length} enrolled modules!`);
      } else {
        setSyncFeedback("No enrolled modules detected. Default modules retained.");
      }
    } catch (err) {
      console.error("Error syncing modules:", err);
      setSyncFeedback("Could not sync modules. Check Canvas connection.");
    } finally {
      setIsSyncingModules(false);
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => setSyncFeedback(""), 4000);
    }
  };

  // Action: Exclude winner and spin again
  const handleExcludeWinnerAndSpin = () => {
    if (!winner || isSpinning) return;
    const winnerId = winner.id;

    updateActiveWheel((wheel) => ({
      ...wheel,
      items: wheel.items.map((item) => (item.id === winnerId ? { ...item, enabled: false } : item)),
    }));

    setWinner(null);
    clearTimeout(respinTimerRef.current);
    respinTimerRef.current = setTimeout(() => {
      handleSpinStart();
    }, 150);
  };

  return (
    <div
      className="canvenient-wheel-view"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "20px 24px",
        overflowY: "auto",
        backgroundColor: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Dices size={24} color="var(--accent, #38bdf8)" />
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "var(--text-h)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Spin the Wheel
            </h1>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
            {activeWheel.description || "Make randomized decisions effortlessly"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Sound Toggle (Off by default) */}
          <button
            type="button"
            className="mac-toolbar-button"
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            title={soundEnabled ? "Sound enabled (click to mute)" : "Sound muted (click to enable)"}
            style={{
              padding: "6px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: soundEnabled ? "var(--surface-hover)" : "var(--surface)",
              border: `1px solid ${soundEnabled ? "var(--accent, #38bdf8)" : "var(--border)"}`,
              borderRadius: "6px",
              color: soundEnabled ? "var(--accent, #38bdf8)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
              transition: "all 0.15s ease",
            }}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>Sound: {soundEnabled ? "On" : "Off"}</span>
          </button>

          {/* Reset Defaults button (for presets) */}
          {activeWheel.isPreset && (
            <button
              type="button"
              onClick={handleResetPreset}
              disabled={isSpinning}
              title="Reset this wheel to original preset list"
              style={{
                padding: "6px 10px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text-muted)",
                cursor: isSpinning ? "not-allowed" : "pointer",
                fontSize: "12px",
              }}
            >
              <RotateCcw size={13} />
              <span>Reset List</span>
            </button>
          )}

          {/* New Custom Wheel Button */}
          <button
            type="button"
            onClick={() => setIsCreatingWheel(true)}
            disabled={isSpinning}
            style={{
              padding: "6px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--surface-muted)",
              border: "1px solid var(--border-strong)",
              borderRadius: "6px",
              color: "var(--text-h)",
              cursor: isSpinning ? "not-allowed" : "pointer",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            <Plus size={14} />
            <span>New Wheel</span>
          </button>
        </div>
      </header>

      {/* Wheel Preset Tabs Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 0",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
        }}
      >
        {wheelData.wheels.map((wheel) => {
          const isActive = wheel.id === wheelData.activeWheelId;
          const activeCount = wheel.items.filter((i) => i.enabled !== false).length;
          const isFood = wheel.id === "eat_nus";
          const isModule = wheel.id === "study_modules";

          return (
            <div
              key={wheel.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: isActive ? "var(--surface-hover)" : "var(--surface)",
                border: `1px solid ${isActive ? "var(--accent, #38bdf8)" : "var(--border)"}`,
                borderRadius: "6px",
                padding: "2px 4px 2px 10px",
                gap: "8px",
              }}
            >
              <button
                type="button"
                onClick={() => handleSelectWheel(wheel.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "4px 0",
                  color: isActive ? "var(--text-h)" : "var(--text-muted)",
                  fontWeight: isActive ? 600 : 400,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isFood && (
                  <Utensils size={14} color={isActive ? "var(--accent)" : "currentColor"} />
                )}
                {isModule && (
                  <BookOpen size={14} color={isActive ? "var(--accent)" : "currentColor"} />
                )}
                {!isFood && !isModule && (
                  <Dices size={14} color={isActive ? "var(--accent)" : "currentColor"} />
                )}
                <span>{wheel.name}</span>
                <span
                  style={{
                    fontSize: "11px",
                    background: isActive ? "var(--accent)" : "var(--surface-muted)",
                    color: isActive ? "#000000" : "var(--text-muted)",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    fontWeight: 600,
                  }}
                >
                  {activeCount}
                </span>
              </button>

              {/* Allow deleting custom wheels */}
              {!wheel.isPreset && wheelData.wheels.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWheel(wheel.id);
                  }}
                  title="Delete this custom wheel"
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
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}

        {/* Create Wheel Inline Form Modal / Input */}
        {isCreatingWheel && (
          <form
            onSubmit={handleCreateWheel}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--surface)",
              border: "1px solid var(--accent, #38bdf8)",
              borderRadius: "6px",
              padding: "2px 8px",
            }}
          >
            <input
              type="text"
              placeholder="Wheel name..."
              value={newWheelName}
              onChange={(e) => setNewWheelName(e.target.value)}
              autoFocus
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-h)",
                fontSize: "13px",
                outline: "none",
                width: "130px",
              }}
            />
            <button
              type="submit"
              style={{
                background: "var(--accent, #38bdf8)",
                border: "none",
                color: "#000",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingWheel(false);
                setNewWheelName("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <X size={13} />
            </button>
          </form>
        )}
      </div>

      {/* Main Content Area: Split 2-Column */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(360px, 1fr) minmax(320px, 400px)",
          gap: "24px",
          marginTop: "16px",
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left Column: Interactive Wheel & Controls */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px 16px",
            position: "relative",
            minHeight: "480px",
          }}
        >
          {/* Decider Animation Style Switcher */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "var(--surface-muted)",
              padding: "3px",
              borderRadius: "6px",
              marginBottom: "20px",
              border: "1px solid var(--border)",
            }}
          >
            {[
              { id: "splitflap", label: "Terminal", icon: Terminal },
              { id: "reel", label: "Reel Ticker", icon: SlidersHorizontal },
              { id: "cards", label: "Card Deck", icon: Layers },
              { id: "wheel", label: "Wheel", icon: Dices },
            ].map((mode) => {
              const Icon = mode.icon;
              const isSelected = deciderStyle === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectStyle(mode.id)}
                  disabled={isSpinning}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: isSelected ? 600 : 400,
                    background: isSelected ? "var(--surface)" : "transparent",
                    color: isSelected ? "var(--text-h)" : "var(--text-muted)",
                    border: isSelected ? "1px solid var(--border-strong)" : "1px solid transparent",
                    cursor: isSpinning ? "not-allowed" : "pointer",
                    boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  <Icon size={13} />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Render Active Animation Component */}
          {deciderStyle === "wheel" && (
            <WheelCanvas
              items={items}
              isSpinning={isSpinning}
              onSpinStart={handleSpinStart}
              onSpinEnd={handleSpinEnd}
              soundEnabled={soundEnabled}
              size={380}
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

          {/* Action Button and Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "20px",
            }}
          >
            <button
              type="button"
              onClick={handleSpinStart}
              disabled={isSpinning || activeItems.length === 0}
              style={{
                background: isSpinning ? "var(--surface-muted)" : "var(--accent, #38bdf8)",
                color: isSpinning ? "var(--text-muted)" : "#090a0d",
                border: "none",
                borderRadius: "8px",
                padding: "10px 28px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isSpinning || activeItems.length === 0 ? "not-allowed" : "pointer",
                boxShadow: isSpinning ? "none" : "0 2px 8px rgba(0,0,0,0.15)",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {deciderStyle === "splitflap" && <Terminal size={16} />}
              {deciderStyle === "reel" && <SlidersHorizontal size={16} />}
              {deciderStyle === "cards" && <Layers size={16} />}
              {deciderStyle === "wheel" && <Dices size={16} />}
              <span>
                {isSpinning
                  ? "Deciding…"
                  : deciderStyle === "wheel"
                    ? "SPIN WHEEL"
                    : deciderStyle === "splitflap"
                      ? "CYCLE FLAPS"
                      : deciderStyle === "reel"
                        ? "SPIN REEL"
                        : "SHUFFLE & DRAW"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleShuffle}
              disabled={isSpinning || items.length <= 1}
              title="Shuffle slice order"
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "var(--text)",
                cursor: isSpinning ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
              }}
            >
              <Shuffle size={14} />
              <span>Shuffle</span>
            </button>
          </div>

          <span
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "8px",
            }}
          >
            Tip: Press{" "}
            <kbd
              style={{
                padding: "1px 4px",
                background: "var(--surface-muted)",
                borderRadius: "3px",
              }}
            >
              Space
            </kbd>{" "}
            or click the center hub to spin
          </span>

          {/* Winner Callout Banner */}
          {winner && !isSpinning && (
            <div
              style={{
                marginTop: "20px",
                width: "100%",
                maxWidth: "460px",
                background: "var(--surface-muted)",
                border: "1px solid var(--border-strong)",
                borderLeft: "4px solid var(--accent, #38bdf8)",
                borderRadius: "6px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                animation: "fadeSlideIn 0.2s ease",
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--accent, #38bdf8)",
                    fontWeight: 600,
                  }}
                >
                  Wheel Selected
                </span>
                <button
                  type="button"
                  onClick={() => setWinner(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-h)" }}>
                {winner.label}
              </div>

              {/* Context Action Buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={handleSpinStart}
                  style={{
                    padding: "5px 10px",
                    background: "var(--accent, #38bdf8)",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#090a0d",
                    cursor: "pointer",
                  }}
                >
                  Spin Again
                </button>

                <button
                  type="button"
                  onClick={handleExcludeWinnerAndSpin}
                  title="Uncheck this winner from the wheel and spin again"
                  style={{
                    padding: "5px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  Exclude & Spin Again
                </button>

                {/* If food preset, offer link to VenueFinder */}
                {activeWheel.id === "eat_nus" && onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate("venues")}
                    style={{
                      padding: "5px 10px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <ExternalLink size={12} />
                    <span>Venue Finder</span>
                  </button>
                )}

                {/* If module preset, offer link to tasks / study timer */}
                {activeWheel.id === "study_modules" && onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate("tasks")}
                    style={{
                      padding: "5px 10px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <BookOpen size={12} />
                    <span>View Module Tasks</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Options Manager */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            overflow: "hidden",
            minHeight: "480px",
          }}
        >
          {/* Options Header & Bulk Actions */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-h)" }}>
                Options ({activeItems.length}/{items.length} active)
              </span>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => handleSetAll(true)}
                  disabled={isSpinning || activeItems.length === items.length}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--accent, #38bdf8)",
                    fontSize: "12px",
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Select All
                </button>
                <span style={{ color: "var(--border-strong)" }}>•</span>
                <button
                  type="button"
                  onClick={() => handleSetAll(false)}
                  disabled={isSpinning || activeItems.length === 0}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* If modules wheel, show Sync My Modules button */}
            {activeWheel.id === "study_modules" && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleSyncEnrolledModules}
                  disabled={isSyncingModules || isSpinning}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--text-h)",
                    cursor: isSyncingModules || isSpinning ? "not-allowed" : "pointer",
                  }}
                >
                  <RefreshCw size={13} className={isSyncingModules ? "animate-spin" : ""} />
                  <span>{isSyncingModules ? "Syncing..." : "Sync Enrolled Modules"}</span>
                </button>
                {syncFeedback && (
                  <span style={{ fontSize: "11px", color: "var(--accent, #38bdf8)" }}>
                    {syncFeedback}
                  </span>
                )}
              </div>
            )}

            {/* Quick Add Form */}
            <form onSubmit={handleAddOption} style={{ display: "flex", gap: "6px" }}>
              <input
                ref={newOptionInputRef}
                type="text"
                placeholder="Add custom option..."
                value={newOptionText}
                onChange={(e) => setNewOptionText(e.target.value)}
                disabled={isSpinning}
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "13px",
                  color: "var(--text-h)",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={!newOptionText.trim() || isSpinning}
                style={{
                  background: newOptionText.trim()
                    ? "var(--accent, #38bdf8)"
                    : "var(--surface-muted)",
                  color: newOptionText.trim() ? "#090a0d" : "var(--text-muted)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: newOptionText.trim() && !isSpinning ? "pointer" : "default",
                }}
              >
                Add
              </button>
            </form>
          </div>

          {/* Options List */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "6px 0",
            }}
          >
            {items.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                No options on this wheel yet. Add one above!
              </div>
            ) : (
              items.map((item, index) => {
                const isItemActive = item.enabled !== false;
                const isEditing = editingItemId === item.id;
                const sliceColor = item.color || WHEEL_PALETTE[index % WHEEL_PALETTE.length];

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 14px",
                      gap: "10px",
                      borderBottom: "1px solid var(--border)",
                      background: isItemActive ? "transparent" : "rgba(0,0,0,0.08)",
                      opacity: isItemActive ? 1 : 0.5,
                      transition: "background 0.1s ease",
                    }}
                  >
                    {/* Checkbox toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item.id)}
                      disabled={isSpinning}
                      title={isItemActive ? "Disable from wheel" : "Enable on wheel"}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: isSpinning ? "not-allowed" : "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        color: isItemActive ? "var(--accent, #38bdf8)" : "var(--text-muted)",
                      }}
                    >
                      {isItemActive ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>

                    {/* Color Swatch Dot */}
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: sliceColor,
                        flexShrink: 0,
                      }}
                    />

                    {/* Label or Inline Edit */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <input
                            type="text"
                            value={editingItemText}
                            onChange={(e) => setEditingItemText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") setEditingItemId(null);
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              background: "var(--bg)",
                              border: "1px solid var(--border-strong)",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              fontSize: "12px",
                              color: "var(--text-h)",
                              outline: "none",
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--accent, #38bdf8)",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: "13px",
                            color: isItemActive ? "var(--text-h)" : "var(--text-muted)",
                            textDecoration: isItemActive ? "none" : "line-through",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}
                        >
                          {item.label}
                        </span>
                      )}
                    </div>

                    {/* Tag badge */}
                    {item.tag && !isEditing && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "var(--surface-muted)",
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {item.tag}
                      </span>
                    )}

                    {/* Edit button */}
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        disabled={isSpinning}
                        title="Edit option name"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: isSpinning ? "not-allowed" : "pointer",
                          padding: "2px",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Edit2 size={13} />
                      </button>
                    )}

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteOption(item.id)}
                      disabled={isSpinning}
                      title="Remove option"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: isSpinning ? "not-allowed" : "pointer",
                        padding: "2px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
