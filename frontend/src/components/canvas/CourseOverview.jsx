import { useMemo } from "react";
import { Bell, Calendar, Check, CheckSquare, Download, FileText, Loader2, Plus } from "lucide-react";
import CanvasSearchSection from "../CanvasSearchSection";
import { dueLabel, formatSize, relDate } from "./fileUtils";
import { FileTypeIcon } from "./FileBrowser";

export function CourseOverview({
  courseId,
  assignments,
  announcements,
  files,
  filesByCourse,
  displayedCourses,
  courseColors,
  onSelectTab,
  onOpenItem,
  onAddToTasks,
  addingTaskId,
  isAssignmentAdded,
}) {
  const now = new Date();
  const upcoming = useMemo(() => {
    const now = new Date();
    return assignments
      .filter(a => String(a.course_id) === String(courseId) && !a.has_submitted)
      .filter(a => !a.due_at || new Date(a.due_at) >= now)
      .sort((a,b) => (a.due_at ? new Date(a.due_at) : Infinity) - (b.due_at ? new Date(b.due_at) : Infinity))
      .slice(0, 5);
  }, [assignments, courseId]);

  const recentAnn = useMemo(() =>
    announcements
      .filter(a => String(a.course_id) === String(courseId))
      .sort((a,b) => new Date(b.posted_at||0) - new Date(a.posted_at||0))
      .slice(0, 4),
  [announcements, courseId]);

  const recentFiles = useMemo(() =>
    [...(files||[])].filter(f=>f.updated_at).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,6),
  [files]);

  return (
    <div className="cv-overview-grid">
      {/* Smart Search Bar Scoped to this Module */}
      <CanvasSearchSection
        filesByCourse={filesByCourse || { [String(courseId)]: files || [] }}
        displayedCourses={displayedCourses}
        courseColors={courseColors}
        selectedCourseId={courseId}
        onOpenItem={onOpenItem}
      />

      {/* Upcoming assignments card */}
      <section className="cv-card">
        <header className="cv-card-header">
          <div className="cv-card-title"><Calendar size={13} /> Upcoming Tasks & Assignments</div>
          <button type="button" className="cv-btn-link" onClick={() => onSelectTab("assignments")}>View all →</button>
        </header>
        <div className="cv-card-content">
          {upcoming.length === 0 ? (
            <div className="cv-empty-note">No upcoming assignments due.</div>
          ) : (
            upcoming.map(a => {
              const due = a.due_at ? new Date(a.due_at) : null;
              const urgent = due && (due - now) < 86400000 * 3;
              const isAdded = isAssignmentAdded ? isAssignmentAdded(a) : false;
              const isAdding = addingTaskId === a.id;
              return (
                <div key={a.id} className="cv-list-item" onClick={() => onOpenItem({ ...a, itemType: "assignment" })}>
                  <span className="cv-list-item-icon"><CheckSquare size={13} /></span>
                  <div className="cv-list-item-body">
                    <div className="cv-list-item-title">{a.title}</div>
                    <div className="cv-list-item-sub">{dueLabel(a.due_at)}</div>
                  </div>
                  {urgent && <span className="cv-badge-urgent">Due soon</span>}
                  {onAddToTasks && (
                    <div className="cv-row-actions" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`cv-task-action-btn ${isAdded ? "is-added" : ""}`}
                        onClick={(e) => onAddToTasks(e, a)}
                        disabled={isAdding || isAdded}
                        aria-label={isAdded ? "In Tasks" : "Add as Task"}
                        title={isAdded ? "Already added to Tasks" : "Add as Task"}
                      >
                        {isAdding ? <Loader2 size={12} className="retro-icon-spin" /> : isAdded ? <Check size={12} /> : <Plus size={12} />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Announcements card */}
      <section className="cv-card">
        <header className="cv-card-header">
          <div className="cv-card-title"><Bell size={13} /> Recent Announcements</div>
          <button type="button" className="cv-btn-link" onClick={() => onSelectTab("announcements")}>View all →</button>
        </header>
        <div className="cv-card-content">
          {recentAnn.length === 0 ? (
            <div className="cv-empty-note">No recent announcements.</div>
          ) : (
            recentAnn.map(a => (
              <div key={a.id} className="cv-list-item" onClick={() => onOpenItem({ ...a, itemType: "announcement" })}>
                <span className="cv-list-item-icon"><Bell size={13} /></span>
                <div className="cv-list-item-body">
                  <div className="cv-list-item-title">{a.title}</div>
                  <div className="cv-list-item-sub">{relDate(a.posted_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recent Files card */}
      <section className="cv-card is-span-2">
        <header className="cv-card-header">
          <div className="cv-card-title"><FileText size={13} /> Recently Uploaded Files</div>
          <button type="button" className="cv-btn-link" onClick={() => onSelectTab("files")}>Browse files →</button>
        </header>
        <div className="cv-card-content cv-grid-2col">
          {recentFiles.length === 0 ? (
            <div className="cv-empty-note">No files available.</div>
          ) : (
            recentFiles.map(f => {
              const name = f.display_name || f.filename || "Untitled";
              return (
                <div key={f.id} className="cv-list-item">
                  <FileTypeIcon name={name} />
                  <div className="cv-list-item-body">
                    <div className="cv-list-item-title" title={name}>{name}</div>
                    <div className="cv-list-item-sub">{formatSize(f.size)} {f.updated_at ? `· ${relDate(f.updated_at)}` : ""}</div>
                  </div>
                  <a href={f.url || f.external_url} download className="cv-btn-icon" title="Download">
                    <Download size={13} />
                  </a>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Main CanvasView ──────────────────────────────────────────────────────────
