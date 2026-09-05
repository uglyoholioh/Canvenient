import React from "react";
import { ArrowUpRight } from "lucide-react";

const MIN_COLUMN_PIXELS = 96;
const MIN_ROW_PIXELS = 72;
const KEYBOARD_RESIZE_STEP = 16;
const RESIZE_HANDLES = [
  { direction: "n", label: "top" },
  { direction: "ne", label: "top right" },
  { direction: "e", label: "right" },
  { direction: "se", label: "bottom right" },
  { direction: "s", label: "bottom" },
  { direction: "sw", label: "bottom left" },
  { direction: "w", label: "left" },
  { direction: "nw", label: "top left" },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseTrackPixels(value) {
  return [...String(value).matchAll(/(-?\d*\.?\d+)px/g)].map((match) => Number(match[1]));
}

function snapColumns(columns, snapToFraction = 12) {
  const colTotal = columns.reduce((s, v) => s + v, 0);
  const snapped = columns.map((value) => Math.round((value / colTotal) * snapToFraction) / snapToFraction);
  const sum = snapped.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) {
    const diff = Math.round((1 - sum) * snapToFraction);
    const maxIdx = snapped.indexOf(Math.max(...snapped));
    snapped[maxIdx] += (diff / snapToFraction);
  }
  return snapped;
}

function nearestBoundary(offset, tracks) {
  let closestIndex = 0;
  let closestDistance = Math.abs(offset);
  let position = 0;
  tracks.forEach((track, index) => {
    position += track;
    const distance = Math.abs(offset - position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index + 1;
    }
  });
  return closestIndex;
}

function moveTrackBoundary(tracks, boundary, delta, minimum) {
  if (boundary <= 0 || boundary >= tracks.length) return [...tracks];
  const next = [...tracks];
  const appliedDelta = clamp(delta, minimum - next[boundary - 1], next[boundary] - minimum);
  next[boundary - 1] += appliedDelta;
  next[boundary] -= appliedDelta;
  return next;
}

function resizeTrackEnd(tracks, boundary, delta, minimum) {
  if (boundary <= 0 || boundary > tracks.length) return [...tracks];
  const next = [...tracks];
  next[boundary - 1] = Math.max(minimum, next[boundary - 1] + delta);
  return next;
}

