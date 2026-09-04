import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { createTask, dismissCanvasAnnouncement, getAcademicModules } from "../api";
import { extractCanvasLinks } from "../canvasLinks";
import { isEditableShortcutTarget } from "../keyboardShortcuts";
import { notifyTasksChanged } from "../taskEvents";

function getAuthorInitials(name = "") {
  if (!name || typeof name !== "string") return "CA";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getCourseColorHash(code = "") {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [160, 200, 260, 310, 35, 120];
  const hue = hues[Math.abs(hash) % hues.length];
  return `hsl(${hue}, 45%, 45%)`;
}

export default function AnnouncementTriageModal({
  announcements = [],
  token,
  onClose,
  onAnnouncementDismissed,
  onAnnouncementRestored,
}) {
  const [activeAnnouncements, setActiveAnnouncements] = useState(announcements);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissedStack, setDismissedStack] = useState([]);
  const [taskAddedIds, setTaskAddedIds] = useState(() => new Set());
  const [convertingTaskId, setConvertingTaskId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimeoutRef = useRef(null);
  const readerScrollRef = useRef(null);

  useEffect(() => {
    setActiveAnnouncements(announcements);
  }, [announcements]);

  const unreadItems = useMemo(
    () => activeAnnouncements.filter((item) => !item.is_dismissed),
    [activeAnnouncements],
  );

  const totalInitialCount = useMemo(
    () => Math.max(unreadItems.length + dismissedStack.length, 1),
    [unreadItems.length, dismissedStack.length],
  );

  const progressPercent = useMemo(() => {
    if (unreadItems.length === 0) return 100;
    const completed = dismissedStack.length;
    return Math.round((completed / totalInitialCount) * 100);
  }, [unreadItems.length, dismissedStack.length, totalInitialCount]);

  useEffect(() => {
    if (selectedIndex >= unreadItems.length && unreadItems.length > 0) {
      setSelectedIndex(unreadItems.length - 1);
    }
  }, [selectedIndex, unreadItems.length]);

  useEffect(() => {
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
  }, [selectedIndex]);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
  }, []);

  const currentItem = unreadItems[selectedIndex] || null;

  const handleNext = useCallback(() => {
    if (unreadItems.length === 0) return;
    setSelectedIndex((prev) => (prev + 1 < unreadItems.length ? prev + 1 : 0));
  }, [unreadItems.length]);

  const handlePrev = useCallback(() => {
    if (unreadItems.length === 0) return;
    setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : unreadItems.length - 1));
  }, [unreadItems.length]);

  const handleDismiss = useCallback(async () => {
    if (!currentItem || !token) return;
    const itemToDismiss = currentItem;
    const currentIndexToSave = selectedIndex;

    setActiveAnnouncements((prev) =>
      prev.map((a) => (a.id === itemToDismiss.id ? { ...a, is_dismissed: true } : a)),
    );
    setDismissedStack((prev) => [...prev, { item: itemToDismiss, index: currentIndexToSave }]);
    onAnnouncementDismissed?.(itemToDismiss.id);
    showToast("Dismissed (U to undo)");

    try {
      await dismissCanvasAnnouncement(token, itemToDismiss.id);
    } catch {
      // background error ignored
    }
  }, [currentItem, token, selectedIndex, onAnnouncementDismissed, showToast]);

  const handleUndo = useCallback(() => {
    if (dismissedStack.length === 0) return;
    const lastDismissed = dismissedStack[dismissedStack.length - 1];
    setDismissedStack((prev) => prev.slice(0, -1));

    setActiveAnnouncements((prev) =>
      prev.map((a) => (a.id === lastDismissed.item.id ? { ...a, is_dismissed: false } : a)),
    );
    onAnnouncementRestored?.(lastDismissed.item.id);
    setSelectedIndex(Math.min(lastDismissed.index, unreadItems.length));
    showToast("Restored");
  }, [dismissedStack, onAnnouncementRestored, unreadItems.length, showToast]);

  const handleConvertToTask = useCallback(async () => {
    if (!currentItem || !token || taskAddedIds.has(currentItem.id)) return;
    setConvertingTaskId(currentItem.id);
    try {
      const modules = await getAcademicModules(token).catch(() => []);
      const matchedModule = (modules || []).find(
        (m) =>
          String(m.source_course_id) === String(currentItem.course_id) ||
          m.module_code === currentItem.course_code,
      );

      await createTask(token, {
        title: `[Announcement] ${currentItem.title}`,
        description: currentItem.body || currentItem.message || "",
        module_id: matchedModule?.id,
        priority_manual: currentItem.is_priority ? "high" : "medium",
        source_type: "canvas",
        source_id: `canvas:announcement:${currentItem.course_id || 0}:${currentItem.id}`,
        external_url: currentItem.external_url || null,
      });

      setTaskAddedIds((prev) => new Set([...prev, currentItem.id]));
      notifyTasksChanged();
      showToast("Added to Tasks");
    } catch (err) {
      showToast(err.message || "Failed to create task");
    } finally {
      setConvertingTaskId(null);
    }
  }, [currentItem, token, taskAddedIds, showToast]);

  const handleOpenExternal = useCallback(() => {
    if (!currentItem?.external_url) return;
    window.open(currentItem.external_url, "_blank", "noopener,noreferrer");
  }, [currentItem]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditableShortcutTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (key === "u" || ((e.metaKey || e.ctrlKey) && key === "z")) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowDown" || e.key === "ArrowRight" || key === "j") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || key === "k") {
        e.preventDefault();
        handlePrev();
      } else if (
        e.key === " " ||
        e.key === "Delete" ||
        e.key === "Backspace" ||
        key === "e" ||
        key === "d" ||
        key === "x"
      ) {
        e.preventDefault();
        handleDismiss();
      } else if (key === "t" || key === "a") {
        e.preventDefault();
        handleConvertToTask();
      } else if (e.key === "Enter" || key === "o") {
        e.preventDefault();
        handleOpenExternal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNext,
    handlePrev,
    handleDismiss,
    handleUndo,
    handleConvertToTask,
    handleOpenExternal,
    onClose,
  ]);

  const linkedResources = useMemo(() => {
    if (!currentItem) return [];
    return extractCanvasLinks(currentItem.body || currentItem.message || "");
  }, [currentItem]);

  const authorName = currentItem?.author?.display_name || currentItem?.author || "Instructor";
  const authorInitials = getAuthorInitials(authorName);

  return (
    <div
      className="triage-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Canvas Announcements Triage"
    >
      <div className="triage-modal-container">
        {/* Subtle hairline progress bar */}
        <div className="triage-progress-track">
          <div
            className="triage-progress-fill"
            style={{ width: `${progressPercent}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Calm top header */}
        <header className="triage-header">
          <div className="triage-header-left">
            <span className="triage-header-title">Inbox</span>
            <span className="triage-counter font-mono">
              {unreadItems.length > 0
                ? `${selectedIndex + 1} of ${unreadItems.length} unread`
                : "All caught up"}
            </span>
          </div>

          <div className="triage-header-actions">
            {dismissedStack.length > 0 && (
              <button
                type="button"
                className="triage-btn-ghost font-mono"
                onClick={handleUndo}
                title="Undo dismissal (U)"
              >
                <RotateCcw size={12} />
                <span>Undo</span>
              </button>
            )}
            <button
              type="button"
              className="triage-btn-ghost"
              onClick={onClose}
              aria-label="Close (Esc)"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Content */}
        {unreadItems.length === 0 ? (
          <div className="triage-inbox-zero">
            <div className="inbox-zero-icon">
              <Sparkles size={28} />
            </div>
            <h3>All caught up!</h3>
            <p>You have triaged all unread announcements.</p>
            <div className="inbox-zero-actions">
              {dismissedStack.length > 0 && (
                <button
                  type="button"
                  className="triage-btn triage-btn-subtle font-mono"
                  onClick={handleUndo}
                >
                  <RotateCcw size={12} />
                  <span>Undo last (U)</span>
                </button>
              )}
              <button
                type="button"
                className="triage-btn triage-btn-primary font-mono"
                onClick={onClose}
              >
                Done (Esc)
              </button>
            </div>
          </div>
        ) : (
          <div className="triage-body">
            {/* Flat clean left list */}
            <nav className="triage-queue-pane" aria-label="Announcements list">
              <div className="triage-queue-list">
                {unreadItems.map((ann, idx) => {
                  const isSelected = idx === selectedIndex;
                  const isTaskAdded = taskAddedIds.has(ann.id);
                  const color = getCourseColorHash(ann.course_code || "");
                  return (
                    <button
                      type="button"
                      key={ann.id || idx}
                      className={`triage-queue-row ${isSelected ? "is-active" : ""}`}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      <div className="triage-queue-row-top">
                        <span className="triage-course-pill" style={{ "--course-color": color }}>
                          {ann.course_code || "Canvas"}
                        </span>
                        {ann.is_priority && (
                          <Flag size={10} className="triage-priority-flag" title="Priority" />
                        )}
                        {isTaskAdded && (
                          <Check size={10} className="triage-task-check" title="Added to tasks" />
                        )}
                        <span className="triage-row-date">
                          {ann.posted_at
                            ? new Date(ann.posted_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </span>
                      </div>
                      <div className="triage-queue-row-title">{ann.title}</div>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Calm reading pane */}
            <main className="triage-reader-pane">
              {currentItem && (
                <>
                  <div className="triage-reader-content" ref={readerScrollRef}>
                    {/* Visual author badge and meta header */}
                    <div className="triage-reader-header">
                      <div
                        className="triage-avatar"
                        style={{
                          backgroundColor: getCourseColorHash(currentItem.course_code || ""),
                        }}
                      >
                        {authorInitials}
                      </div>
                      <div className="triage-author-info">
                        <div className="triage-author-name">
                          <strong>{authorName}</strong>
                          <span className="triage-meta-pill">
                            {currentItem.course_code || "Canvas"}
                          </span>
                          {currentItem.is_priority && (
                            <span className="triage-priority-badge">Priority</span>
                          )}
                        </div>
                        <div className="triage-post-time">
                          {currentItem.posted_at
                            ? new Date(currentItem.posted_at).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : ""}
                        </div>
                      </div>
                    </div>

                    <h1 className="triage-reader-title">{currentItem.title}</h1>

                    <div
                      className="triage-reader-html"
                      dangerouslySetInnerHTML={{
                        __html: currentItem.body || currentItem.message || "<p>No content.</p>",
                      }}
                    />

                    {linkedResources.length > 0 && (
                      <div className="triage-linked-section">
                        <div className="triage-linked-title">Attachments & Links</div>
                        <div className="triage-links-grid">
                          {linkedResources.map((link) => (
                            <a
                              key={link.href}
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="triage-link-chip"
                            >
                              <ExternalLink size={12} />
                              <span>{link.label}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Single calm bottom bar with clean visual actions */}
                  <footer className="triage-footer-bar">
                    <div className="triage-footer-actions">
                      <button
                        type="button"
                        className="triage-btn triage-btn-primary"
                        onClick={handleDismiss}
                        title="Dismiss announcement (Space)"
                      >
                        <CheckCircle2 size={13} />
                        <span>Dismiss</span>
                        <span className="triage-key-glyph">␣</span>
                      </button>

                      <button
                        type="button"
                        className="triage-btn"
                        onClick={handleConvertToTask}
                        disabled={
                          convertingTaskId === currentItem.id || taskAddedIds.has(currentItem.id)
                        }
                        title="Add to Tasks (T)"
                      >
                        {convertingTaskId === currentItem.id ? (
                          <Loader2 size={12} className="retro-icon-spin" />
                        ) : taskAddedIds.has(currentItem.id) ? (
                          <Check size={12} />
                        ) : (
                          <Plus size={12} />
                        )}
                        <span>
                          {taskAddedIds.has(currentItem.id) ? "Added to Tasks" : "Add Task"}
                        </span>
                        <span className="triage-key-glyph">T</span>
                      </button>

                      {currentItem.external_url && (
                        <button
                          type="button"
                          className="triage-btn"
                          onClick={handleOpenExternal}
                          title="Open in Canvas (Enter)"
                        >
                          <ExternalLink size={12} />
                          <span>Canvas</span>
                          <span className="triage-key-glyph">↵</span>
                        </button>
                      )}
                    </div>

                    <div className="triage-footer-nav">
                      <button
                        type="button"
                        className="triage-nav-btn"
                        onClick={handlePrev}
                        title="Previous (↑)"
                        aria-label="Previous announcement"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="triage-nav-btn"
                        onClick={handleNext}
                        title="Next (↓)"
                        aria-label="Next announcement"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </footer>
                </>
              )}
            </main>
          </div>
        )}

        {/* Minimal feedback toast */}
        {toastMessage && (
          <div className="triage-toast font-mono" role="status">
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
