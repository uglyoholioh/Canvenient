import { useEffect, useRef, useState } from "react";
import { Calendar, CheckCircle2, ExternalLink, Plus, Send, X } from "lucide-react";
import { getCanvasAssignment, submitCanvasAssignment } from "../../api";
import SubmitModal from "./SubmitModal";
import { useQuickCapture } from "../QuickCaptureContext";

function textFromHtml(value = "") {
  const node = document.createElement("div");
  node.innerHTML = value;
  return node.textContent || node.innerText || "";
}

export default function CanvasDrawer({ item, token, onClose }) {
  const { openQuickCapture, setCaptureContext } = useQuickCapture();
  const [detail, setDetail] = useState(item);
  const [loading, setLoading] = useState(item?.itemType === "assignment");
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(item?.has_submitted));
  const inspectorRef = useRef(null);

  useEffect(() => {
    if (!item || item.itemType !== "assignment") return;
    getCanvasAssignment(token, item.course_id, item.id).then((data) => setDetail({ ...item, ...data, itemType: "assignment" })).catch(() => {}).finally(() => setLoading(false));
  }, [item, token]);
  useEffect(() => {
    if (!detail) return undefined;
    setCaptureContext({
      type: detail.itemType || item?.itemType,
      id: detail.id,
      title: detail.title,
      label: detail.title,
      courseId: detail.course_id,
      courseCode: detail.course_code,
      dueAt: detail.due_at,
      externalUrl: detail.external_url,
    });
    return () => setCaptureContext(null);
  }, [detail, item?.itemType, setCaptureContext]);
  useEffect(() => {
    if (!item) return;
    requestAnimationFrame(() => inspectorRef.current?.focus());
  }, [item]);
  if (!item) return null;

  const isAssignment = item.itemType === "assignment";
  const submit = async (payload) => {
    await submitCanvasAssignment(token, detail.course_id, detail.id, payload);
    setSubmitted(true);
  };

  const captureAsTask = () => openQuickCapture({
    mode: "task",
    context: {
      type: detail.itemType || item.itemType,
      id: detail.id,
      title: detail.title,
      label: detail.title,
      courseId: detail.course_id,
      courseCode: detail.course_code,
      dueAt: detail.due_at,
      externalUrl: detail.external_url,
    },
  });

  return <>
    <div className="drawer-backdrop canvas-inspector-backdrop">
      <aside ref={inspectorRef} className="app-drawer canvas-drawer" role="dialog" aria-modal="false" aria-labelledby="canvas-inspector-title" tabIndex={0} data-quick-capture-browse="true" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
        <header className="canvas-drawer-header"><div><small>{detail.course_code || (isAssignment ? "Assignment" : "Announcement")}</small><h2 id="canvas-inspector-title">{detail.title}</h2></div><button type="button" className="drawer-close" onClick={onClose} aria-label="Close Canvas details"><X size={18} /></button></header>
        <div className="canvas-drawer-content">
          {loading ? <div className="module-empty">Loading details...</div> : <>
            {isAssignment && <div className="canvas-detail-meta">
              <span><Calendar size={14} />{detail.due_at ? new Date(detail.due_at).toLocaleString() : "No due date"}</span>
              {detail.points_possible != null && <span>{detail.points_possible} points</span>}
              <span className={submitted ? "is-submitted" : ""}>{submitted && <CheckCircle2 size={14} />}{submitted ? "Submitted" : "Not submitted"}</span>
            </div>}
            <div className="canvas-description">{textFromHtml(detail.description || detail.body) || "No additional details."}</div>
          </>}
        </div>
        <footer className="canvas-drawer-footer">
          <button type="button" onClick={captureAsTask}><Plus size={14} />Add task</button>
          {detail.external_url && <a href={detail.external_url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open in Canvas</a>}
          {isAssignment && !submitted && (detail.submission_types || []).length > 0 && <button type="button" className="primary-button" onClick={() => setShowSubmit(true)}><Send size={14} />Submit</button>}
        </footer>
      </aside>
    </div>
    {showSubmit && <SubmitModal assignment={detail} onClose={() => setShowSubmit(false)} onSubmit={submit} />}
  </>;
}
