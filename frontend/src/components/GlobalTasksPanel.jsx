// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useEffect, useRef } from "react";
import { Maximize2, X } from "lucide-react";
import TaskView from "./TaskView";

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  )).filter((element) => !element.closest("[inert]") && element.getAttribute("aria-hidden") !== "true");
}

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
    requestAnimationFrame(() => getFocusableElements(panelRef.current)[0]?.focus());
  }, [focusComposer, isOpen]);

  return (
    <div
      className={`global-tasks-layer ${isOpen ? "is-open" : "is-closed"}`}
      aria-hidden={!isOpen}
      inert={isOpen ? undefined : true}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panelRef}
        className="global-tasks-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-tasks-title"
        tabIndex={-1}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = getFocusableElements(panelRef.current);
          if (!focusable.length) {
            event.preventDefault();
            return;
          }
          const currentIndex = focusable.indexOf(document.activeElement);
          const nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
            : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
          event.preventDefault();
          focusable[nextIndex]?.focus();
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
        {isOpen && <TaskView token={token} embedded active composerAutoFocus={focusComposer} composerFocusRequestScope="global-tasks" />}
      </aside>
    </div>
  );
}
