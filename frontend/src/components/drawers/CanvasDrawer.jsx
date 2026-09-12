import { useEffect, useState, useCallback } from "react";
import { Calendar, Check, CheckCircle2, ExternalLink, Loader2, Plus, Send, X } from "lucide-react";
import {
  createTask,
  getAcademicModules,
  getCanvasAssignment,
  getCanvasPage,
  getTasks,
  submitCanvasAssignment,
  updateTask,
} from "../../api";
import { extractCanvasLinks } from "../../canvasLinks";
import { stripHtml } from "../../textUtils";
import { notifyTasksChanged } from "../../taskEvents";
import SubmitModal from "./SubmitModal";

export default function CanvasDrawer({ item, token, onClose }) {
  const [detail, setDetail] = useState(item);
  const [loading, setLoading] = useState(["assignment", "page"].includes(item?.itemType));
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(item?.has_submitted));
  const [addingTask, setAddingTask] = useState(false);
  const [isAddedToTasks, setIsAddedToTasks] = useState(false);

  const checkTaskStatus = useCallback(async () => {
    const activeItem = detail || item;
    if (!token || !activeItem || activeItem.itemType !== "assignment") return;
    try {
      const tasks = await getTasks(token);
      const courseId = activeItem.course_id;
      const assignId = activeItem.id;
      const sourceId = `canvas:${courseId}:${assignId}`;
      const found = (tasks || []).some(
        (t) => t.source_type === "canvas" && t.source_id === sourceId && t.status !== "done",
      );
      if (found) {
        setIsAddedToTasks(true);
      }
    } catch {}
  }, [token, detail, item]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the async task-status check
    checkTaskStatus();
  }, [checkTaskStatus]);

  useEffect(() => {
    const handleTasksChanged = () => {
      checkTaskStatus();
    };
    window.addEventListener("canvenient-tasks-changed", handleTasksChanged);
    window.addEventListener("canvenient-task-created", handleTasksChanged);
    return () => {
      window.removeEventListener("canvenient-tasks-changed", handleTasksChanged);
      window.removeEventListener("canvenient-task-created", handleTasksChanged);
    };
  }, [checkTaskStatus]);

  useEffect(() => {
    if (!item || !["assignment", "page"].includes(item.itemType)) return;
    const request =
      item.itemType === "assignment"
        ? getCanvasAssignment(token, item.course_id, item.id)
        : getCanvasPage(token, item.course_id, item.page_url);
    request
      .then((data) => setDetail({ ...item, ...data, itemType: item.itemType }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item, token]);
  if (!item) return null;

  const isAssignment = item.itemType === "assignment";
  const linkedResources = extractCanvasLinks(detail.description || detail.body);
  const submit = async (payload) => {
    await submitCanvasAssignment(token, detail.course_id, detail.id, payload);
    setSubmitted(true);
  };

  const handleAddToTasks = async () => {
    if (addingTask || isAddedToTasks || !token) return;
    const sourceId = `canvas:${detail.course_id}:${detail.id}`;
    setAddingTask(true);
    try {
      const [existingTasks, modules] = await Promise.all([
        getTasks(token),
        getAcademicModules(token),
      ]);
      const existing = (existingTasks || []).find(
        (t) => t.source_type === "canvas" && t.source_id === sourceId,
      );

      if (existing) {
        if (existing.status === "done") {
          await updateTask(token, existing.id, { status: "todo" });
          notifyTasksChanged();
        }
      } else {
        const module = (modules || []).find(
          (m) =>
            String(m.source_course_id) === String(detail.course_id) ||
            m.module_code === detail.course_code,
        );
        const cleanDescription = stripHtml(detail.description || detail.body || "").slice(0, 4000);
        await createTask(token, {
          title: detail.title,
          description: cleanDescription,
          module_id: module?.id,
          priority_manual: detail.is_priority ? "high" : "medium",
          source_type: "canvas",
          source_id: sourceId,
          source_due_at: detail.due_at || null,
          external_url: detail.external_url || null,
        });
        notifyTasksChanged();
      }
      setIsAddedToTasks(true);
    } catch {
    } finally {
      setAddingTask(false);
    }
  };

  return (
    <>
      <div
        className="drawer-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <aside
          className="app-drawer canvas-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="canvas-inspector-title"
        >
          <header className="canvas-drawer-header">
            <div>
              <h2>{detail.title}</h2>
            </div>
            <button
              type="button"
              className="drawer-close"
              onClick={onClose}
              aria-label="Close Canvas details"
            >
              <X size={18} />
            </button>
          </header>
          <div className="canvas-drawer-content">
            {loading ? (
              <div className="module-empty">Loading details...</div>
            ) : (
              <>
                {isAssignment && (
                  <div className="canvas-detail-meta">
                    <span>
                      <Calendar size={14} />
                      {detail.due_at ? new Date(detail.due_at).toLocaleString() : "No due date"}
                    </span>
                    {detail.points_possible != null && <span>{detail.points_possible} points</span>}
                    <span className={submitted ? "is-submitted" : ""}>
                      {submitted && <CheckCircle2 size={14} />}
                      {submitted ? "Submitted" : "Not submitted"}
                    </span>
                  </div>
                )}
                <div className="canvas-description">
                  {stripHtml(detail.description || detail.body) || "No additional details."}
                </div>
                {linkedResources.length > 0 && (
                  <section className="canvas-detail-links" aria-label="Linked files and webpages">
                    <h3>Linked files and webpages</h3>
                    {linkedResources.map((link) => (
                      <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                        <span>{link.label}</span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
          <footer className="canvas-drawer-footer">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {detail.external_url && (
                <a href={detail.external_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  Open in Canvas
                </a>
              )}
              {isAssignment && (
                <button
                  type="button"
                  className={`canvas-drawer-task-btn ${isAddedToTasks ? "is-added" : ""}`}
                  onClick={handleAddToTasks}
                  disabled={addingTask || isAddedToTasks}
                  title={
                    isAddedToTasks ? "Already added to Tasks" : "Add this assignment as a task"
                  }
                >
                  {addingTask ? (
                    <>
                      <Loader2 size={13} className="retro-icon-spin" />
                      <span>Adding…</span>
                    </>
                  ) : isAddedToTasks ? (
                    <>
                      <Check size={13} />
                      <span>In Tasks</span>
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      <span>Add as Task</span>
                    </>
                  )}
                </button>
              )}
            </div>
            {isAssignment && !submitted && (detail.submission_types || []).length > 0 && (
              <button type="button" className="primary-button" onClick={() => setShowSubmit(true)}>
                <Send size={14} />
                Submit
              </button>
            )}
          </footer>
        </aside>
      </div>
      {showSubmit && (
        <SubmitModal assignment={detail} onClose={() => setShowSubmit(false)} onSubmit={submit} />
      )}
    </>
  );
}
