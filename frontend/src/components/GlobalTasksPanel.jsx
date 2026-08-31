// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useEffect, useRef } from "react";
import { Maximize2, X } from "lucide-react";
import TaskView from "./TaskView";

export default function GlobalTasksPanel({
  token,
  isOpen,
  onClose,
  onOpenFull,
  shortcutLabel,
  focusComposer = false,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen || focusComposer) return;
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [focusComposer, isOpen]);

  return (
    <div
      className={`global-tasks-layer ${isOpen ? "is-open" : "is-closed"}`}
      aria-hidden={!isOpen}
      inert={isOpen ? undefined : true}
    >
      <aside
        ref={panelRef}
        className="global-tasks-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="global-tasks-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <header className="global-tasks-header">
          <div>
            <h2 id="global-tasks-title">Tasks</h2>
            {shortcutLabel && <kbd>{shortcutLabel}</kbd>}
          </div>
          <div>
            <button type="button" onClick={onOpenFull} aria-label="Open full Tasks page" title="Open full Tasks page"><Maximize2 size={14} /></button>
            <button type="button" onClick={onClose} aria-label="Close Tasks panel"><X size={15} /></button>
          </div>
        </header>
        {isOpen && <TaskView token={token} embedded active composerAutoFocus={focusComposer} />}
      </aside>
    </div>
  );
}
