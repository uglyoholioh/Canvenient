import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, ExternalLink, Send, X } from "lucide-react";
import { getCanvasAssignment, getCanvasPage, submitCanvasAssignment } from "../../api";
import { extractCanvasLinks } from "../../canvasLinks";
import { stripHtml } from "../../textUtils";
import SubmitModal from "./SubmitModal";

export default function CanvasDrawer({ item, token, onClose }) {
  const [detail, setDetail] = useState(item);
  const [loading, setLoading] = useState(["assignment", "page"].includes(item?.itemType));
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(item?.has_submitted));

  useEffect(() => {
    if (!item || !["assignment", "page"].includes(item.itemType)) return;
    const request = item.itemType === "assignment"
      ? getCanvasAssignment(token, item.course_id, item.id)
      : getCanvasPage(token, item.course_id, item.page_url);
    request.then((data) => setDetail({ ...item, ...data, itemType: item.itemType })).catch(() => {}).finally(() => setLoading(false));
  }, [item, token]);
  if (!item) return null;

  const isAssignment = item.itemType === "assignment";
  const linkedResources = extractCanvasLinks(detail.description || detail.body);
  const submit = async (payload) => {
    await submitCanvasAssignment(token, detail.course_id, detail.id, payload);
    setSubmitted(true);
  };

  return <>
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="app-drawer canvas-drawer" role="dialog" aria-modal="true" aria-labelledby="canvas-inspector-title">
        <header className="canvas-drawer-header"><div><h2>{detail.title}</h2></div><button type="button" className="drawer-close" onClick={onClose} aria-label="Close Canvas details"><X size={18} /></button></header>
        <div className="canvas-drawer-content">
          {loading ? <div className="module-empty">Loading details...</div> : <>
            {isAssignment && <div className="canvas-detail-meta">
              <span><Calendar size={14} />{detail.due_at ? new Date(detail.due_at).toLocaleString() : "No due date"}</span>
              {detail.points_possible != null && <span>{detail.points_possible} points</span>}
              <span className={submitted ? "is-submitted" : ""}>{submitted && <CheckCircle2 size={14} />}{submitted ? "Submitted" : "Not submitted"}</span>
            </div>}
            <div className="canvas-description">{stripHtml(detail.description || detail.body) || "No additional details."}</div>
            {linkedResources.length > 0 && <section className="canvas-detail-links" aria-label="Linked files and webpages">
              <h3>Linked files and webpages</h3>
              {linkedResources.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><span>{link.label}</span><ExternalLink size={14} /></a>)}
            </section>}
          </>}
        </div>
        <footer className="canvas-drawer-footer">
          {detail.external_url && <a href={detail.external_url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open in Canvas</a>}
          {isAssignment && !submitted && (detail.submission_types || []).length > 0 && <button type="button" className="primary-button" onClick={() => setShowSubmit(true)}><Send size={14} />Submit</button>}
        </footer>
      </aside>
    </div>
    {showSubmit && <SubmitModal assignment={detail} onClose={() => setShowSubmit(false)} onSubmit={submit} />}
  </>;
}