export default function ModuleCard({
  moduleId,
  title,
  onViewFull,
  children,
  className = "",
  editing = false,
  dragging = false,
  size = { columns: 1, rows: 1 },
  onMove,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
  onDragStart,
  onDragEnd,
  onReorder,
  cardRef,
  browseActive = false,
  onBrowseFocus,
  onBrowseMove,
  onQuickCapture,
}) {
  const [resizing, setResizing] = React.useState(false);
  const [loweredTop, setLoweredTop] = React.useState(null);
  const localCardRef = React.useRef(null);
  const resizeSession = React.useRef(null);
  const moveSession = React.useRef(null);

  const updateButtonPosition = React.useCallback(() => {
    if (!onViewFull || !localCardRef.current) return;
    const card = localCardRef.current;
    const body = card.querySelector(".dashboard-module-body");
    if (!body) return;

    const cardRect = card.getBoundingClientRect();
    const buttonHeight = 32;
    const buttonMargin = 8;
    const defaultButtonTop = cardRect.bottom - buttonHeight - buttonMargin;

    const items = body.querySelectorAll(
      ".task-module-item, .task-module-next-line, .task-module-new-entry, .schedule-timeline-item, .schedule-module-message, .canvas-compact-row, .canvas-module-section, .module-list-item, button:not(.module-view-full), a, input, textarea"
    );

    let maxBottom = 0;
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.height > 0 && rect.width > 0 && rect.bottom > maxBottom) {
        maxBottom = rect.bottom;
      }
    });

    if (maxBottom === 0) {
      const bodyRect = body.getBoundingClientRect();
      maxBottom = bodyRect.bottom;
    }

    if (maxBottom > defaultButtonTop - 6) {
      const targetTop = Math.round(maxBottom - cardRect.top + buttonMargin);
      setLoweredTop((prev) => (prev === targetTop ? prev : targetTop));
    } else {
      setLoweredTop((prev) => (prev === null ? null : null));
    }
  }, [onViewFull]);

  React.useEffect(() => {
    if (!onViewFull) return;
    const card = localCardRef.current;
    if (!card) return;

    updateButtonPosition();

    const handleUpdate = () => {
      updateButtonPosition();
    };

    card.addEventListener("scroll", handleUpdate, { capture: true, passive: true });
    window.addEventListener("resize", handleUpdate);

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleUpdate);
      resizeObserver.observe(card);
      const body = card.querySelector(".dashboard-module-body");
      if (body) resizeObserver.observe(body);
    }

    return () => {
      card.removeEventListener("scroll", handleUpdate, { capture: true });
      window.removeEventListener("resize", handleUpdate);
      resizeObserver?.disconnect();
    };
  }, [onViewFull, updateButtonPosition, children]);

  const setCardRef = React.useCallback((element) => {
    localCardRef.current = element;
    cardRef?.(element);
  }, [cardRef]);

  const enterCard = () => {
    const firstControl = localCardRef.current?.querySelector(
      ".dashboard-module-body button:not([disabled]), .dashboard-module-body input:not([disabled]), .dashboard-module-body textarea:not([disabled]), .dashboard-module-body select:not([disabled])",
    ) || localCardRef.current?.querySelector(".module-view-full:not([disabled])");
    firstControl?.focus();
  };

  const handleBrowseKeyDown = (event) => {
    const browsingCard = event.target === event.currentTarget;
    if (browsingCard && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      onBrowseMove?.(event.key);
      return;
    }
    if (browsingCard && ["Enter", "F2"].includes(event.key)) {
      event.preventDefault();
      enterCard();
      return;
    }
    if (browsingCard && event.key.toLowerCase() === "o") {
      event.preventDefault();
      onViewFull?.();
      return;
    }
    if (browsingCard && event.key.toLowerCase() === "n") {
      event.preventDefault();
      onQuickCapture?.();
      return;
    }
    if (!browsingCard && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      localCardRef.current?.focus();
    }
  };

  React.useEffect(() => () => {
    resizeSession.current?.cleanup?.();
    moveSession.current?.cleanup?.();
    document.body.classList.remove("is-resizing-dashboard-card");
    document.body.classList.remove("is-moving-dashboard-card");
    RESIZE_HANDLES.forEach((handle) => document.body.classList.remove(`is-resizing-${handle.direction}`));
  }, []);

  const finishResize = (commit) => {
    const session = resizeSession.current;
    if (!session) return;
    session.cleanup?.();
    resizeSession.current = null;
    document.body.classList.remove("is-resizing-dashboard-card");
    document.body.classList.remove(`is-resizing-${session.direction}`);
    setResizing(false);
    if (commit) onResizeCommit?.(session.currentTracks);
    else onResizeCancel?.();
  };

  const calculateTracks = (session, clientX, clientY) => {
    const deltaX = clientX - session.startX;
    const deltaY = clientY - session.startY;
    const columns = session.columnBoundary === null
      ? [...session.columns]
      : moveTrackBoundary(session.columns, session.columnBoundary, deltaX, MIN_COLUMN_PIXELS);
    const rows = session.rowBoundary === null
      ? [...session.rows]
      : session.direction.includes("s")
        ? resizeTrackEnd(session.rows, session.rowBoundary, deltaY, MIN_ROW_PIXELS)
        : moveTrackBoundary(session.rows, session.rowBoundary, deltaY, MIN_ROW_PIXELS);
    return {
      columns: snapColumns(columns),
      rows,
    };
  };

  const updateResize = (clientX, clientY) => {
    const session = resizeSession.current;
    if (!session) return;
    session.currentTracks = calculateTracks(session, clientX, clientY);
    onResizePreview?.(session.currentTracks);
  };

  const beginResize = (event, direction) => {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest(".dashboard-module");
    const grid = card?.closest(".dashboard-grid");
    if (!card || !grid) return;

    const gridStyle = window.getComputedStyle(grid);
    const gridRect = grid.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const columns = parseTrackPixels(gridStyle.gridTemplateColumns);
    const rows = parseTrackPixels(gridStyle.gridTemplateRows);
    if (columns.length !== 4 || rows.length === 0) return;
    const cardRight = cardRect.right ?? cardRect.left + cardRect.width;
    const cardBottom = cardRect.bottom ?? cardRect.top + cardRect.height;
    const columnStart = nearestBoundary(cardRect.left - gridRect.left, columns);
    const columnEnd = nearestBoundary(cardRight - gridRect.left, columns);
    const rowStart = nearestBoundary(cardRect.top - gridRect.top, rows);
    const rowEnd = nearestBoundary(cardBottom - gridRect.top, rows);
    const columnBoundary = direction.includes("w") ? columnStart : direction.includes("e") ? columnEnd : null;
    const rowBoundary = direction.includes("n") ? rowStart : direction.includes("s") ? rowEnd : null;

    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      updateResize(moveEvent.clientX, moveEvent.clientY);
    };
    const handleMouseUp = (upEvent) => {
      upEvent.preventDefault();
      finishResize(true);
    };
    const handleWindowBlur = () => finishResize(false);
    const cleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };

    resizeSession.current = {
      startX: event.clientX,
      startY: event.clientY,
      columns,
      rows,
      columnBoundary,
      rowBoundary,
      currentTracks: {
        columns: snapColumns(columns),
        rows,
      },
      direction,
      cleanup,
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp, { passive: false });
    window.addEventListener("blur", handleWindowBlur);
    document.body.classList.add("is-resizing-dashboard-card");
    document.body.classList.add(`is-resizing-${direction}`);
    setResizing(true);
  };

  const resizeWithKeyboard = (event, direction) => {
    const card = event.currentTarget.closest(".dashboard-module");
    const grid = card?.closest(".dashboard-grid");
    if (!card || !grid) return;
    const gridStyle = window.getComputedStyle(grid);
    const gridRect = grid.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const columns = parseTrackPixels(gridStyle.gridTemplateColumns);
    const rows = parseTrackPixels(gridStyle.gridTemplateRows);
    if (columns.length !== 4 || rows.length === 0) return;
    const horizontalDelta = event.key === "ArrowLeft" ? -KEYBOARD_RESIZE_STEP : event.key === "ArrowRight" ? KEYBOARD_RESIZE_STEP : 0;
    const verticalDelta = event.key === "ArrowUp" ? -KEYBOARD_RESIZE_STEP : event.key === "ArrowDown" ? KEYBOARD_RESIZE_STEP : 0;
    if ((!horizontalDelta || !/[ew]/.test(direction)) && (!verticalDelta || !/[ns]/.test(direction))) return;
    event.preventDefault();
    event.stopPropagation();
    const cardRight = cardRect.right ?? cardRect.left + cardRect.width;
    const cardBottom = cardRect.bottom ?? cardRect.top + cardRect.height;
    const session = {
      startX: 0,
      startY: 0,
      columns,
      rows,
      columnBoundary: direction.includes("w")
        ? nearestBoundary(cardRect.left - gridRect.left, columns)
        : direction.includes("e") ? nearestBoundary(cardRight - gridRect.left, columns) : null,
      rowBoundary: direction.includes("n")
        ? nearestBoundary(cardRect.top - gridRect.top, rows)
        : direction.includes("s") ? nearestBoundary(cardBottom - gridRect.top, rows) : null,
      direction,
    };
    onResizeCommit?.(calculateTracks(session, horizontalDelta, verticalDelta));
  };

  const beginMove = (event) => {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest(".dashboard-module");
    const grid = card?.closest(".dashboard-grid");
    const gridStyle = grid ? window.getComputedStyle(grid) : null;
    const gridRect = grid?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const columns = gridStyle ? parseTrackPixels(gridStyle.gridTemplateColumns) : [];
    const rows = gridStyle ? parseTrackPixels(gridStyle.gridTemplateRows) : [];
    const cardBottom = cardRect ? cardRect.bottom ?? cardRect.top + cardRect.height : 0;
    const rowStart = cardRect && gridRect ? nearestBoundary(cardRect.top - gridRect.top, rows) : 0;
    const rowEnd = cardRect && gridRect ? nearestBoundary(cardBottom - gridRect.top, rows) : rows.length;
    const canSlideVertically = columns.length === 4 && rowStart > 0 && rowEnd < rows.length;

    const handleMouseMove = (moveEvent) => {
      const session = moveSession.current;
      if (!session) return;
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - session.startX;
      const deltaY = moveEvent.clientY - session.startY;
      const distance = Math.hypot(deltaX, deltaY);
      if (!session.started && distance < 5) return;
      if (!session.started) {
        session.started = true;
        session.mode = session.canSlideVertically && Math.abs(deltaY) >= Math.abs(deltaX) ? "slide" : "reorder";
        if (session.mode === "slide") {
          document.body.classList.add("is-resizing-dashboard-card", "is-resizing-s");
          setResizing(true);
        } else {
          document.body.classList.add("is-moving-dashboard-card");
          onDragStart?.();
        }
      }

      if (session.mode === "slide") {
        const nextRows = [...session.rows];
        const appliedDelta = clamp(
          deltaY,
          MIN_ROW_PIXELS - nextRows[session.rowStart - 1],
          nextRows[session.rowEnd] - MIN_ROW_PIXELS,
        );
        nextRows[session.rowStart - 1] += appliedDelta;
        nextRows[session.rowEnd] -= appliedDelta;
        session.currentTracks = {
          columns: snapColumns(session.columns),
          rows: nextRows,
        };
        onResizePreview?.(session.currentTracks);
        return;
      }

      const targetCard = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.(".dashboard-module");
      if (session.targetCard !== targetCard) {
        session.targetCard?.classList.remove("is-drop-target");
        session.targetCard = targetCard?.dataset.module === moduleId ? null : targetCard;
        session.targetCard?.classList.add("is-drop-target");
      }
    };
    const handleMouseUp = (upEvent) => {
      upEvent.preventDefault();
      const session = moveSession.current;
      if (!session) return;
      if (session.mode === "slide") {
        session.cleanup();
        moveSession.current = null;
        document.body.classList.remove("is-resizing-dashboard-card", "is-resizing-s");
        setResizing(false);
        onResizeCommit?.(session.currentTracks);
        return;
      }
      const targetModule = session.targetCard?.dataset.module;
      const shouldReorder = session.started && targetModule && targetModule !== moduleId;
      session.cleanup();
      moveSession.current = null;
      document.body.classList.remove("is-moving-dashboard-card");
      if (shouldReorder) onReorder?.(targetModule);
      onDragEnd?.();
    };
    const handleWindowBlur = () => {
      const session = moveSession.current;
      if (!session) return;
      session.cleanup();
      moveSession.current = null;
      document.body.classList.remove("is-moving-dashboard-card");
      document.body.classList.remove("is-resizing-dashboard-card", "is-resizing-s");
      if (session.mode === "slide") {
        setResizing(false);
        onResizeCancel?.();
        return;
      }
      onDragEnd?.();
    };
    const cleanup = () => {
      moveSession.current?.targetCard?.classList.remove("is-drop-target");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };

    moveSession.current = {
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      mode: null,
      targetCard: null,
      columns,
      rows,
      rowStart,
      rowEnd,
      canSlideVertically,
      currentTracks: null,
      cleanup,
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp, { passive: false });
    window.addEventListener("blur", handleWindowBlur);
  };

  return (
    <section
      ref={setCardRef}
      className={`dashboard-module ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""} ${resizing ? "is-resizing" : ""} ${className}`}
      data-module={moduleId}
      data-columns={size.columns}
      data-rows={size.rows}
      tabIndex={browseActive ? 0 : -1}
      aria-label={`${title} dashboard card. Use arrow keys to move, Enter to interact, or N for a new task.${onViewFull ? " Press O to open the full view." : ""}`}
      onMouseEnter={updateButtonPosition}
      onFocus={(event) => {
        updateButtonPosition();
        if (event.target === event.currentTarget) onBrowseFocus?.();
      }}
      onKeyDown={handleBrowseKeyDown}
      style={{
        "--dashboard-card-columns": size.columns,
        "--dashboard-card-rows": size.rows,
      }}
    >
      {editing && (
        <>
          <div
            className="dashboard-card-drag-handle"
            role="button"
            tabIndex={0}
            aria-label={`Drag ${title} to move or reorder`}
            title={`Drag vertically to move ${title} within its column, or across another card to reorder.`}
            onMouseDown={beginMove}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); onMove?.(-1); }
              if (event.key === "ArrowRight") { event.preventDefault(); onMove?.(1); }
            }}
          ><span /></div>
          {RESIZE_HANDLES.map((handle) => (
            <button
              type="button"
              key={handle.direction}
              className={`dashboard-card-resize-handle is-${handle.direction}`}
              aria-label={`Resize ${title} from ${handle.label}`}
              title={`Drag the ${handle.label} edge to resize ${title}.`}
              onMouseDown={(event) => beginResize(event, handle.direction)}
              onKeyDown={(event) => resizeWithKeyboard(event, handle.direction)}
            />
          ))}
        </>
      )}
      <div className="dashboard-module-body">{children}</div>
      {onViewFull && (
        <button
          type="button"
          className={`module-view-full ${loweredTop !== null ? "is-lowered" : ""}`}
          onClick={onViewFull}
          aria-label={`Open ${title.toLowerCase()}`}
          title={`Open ${title.toLowerCase()}`}
          style={loweredTop !== null ? { top: `${loweredTop}px`, bottom: "auto" } : undefined}
        >
          <span>Open {title.toLowerCase()}</span>
          <ArrowUpRight size={11} className="module-view-full-icon" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
