// TriageSheet — one pass over the queue: overdue and dated tasks first, then
// new announcements. Opened on purpose (dashboard review button, ⌘⇧T, command
// bar, Tasks view). The keys do the work: j/k move, ↵ primary, d dismiss or
// delete, s skip, esc closes.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteTask,
  dismissCanvasAnnouncement,
  getCanvasAnnouncements,
  getTasks,
  updateTask,
} from "../api";
import { taskDueDate } from "../components/scheduleUtils";

export default function TriageSheet({ token, onClose }) {
  const [tasks, setTasks] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [index, setIndex] = useState(0);
  const [processed, setProcessed] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getTasks(token), getCanvasAnnouncements(token)]).then(
      ([tasksRes, announcementsRes]) => {
        if (!alive) return;
        const list = tasksRes.status === "fulfilled" ? tasksRes.value || [] : [];
        const posts = announcementsRes.status === "fulfilled" ? announcementsRes.value || [] : [];
        setTasks(list);
        setAnnouncements(posts);
      },
    );
    return () => {
      alive = false;
    };
  }, [token]);

  const queue = useMemo(() => {
    if (!tasks || !announcements) return [];
    const taskItems = tasks
      .filter((task) => task.status !== "done" && task.status !== "completed")
      .sort((a, b) => (taskDueDate(a) || Infinity) - (taskDueDate(b) || Infinity))
      .map((task) => ({ kind: "task", task }));
    const postItems = [...announcements]
      .sort(
        (a, b) =>
          new Date(b.posted_at || b.created_at || 0) - new Date(a.posted_at || a.created_at || 0),
      )
      .map((post) => ({ kind: "announcement", post }));
    return [...taskItems, ...postItems];
  }, [tasks, announcements]);

  const total = queue.length + processed;
  const current = queue[index];

  const advance = useCallback(() => {
    setIndex((i) => Math.max(0, Math.min(i, queue.length - 1)));
    setProcessed((n) => n + 1);
  }, [queue.length]);

  const finishTask = useCallback(
    async (task) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      advance();
      try {
        await updateTask(token, task.id, { status: "done" });
        window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
      } catch {
        setTasks((prev) => [...prev, task]);
      }
    },
    [token, advance],
  );

  const removeTask = useCallback(
    async (task) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      advance();
      try {
        await deleteTask(token, task.id);
        window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
      } catch {
        setTasks((prev) => [...prev, task]);
      }
    },
    [token, advance],
  );

  const dismissPost = useCallback(
    (post) => {
      setAnnouncements((prev) => prev.filter((a) => a.id !== post.id));
      advance();
      dismissCanvasAnnouncement(token, post.id).catch(() => {});
    },
    [token, advance],
  );

  const skip = useCallback(() => {
    setIndex((i) => Math.min(i + 1, queue.length - 1));
  }, [queue.length]);

  const act = useCallback(
    (action) => {
      const item = queue[index];
      if (!item) return;
      if (action === "primary") {
        if (item.kind === "task") finishTask(item.task);
        else {
          if (item.post.html_url) window.open(item.post.html_url, "_blank", "noreferrer");
          dismissPost(item.post);
        }
      } else if (action === "secondary") {
        if (item.kind === "task") removeTask(item.task);
        else dismissPost(item.post);
      } else if (action === "skip") {
        skip();
      }
    },
    [queue, index, finishTask, removeTask, dismissPost, skip],
  );

  useEffect(() => {
    const handler = (e) => {
      if (e.target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const key = e.key.toLowerCase();
      if (key === "j") setIndex((i) => Math.min(i + 1, queue.length - 1));
      else if (key === "k") setIndex((i) => Math.max(i - 1, 0));
      else if (key === "d") act("secondary");
      else if (key === "s") act("skip");
      else if (key === "enter" || e.key === "Enter") act("primary");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [act, queue.length]);

  if (tasks === null || announcements === null) {
    return (
      <div className="ins-backdrop">
        <section className="ins-sheet ins-triage">
          <p className="ins-cap">Reading the queue…</p>
        </section>
      </div>
    );
  }

  const due = current?.kind === "task" ? taskDueDate(current.task) : null;
  const dueText = due
    ? due.toLocaleString([], {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";

  return (
    <div
      className="ins-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="ins-sheet ins-triage" role="dialog" aria-modal="true" aria-label="Triage">
        <header className="ins-triage-head">
          <h2 className="ins-title">Triage</h2>
          <span className="ins-mono ins-cap">
            {queue.length ? `${processed + 1} of ${total}` : `${processed} processed`}
          </span>
          <button type="button" className="ins-iconbtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {queue.length === 0 ? (
          <div className="ins-empty">Queue clear</div>
        ) : (
          <>
            <div className="ins-triage-item">
              {current.kind === "task" ? (
                <>
                  <p className="ins-label">Task</p>
                  <p className="ins-triage-title">{current.task.title}</p>
                  <p className={`ins-cap ins-mono${due && due < new Date() ? " is-red" : ""}`}>
                    {dueText ? `due ${dueText}` : "no due date"}
                  </p>
                  <div className="ins-triage-actions">
                    <button
                      type="button"
                      className="ins-btn is-primary"
                      onClick={() => act("primary")}
                    >
                      Done
                    </button>
                    <button type="button" className="ins-btn" onClick={() => act("secondary")}>
                      Delete
                    </button>
                    <button type="button" className="ins-btn is-ghost" onClick={() => act("skip")}>
                      Skip
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="ins-label">Announcement — {current.post.course_code}</p>
                  <p className="ins-triage-title">{current.post.title}</p>
                  <p className="ins-cap">
                    {relativeOrAbsolute(current.post.posted_at || current.post.created_at)}
                  </p>
                  <div className="ins-triage-actions">
                    <button
                      type="button"
                      className="ins-btn is-primary"
                      onClick={() => act("primary")}
                    >
                      Open in Canvas
                    </button>
                    <button
                      type="button"
                      className="ins-btn"
                      onClick={() => dismissPost(current.post)}
                    >
                      Dismiss
                    </button>
                    <button type="button" className="ins-btn is-ghost" onClick={() => act("skip")}>
                      Skip
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="ins-triage-next">
              <p className="ins-label ins-triage-next-label">Next up</p>
              {queue.slice(index + 1, index + 4).map((item) => (
                <div
                  key={`${item.kind}-${item.kind === "task" ? item.task.id : item.post.id}`}
                  className="ins-triage-nextrow"
                >
                  <span className="ins-mono ins-cap">
                    {item.kind === "task"
                      ? item.task.module_code || "task"
                      : item.post.course_code || "post"}
                  </span>
                  <span className="ins-triage-nextrow-title">
                    {item.kind === "task" ? item.task.title : item.post.title}
                  </span>
                </div>
              ))}
              {index + 1 >= queue.length && <p className="ins-cap">Last item</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function relativeOrAbsolute(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const days = Math.round((date - new Date()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "1 day ago";
  if (days < 0) return `${-days} days ago`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}
