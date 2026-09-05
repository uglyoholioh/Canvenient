// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useEffect, useMemo, useState } from "react";
import { Bell, Check, ClipboardList, ExternalLink, Inbox, Loader2, Plus, RefreshCw } from "lucide-react";
import { createTask, getAcademicModules, getCanvasAnnouncements, getCanvasAssignments, getTasks, updateTask } from "../../api";
import AnnouncementTriageModal from "../AnnouncementTriageModal";
import { notifyTasksChanged } from "../../taskEvents";
import { stripHtml } from "../../textUtils";

function dueLabel(value) {
  if (!value) return "No due date";
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "No due date";
  const today = new Date();
  const dayDistance = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const time = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (dayDistance === 0) return `Due today · ${time}`;
  if (dayDistance === 1) return `Due tomorrow · ${time}`;
  if (dayDistance > 1 && dayDistance < 7) return `Due ${due.toLocaleDateString([], { weekday: "short" })} · ${time}`;
  return `Due ${due.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function getCachedData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function formatSyncTime(date) {
  if (!date) return "";
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function CanvasModule({ token, enabled, onOpenItem }) {
  const [assignments, setAssignments] = useState(() => getCachedData("canvenient.cache.assignments", []));
  const [announcements, setAnnouncements] = useState(() => getCachedData("canvenient.cache.announcements", []));
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    try {
      const stored = localStorage.getItem("canvenient.cache.canvas_synced_at");
      return stored ? new Date(stored) : null;
    } catch {
      return null;
    }
  });
  const [tasks, setTasks] = useState([]);
  const [refreshing, setRefreshing] = useState(enabled);
  const [addingId, setAddingId] = useState(null);
  const [error, setError] = useState("");
  const [showTriage, setShowTriage] = useState(false);

  const loadTasks = () => {
    if (!token) return;
    getTasks(token)
      .then((data) => setTasks(data || []))
      .catch(() => {});
  };

  const refreshCanvas = async (force = false) => {
    if (!enabled || !token) return;
    setRefreshing(true);
    setError("");
    try {
      const [assignmentData, announcementData, taskData] = await Promise.all([
        getCanvasAssignments(token, force),
        getCanvasAnnouncements(token, force),
        getTasks(token),
      ]);
      const nextAssignments = Array.isArray(assignmentData) ? assignmentData : [];
      const nextAnnouncements = Array.isArray(announcementData) ? announcementData : [];
      const nextTasks = Array.isArray(taskData) ? taskData : [];
      const now = new Date();

      setAssignments(nextAssignments);
      setAnnouncements(nextAnnouncements);
      setTasks(nextTasks);
      setLastSyncedAt(now);

      try {
        localStorage.setItem("canvenient.cache.assignments", JSON.stringify(nextAssignments));
        localStorage.setItem("canvenient.cache.announcements", JSON.stringify(nextAnnouncements));
        localStorage.setItem("canvenient.cache.canvas_synced_at", now.toISOString());
      } catch {}
    } catch (loadError) {
      setError(loadError.message || "Could not sync with Canvas.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!enabled || !token) {
      setRefreshing(false);
      return;
    }
    refreshCanvas(false);
  }, [enabled, token]);

  useEffect(() => {
    window.addEventListener("canvenient-task-created", loadTasks);
    window.addEventListener("canvenient-task-restored", loadTasks);
    window.addEventListener("canvenient-tasks-changed", loadTasks);
    return () => {
      window.removeEventListener("canvenient-task-created", loadTasks);
      window.removeEventListener("canvenient-task-restored", loadTasks);
      window.removeEventListener("canvenient-tasks-changed", loadTasks);
    };
  }, [token]);

  const upcoming = useMemo(() => assignments
    .filter((item) => !item.has_submitted && (!item.due_at || new Date(item.due_at) >= new Date()))
    .sort((left, right) => new Date(left.due_at || "9999-12-31") - new Date(right.due_at || "9999-12-31"))
    .slice(0, 4), [assignments]);
  const attentionItems = useMemo(() => announcements.filter((item) => item.is_priority && !item.is_dismissed).slice(0, 3), [announcements]);
  const unreadAnnouncementsCount = useMemo(() => announcements.filter((item) => !item.is_dismissed).length, [announcements]);

  const activeCanvasTaskSourceIds = useMemo(() => {
    const set = new Set();
    (tasks || []).forEach((task) => {
      if (task.source_type === "canvas" && task.source_id && task.status !== "done") {
        set.add(task.source_id);
      }
    });
    return set;
  }, [tasks]);

  const isAssignmentAdded = (item) => {
    const sourceId = `canvas:${item.course_id}:${item.id}`;
    return activeCanvasTaskSourceIds.has(sourceId);
  };

  const addToTasks = async (assignment) => {
    const sourceId = `canvas:${assignment.course_id}:${assignment.id}`;
    setAddingId(assignment.id);
    setError("");
    try {
      const [existingTasks, modules] = await Promise.all([getTasks(token), getAcademicModules(token)]);
      const existing = (existingTasks || []).find((task) => task.source_type === "canvas" && task.source_id === sourceId);

      if (existing) {
        if (existing.status === "done") {
          await updateTask(token, existing.id, { status: "todo" });
          notifyTasksChanged();
        }
      } else {
        const module = (modules || []).find((item) => String(item.source_course_id) === String(assignment.course_id) || item.module_code === assignment.course_code);
        const cleanDescription = stripHtml(assignment.description).slice(0, 4000);
        await createTask(token, {
          title: assignment.title,
          description: cleanDescription,
          module_id: module?.id,
          priority_manual: assignment.is_priority ? "high" : "medium",
          source_type: "canvas",
          source_id: sourceId,
          source_due_at: assignment.due_at || null,
          external_url: assignment.external_url || null,
        });
        notifyTasksChanged();
      }
      loadTasks();
    } catch (addError) {
      setError(addError.message || "Could not add this assignment to Tasks.");
    } finally {
      setAddingId(null);
    }
  };

  const hasCachedStore = (() => {
    try {
      return localStorage.getItem("canvenient.cache.assignments") !== null
        || localStorage.getItem("canvenient.cache.announcements") !== null;
    } catch {
      return false;
    }
  })();
  const hasCachedContent = (assignments && assignments.length > 0) || (announcements && announcements.length > 0);

  if (!enabled) return <div className="module-empty">Add your Canvas token in Settings to see deadlines and updates.</div>;
  if (!hasCachedContent && !hasCachedStore && refreshing) {
    return <div className="module-empty"><Loader2 className="retro-icon-spin" size={14} /> Loading Canvas...</div>;
  }

  return <div className="canvas-module">
    {error && (
      <div className="module-warning-banner" role="alert">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => refreshCanvas(true)}
          className="module-retry-btn"
          title="Retry fetching from Canvas"
        >
          Retry
        </button>
      </div>
    )}
    <section className="canvas-module-section">
      <div className="module-subheading">
        <span className="canvas-subheading-label"><ClipboardList size={13} />Upcoming due dates</span>
        <div className="canvas-sync-status-group">
          {refreshing ? (
            <span className="canvas-syncing-badge" role="status" aria-label="Syncing with Canvas" title="Fetching latest Canvas data">
              <RefreshCw size={10} className="retro-icon-spin" />
              <span>Syncing…</span>
            </span>
          ) : lastSyncedAt ? (
            <span
              className="canvas-synced-badge"
              title={`Last updated from Canvas: ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}
            >
              <Check size={10} className="canvas-synced-check" />
              <span>Synced {formatSyncTime(lastSyncedAt)}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="canvas-manual-sync-btn"
            onClick={() => refreshCanvas(true)}
            disabled={refreshing}
            aria-label="Refresh Canvas now"
            title="Refresh from Canvas NUS now"
          >
            <RefreshCw size={10} className={refreshing ? "retro-icon-spin" : ""} />
          </button>
        </div>
      </div>
      {upcoming.length === 0 ? <div className="module-empty compact">No unsubmitted deadlines ahead.</div> : <div className="canvas-compact-list">{upcoming.map((item) => <div className="canvas-compact-row" key={`assignment-${item.course_id}-${item.id}`}>
        <button type="button" className="canvas-compact-row-main" onClick={() => onOpenItem({ ...item, itemType: "assignment" })}>
          <span className="canvas-course-code">{item.course_code}</span><span className="canvas-row-copy"><strong>{item.title}</strong><small>{dueLabel(item.due_at)}</small></span>
        </button>
        <button
          type="button"
          className="canvas-row-action"
          onClick={() => addToTasks(item)}
          disabled={addingId === item.id || isAssignmentAdded(item)}
          aria-label={isAssignmentAdded(item) ? `${item.title} added to Tasks` : `Add ${item.title} to Tasks`}
        >
          {isAssignmentAdded(item) ? <Check size={13} /> : addingId === item.id ? <Loader2 className="retro-icon-spin" size={13} /> : <Plus size={13} />}
        </button>
      </div>)}</div>}
    </section>
    <section className="canvas-module-section canvas-announcements-summary">
      <div className="module-subheading">
        <span className="canvas-subheading-label"><Bell size={13} />Announcements</span>
        <button
          type="button"
          className="canvas-triage-trigger-btn"
          onClick={() => setShowTriage(true)}
          title="Open Canvas Inbox"
        >
          <Inbox size={11} />
          <span>Inbox</span>
          {unreadAnnouncementsCount > 0 && <span className="canvas-triage-badge">{unreadAnnouncementsCount}</span>}
        </button>
      </div>
      {attentionItems.length === 0 ? <div className="module-empty compact">No announcements need attention.</div> : <div className="canvas-compact-list">{attentionItems.map((item) => <button type="button" className="canvas-compact-row" key={`announcement-${item.id}`} onClick={() => onOpenItem({ ...item, itemType: "announcement" })}>
        <span className="canvas-course-code">{item.course_code}</span><span className="canvas-row-copy"><strong>{item.title}</strong><small>{item.posted_at ? new Date(item.posted_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "Canvas update"}</small></span><ExternalLink size={13} />
      </button>)}</div>}
    </section>
    {showTriage && (
      <AnnouncementTriageModal
        announcements={announcements}
        token={token}
        onClose={() => setShowTriage(false)}
        onAnnouncementDismissed={(id) => {
          setAnnouncements((prev) => {
            const next = prev.map((a) => (a.id === id ? { ...a, is_dismissed: true } : a));
            try {
              localStorage.setItem("canvenient.cache.announcements", JSON.stringify(next));
            } catch {}
            return next;
          });
        }}
        onAnnouncementRestored={(id) => {
          setAnnouncements((prev) => {
            const next = prev.map((a) => (a.id === id ? { ...a, is_dismissed: false } : a));
            try {
              localStorage.setItem("canvenient.cache.announcements", JSON.stringify(next));
            } catch {}
            return next;
          });
        }}
      />
    )}
  </div>;
}
