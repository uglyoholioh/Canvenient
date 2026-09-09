import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, BookOpen, CheckCircle2, ChevronLeft, ChevronRight,
  Download, ExternalLink, File, FileText, FileVideo, Folder, FolderOpen,
  Image, Loader2, RefreshCw, Link as LinkIcon,
  MessageSquare, HelpCircle, Search, X, Clock, ArrowUpRight,
} from "lucide-react";
import {
  getAcademicModules,
  getCanvasAnnouncements,
  getCanvasAssignments,
  getCanvasCourses,
  getCanvasFiles,
  getCanvasFolders,
  getCanvasGrades,
  syncCanvasAssignments,
  getCanvasCourseModules,
  getCanvasPages,
  getCanvasSyllabus,
  getCanvasCourseNavigation,
} from "../api";
import CanvasDrawer from "./drawers/CanvasDrawer";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";

// ─── Utilities ────────────────────────────────────────────────────────────────

function stripHtml(v = "") {
  const n = document.createElement("div"); n.innerHTML = v; return n.textContent || "";
}

function getFileType(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "pdf";
  if (["png","jpg","jpeg","gif","webp","svg","bmp"].includes(ext)) return "img";
  if (["mp4","mov","avi","webm","mkv"].includes(ext)) return "vid";
  if (["doc","docx","ppt","pptx","xls","xlsx","txt","md"].includes(ext)) return "doc";
  if (["zip","tar","gz","rar","7z"].includes(ext)) return "zip";
  return "other";
}

function FileTypeIcon({ name, size = 13 }) {
  const type = getFileType(name);
  const iconMap = {
    pdf: <FileText size={size} />, img: <Image size={size} />,
    vid: <FileVideo size={size} />, doc: <FileText size={size} />,
    zip: <File size={size} />, other: <File size={size} />,
  };
  return <span className={`cv-file-type-icon type-${type}`}>{iconMap[type]}</span>;
}

function formatSize(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.ceil(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function relDate(str) {
  if (!str) return null;
  const d = new Date(str), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dueLabel(str) {
  if (!str) return "No due date";
  const d = new Date(str), now = new Date();
  const diff = d - now;
  if (diff < 0) return `Past due`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `Due in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days}d`;
  return `Due ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// Build a tree structure from flat folder list
function buildFolderMap(folders) {
  const byId = new Map((folders || []).map(f => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const f of byId.values()) {
    if (f.parent_folder_id && byId.has(f.parent_folder_id)) byId.get(f.parent_folder_id).children.push(f);
    else roots.push(f);
  }
  const sort = arr => arr.sort((a,b) => a.name.localeCompare(b.name));
  const sortDeep = node => { sort(node.children); node.children.forEach(sortDeep); };
  sort(roots); roots.forEach(sortDeep);
  return { byId, roots };
}

function getAncestors(byId, folderId) {
  const chain = []; let cur = byId.get(folderId);
  while (cur) { chain.unshift(cur); cur = byId.get(cur.parent_folder_id); }
  return chain;
}

function SmallActionBtn({ href, download, onClick, title, children }) {
  if (href) return (
    <a href={href} target="_blank" rel="noreferrer" download={download || undefined}
       className="cv-file-action-btn" title={title} onClick={e => e.stopPropagation()}>
      {children}
    </a>
  );
  return <button type="button" className="cv-file-action-btn" title={title} onClick={e => { e.stopPropagation(); onClick?.(); }}>{children}</button>;
}

// ─── Finder-style File Browser ────────────────────────────────────────────────

function FileBrowser({ token, courseId, allFiles }) {
  const [rawFolders, setRawFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");

  useEffect(() => {
    if (!courseId) return;
    let canceled = false;
    setLoading(true); setRawFolders([]); setSelectedFolderId(null); setSelectedFile(null);
    getCanvasFolders(token, courseId)
      .then(data => { if (!canceled) { setRawFolders(data || []); } })
      .catch(() => {})
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [courseId, token]);

  const { byId, roots } = useMemo(() => buildFolderMap(rawFolders), [rawFolders]);

  // Auto-select root folder
  useEffect(() => {
    if (!loading && roots.length > 0 && selectedFolderId === null) {
      setSelectedFolderId(roots[0].id);
    }
  }, [loading, roots, selectedFolderId]);

  const currentFolder = selectedFolderId ? byId.get(selectedFolderId) : null;
  const subfolders = currentFolder ? currentFolder.children : roots;
  const breadcrumbs = selectedFolderId ? getAncestors(byId, selectedFolderId) : [];

  // Recent files: top 8 by updated_at across all folders
  const recentFiles = useMemo(() => {
    if (!allFiles?.length) return [];
    return [...allFiles]
      .filter(f => f.updated_at)
      .sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 8);
  }, [allFiles]);

  // Files in current folder
  const folderFiles = useMemo(() => {
    let list = (allFiles || []).filter(f => f.folder_id === selectedFolderId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => (f.display_name || f.filename || "").toLowerCase().includes(q));
    }
    return [...list].sort((a,b) => {
      if (sort === "date") return new Date(b.updated_at||0) - new Date(a.updated_at||0);
      if (sort === "size") return (b.size||0) - (a.size||0);
      return (a.display_name||a.filename||"").localeCompare(b.display_name||b.filename||"");
    });
  }, [allFiles, selectedFolderId, search, sort]);

  if (loading) return (
    <div style={{ padding: "40px", display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontSize: 12 }}>
      <Loader2 className="retro-icon-spin" size={16} /> Loading files…
    </div>
  );

  if (!allFiles?.length) return <div className="cv-finder-empty">No files found for this course.</div>;

  const previewType = selectedFile ? getFileType(selectedFile.display_name || selectedFile.filename || "") : null;

  return (
    <div className="cv-finder">
      {/* Recent files strip */}
      {recentFiles.length > 0 && (
        <div className="cv-finder-recents">
          <div className="cv-finder-recents-label"><Clock size={10} style={{ display:"inline", marginRight:4 }} />Recently modified</div>
          <div className="cv-finder-recents-list">
            {recentFiles.map(file => {
              const name = file.display_name || file.filename || "Untitled";
              return (
                <button key={file.id} type="button" className="cv-finder-recent-row"
                  onClick={() => setSelectedFile(selectedFile?.id === file.id ? null : file)}>
                  <FileTypeIcon name={name} />
                  <span className="cv-finder-recent-name">{name}</span>
                  <span className="cv-finder-recent-meta">{relDate(file.updated_at)}</span>
                  <span className="cv-finder-recent-actions" onClick={e => e.stopPropagation()}>
                    <SmallActionBtn href={file.url || file.external_url} download title="Download"><Download size={11}/></SmallActionBtn>
                    <SmallActionBtn href={file.external_url || file.url} title="Open in Canvas"><ExternalLink size={11}/></SmallActionBtn>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="cv-finder-breadcrumb">
          <button type="button" className="cv-finder-crumb" onClick={() => { setSelectedFolderId(roots[0]?.id || null); setSearch(""); setSelectedFile(null); }}>
            Files
          </button>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id}>
                <ChevronRight size={10} className="cv-finder-crumb-sep" />
                <button type="button" className={`cv-finder-crumb${isLast ? " is-current" : ""}`}
                  onClick={() => { if (!isLast) { setSelectedFolderId(crumb.id); setSearch(""); setSelectedFile(null); } }}>
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Subfolder cards */}
      {subfolders.length > 0 && (
        <div className="cv-finder-folders">
          {subfolders.map(folder => (
            <button key={folder.id} type="button" className="cv-finder-folder-card"
              onClick={() => { setSelectedFolderId(folder.id); setSearch(""); setSelectedFile(null); }}>
              <Folder size={16} className="cv-finder-folder-icon" />
              <div className="cv-finder-folder-info">
                <div className="cv-finder-folder-name">{folder.name}</div>
                <div className="cv-finder-folder-count">
                  {folder.files_count > 0 ? `${folder.files_count} file${folder.files_count !== 1 ? "s" : ""}` : ""}
                  {folder.files_count > 0 && folder.folders_count > 0 ? " · " : ""}
                  {folder.folders_count > 0 ? `${folder.folders_count} folder${folder.folders_count !== 1 ? "s" : ""}` : ""}
                  {folder.files_count === 0 && folder.folders_count === 0 ? "Empty" : ""}
                </div>
              </div>
              <ChevronRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* File list */}
      <div className="cv-finder-files">
        <div className="cv-finder-files-toolbar">
          <Search size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input className="cv-finder-search" type="text" placeholder="Search files…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <SmallActionBtn onClick={() => setSearch("")} title="Clear"><X size={10}/></SmallActionBtn>}
          <span style={{ width: 1, height: 14, background: "var(--border)" }} />
          {["name","date","size"].map(s => (
            <button key={s} type="button" className={`cv-finder-sort-btn${sort === s ? " is-active" : ""}`}
              onClick={() => setSort(s)}>
              {s === "name" ? "A–Z" : s === "date" ? "Recent" : "Size"}
            </button>
          ))}
        </div>
        {folderFiles.length === 0 ? (
          <div className="cv-finder-empty">{search ? "No files match." : "No files in this folder."}</div>
        ) : folderFiles.map(file => {
          const name = file.display_name || file.filename || "Untitled";
          return (
            <button key={file.id} type="button"
              className={`cv-finder-file-row${selectedFile?.id === file.id ? " is-selected" : ""}`}
              onClick={() => setSelectedFile(selectedFile?.id === file.id ? null : file)}>
              <FileTypeIcon name={name} />
              <span className="cv-finder-file-info">
                <span className="cv-finder-file-name">{name}</span>
                <span className="cv-finder-file-meta">{formatSize(file.size)}{file.updated_at ? ` · ${relDate(file.updated_at)}` : ""}</span>
              </span>
              <span className="cv-finder-file-actions" onClick={e => e.stopPropagation()}>
                <SmallActionBtn href={file.url || file.external_url} download title="Download"><Download size={12}/></SmallActionBtn>
                <SmallActionBtn href={file.external_url || file.url} title="Open in Canvas"><ExternalLink size={12}/></SmallActionBtn>
              </span>
            </button>
          );
        })}
      </div>

      {/* Preview panel (inline below file list) */}
      {selectedFile && (
        <div className="cv-finder-preview">
          <div className="cv-finder-preview-header">
            <FileTypeIcon name={selectedFile.display_name || selectedFile.filename || ""} />
            <span className="cv-finder-preview-name">{selectedFile.display_name || selectedFile.filename}</span>
            <SmallActionBtn href={selectedFile.url || selectedFile.external_url} download title="Download"><Download size={13}/></SmallActionBtn>
            <SmallActionBtn href={selectedFile.external_url || selectedFile.url} title="Open in Canvas"><ExternalLink size={13}/></SmallActionBtn>
            <SmallActionBtn onClick={() => setSelectedFile(null)} title="Close"><X size={13}/></SmallActionBtn>
          </div>
          <div className="cv-finder-preview-body">
            {previewType === "img" ? (
              <img src={selectedFile.url} alt={selectedFile.display_name || selectedFile.filename} />
            ) : previewType === "pdf" ? (
              <iframe src={selectedFile.url} title={selectedFile.display_name || selectedFile.filename} />
            ) : (
              <div className="cv-finder-preview-fallback">
                <FileTypeIcon name={selectedFile.display_name || selectedFile.filename || ""} size={22} />
                <span>No preview for this file type.</span>
                <a href={selectedFile.url || selectedFile.external_url} target="_blank" rel="noreferrer"
                   style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}>
                  Open in Canvas ↗
                </a>
              </div>
            )}
          </div>
          <div className="cv-finder-preview-meta">
            <div className="cv-finder-preview-meta-item"><span>Size</span><span>{formatSize(selectedFile.size)}</span></div>
            {selectedFile.updated_at && <div className="cv-finder-preview-meta-item"><span>Modified</span><span>{new Date(selectedFile.updated_at).toLocaleDateString([], {month:"short",day:"numeric",year:"numeric"})}</span></div>}
            <div className="cv-finder-preview-meta-item"><span>Type</span><span>{(selectedFile.display_name||selectedFile.filename||"").split(".").pop().toUpperCase()||"—"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Course Overview (Home tab) ───────────────────────────────────────────────

function CourseOverview({ courseId, courseName, courseCode, assignments, announcements, files, onSelectTab, onOpenItem }) {
  const now = new Date();
  const upcoming = useMemo(() =>
    assignments
      .filter(a => String(a.course_id) === String(courseId) && !a.has_submitted)
      .filter(a => !a.due_at || new Date(a.due_at) >= now)
      .sort((a,b) => (a.due_at ? new Date(a.due_at) : Infinity) - (b.due_at ? new Date(b.due_at) : Infinity))
      .slice(0, 4),
  [assignments, courseId]);

  const recentAnn = useMemo(() =>
    announcements
      .filter(a => String(a.course_id) === String(courseId))
      .sort((a,b) => new Date(b.posted_at||0) - new Date(a.posted_at||0))
      .slice(0, 3),
  [announcements, courseId]);

  const recentFiles = useMemo(() =>
    [...(files||[])].filter(f=>f.updated_at).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,5),
  [files]);

  return (
    <div className="cv-overview">
      {/* Upcoming assignments */}
      <div className="cv-overview-panel">
        <div className="cv-overview-panel-header">
          <span className="cv-overview-panel-title">Upcoming</span>
          <button type="button" className="cv-overview-panel-link" style={{border:0,background:"transparent",cursor:"pointer"}} onClick={() => onSelectTab("assignments")}>See all →</button>
        </div>
        {upcoming.length === 0
          ? <div className="cv-overview-empty">No upcoming assignments.</div>
          : upcoming.map(a => {
            const due = a.due_at ? new Date(a.due_at) : null;
            const urgentSoon = due && (due - now) < 86400000 * 3;
            return (
              <div key={a.id} className="cv-overview-row" onClick={() => onOpenItem({ ...a, itemType: "assignment" })}>
                <div className="cv-overview-row-body">
                  <div className="cv-overview-row-title">{a.title}</div>
                  <div className="cv-overview-row-meta">{dueLabel(a.due_at)}</div>
                </div>
                {urgentSoon && <span className="cv-overview-row-badge">{dueLabel(a.due_at)}</span>}
                <ExternalLink size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </div>
            );
          })
        }
      </div>

      {/* Recent announcements */}
      <div className="cv-overview-panel">
        <div className="cv-overview-panel-header">
          <span className="cv-overview-panel-title">Announcements</span>
          <button type="button" className="cv-overview-panel-link" style={{border:0,background:"transparent",cursor:"pointer"}} onClick={() => onSelectTab("announcements")}>See all →</button>
        </div>
        {recentAnn.length === 0
          ? <div className="cv-overview-empty">No recent announcements.</div>
          : recentAnn.map(a => (
            <div key={a.id} className="cv-overview-row" onClick={() => onOpenItem({ ...a, itemType: "announcement" })}>
              <div className="cv-overview-row-body">
                <div className="cv-overview-row-title">{a.title}</div>
                <div className="cv-overview-row-meta">{relDate(a.posted_at)}</div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Recent files */}
      <div className="cv-overview-panel is-full">
        <div className="cv-overview-panel-header">
          <span className="cv-overview-panel-title">Recent files</span>
          <button type="button" className="cv-overview-panel-link" style={{border:0,background:"transparent",cursor:"pointer"}} onClick={() => onSelectTab("files")}>Browse all →</button>
        </div>
        {recentFiles.length === 0
          ? <div className="cv-overview-empty">No files available.</div>
          : recentFiles.map(f => {
            const name = f.display_name || f.filename || "Untitled";
            return (
              <div key={f.id} className="cv-overview-row" style={{ cursor: "default" }}>
                <FileTypeIcon name={name} />
                <div className="cv-overview-row-body">
                  <div className="cv-overview-row-title">{name}</div>
                  <div className="cv-overview-row-meta">{formatSize(f.size)}{f.updated_at ? ` · ${relDate(f.updated_at)}` : ""}</div>
                </div>
                <SmallActionBtn href={f.url || f.external_url} download title="Download"><Download size={12}/></SmallActionBtn>
                <SmallActionBtn href={f.external_url || f.url} title="Open"><ExternalLink size={12}/></SmallActionBtn>
              </div>
            );
          })
        }
      </div>

      {/* Open in Canvas link */}
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        <a href={`https://canvas.nus.edu.sg/courses/${courseId}`} target="_blank" rel="noreferrer"
           style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-muted)", fontSize: 11, textDecoration: "none" }}>
          <ArrowUpRight size={12} /> Open full {courseCode} on Canvas
        </a>
      </div>
    </div>
  );
}

// ─── Main CanvasView ──────────────────────────────────────────────────────────

export default function CanvasView({ token }) {
  const [courses, setCourses] = useState([]);
  const [academicModules, setAcademicModules] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades] = useState([]);
  const [files, setFiles] = useState([]);          // current course files
  const [courseModules, setCourseModules] = useState([]);
  const [coursePages, setCoursePages] = useState([]);
  const [courseSyllabus, setCourseSyllabus] = useState(null);

  const [selectedCourseId, setSelectedCourseId] = useState(null); // null = landing
  const [tab, setTab] = useState("home");
  const [navigation, setNavigation] = useState([]);
  const [assignmentFilter, setAssignmentFilter] = useState("upcoming");
  const [activeItem, setActiveItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true); setError("");
    try {
      const [c, a, ann, m] = await Promise.all([
        getCanvasCourses(token, force), getCanvasAssignments(token, force),
        getCanvasAnnouncements(token, force), getAcademicModules(token),
      ]);
      setCourses(c||[]); setAssignments(a||[]); setAnnouncements(ann||[]); setAcademicModules(m||[]);
    } catch (e) { setError(e.message || "Could not load Canvas."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // When course changes, reset per-course data and load navigation
  useEffect(() => {
    if (!selectedCourseId) return;
    setFiles([]); setCourseModules([]); setCoursePages([]); setCourseSyllabus(null);
    let canceled = false;
    setTabLoading(true);
    getCanvasCourseNavigation(token, selectedCourseId).then(nav => {
      if (canceled) return;
      const coreTabs = [
        { id:"home", label:"Overview" }, { id:"announcements", label:"Announcements" },
        { id:"modules", label:"Modules" }, { id:"pages", label:"Pages" },
        { id:"files", label:"Files" }, { id:"assignments", label:"Assignments" },
        { id:"grades", label:"Grades" }, { id:"syllabus", label:"Syllabus" },
      ];
      const finalNav = [...nav];
      const existing = new Set(nav.map(n=>n.id));
      coreTabs.forEach(c => { if (!existing.has(c.id)) finalNav.push(c); });
      // Put home first always
      const homeIdx = finalNav.findIndex(n => n.id === "home");
      if (homeIdx > 0) { const [h] = finalNav.splice(homeIdx, 1); finalNav.unshift(h); }
      setNavigation(finalNav);
      setTab("home");
    }).catch(() => {
      if (!canceled) {
        setNavigation([
          { id:"home", label:"Overview" }, { id:"announcements", label:"Announcements" },
          { id:"modules", label:"Modules" }, { id:"pages", label:"Pages" },
          { id:"files", label:"Files" }, { id:"assignments", label:"Assignments" },
          { id:"grades", label:"Grades" }, { id:"syllabus", label:"Syllabus" },
        ]);
        setTab("home");
      }
    }).finally(() => { if (!canceled) setTabLoading(false); });
    return () => { canceled = true; };
  }, [selectedCourseId, token]);

  // Load files when Files or Overview tab is active
  useEffect(() => {
    if (!selectedCourseId || !["home","files"].includes(tab) || files.length > 0) return;
    let canceled = false;
    getCanvasFiles(token, selectedCourseId)
      .then(data => { if (!canceled) setFiles(data||[]); })
      .catch(() => {});
    return () => { canceled = true; };
  }, [tab, selectedCourseId, token, files.length]);

  // Load grades
  useEffect(() => {
    if (tab !== "grades" || grades.length) return;
    let canceled = false;
    getCanvasGrades(token).then(d => { if (!canceled) setGrades(d); }).catch(() => {});
    return () => { canceled = true; };
  }, [grades.length, tab, token]);

  // Load per-course tabs
  useEffect(() => {
    if (!selectedCourseId) return;
    let canceled = false;
    if (tab === "modules" && courseModules.length === 0) {
      setTabLoading(true);
      getCanvasCourseModules(token, selectedCourseId).then(d => { if (!canceled) setCourseModules(d||[]); }).catch(()=>{}).finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "pages" && coursePages.length === 0) {
      setTabLoading(true);
      getCanvasPages(token, selectedCourseId).then(d => { if (!canceled) setCoursePages(d||[]); }).catch(()=>{}).finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "syllabus" && courseSyllabus === null) {
      setTabLoading(true);
      getCanvasSyllabus(token, selectedCourseId).then(d => { if (!canceled) setCourseSyllabus(d); }).catch(()=>{}).finally(() => { if (!canceled) setTabLoading(false); });
    }
    return () => { canceled = true; };
  }, [tab, selectedCourseId, token, courseModules.length, coursePages.length, courseSyllabus]);

  // Derived: only courses in the user's academic module list
  const displayedCourses = useMemo(() => {
    const codes = academicModules.filter(m => m.is_selected && m.module_code?.trim()).map(m => m.module_code.trim());
    if (!codes.length) return [];
    return courses.filter(c => {
      if (!c.course_code) return false;
      return codes.some(mod => new RegExp(`(?:^|[^a-zA-Z0-9])${mod}(?![a-zA-Z0-9])`, "i").test(c.course_code));
    });
  }, [courses, academicModules]);

  const validCourseIds = useMemo(() => new Set(displayedCourses.map(c => String(c.id))), [displayedCourses]);

  const filteredAssignments = useMemo(() => {
    const list = assignments.filter(item => {
      if (!validCourseIds.has(String(item.course_id))) return false;
      if (selectedCourseId && String(item.course_id) !== String(selectedCourseId)) return false;
      const due = item.due_at ? new Date(item.due_at) : null;
      if (assignmentFilter === "all") return true;
      return assignmentFilter === "upcoming" ? (!due || due >= new Date()) : Boolean(due && due < new Date());
    });
    list.sort((a,b) => {
      if (!a.due_at) return 1; if (!b.due_at) return -1;
      const da = new Date(a.due_at), db = new Date(b.due_at);
      return assignmentFilter === "past" ? db - da : da - db;
    });
    return list;
  }, [assignmentFilter, assignments, selectedCourseId, validCourseIds]);

  const filteredAnnouncements = useMemo(() => {
    return announcements
      .filter(item => {
        if (!validCourseIds.has(String(item.course_id))) return false;
        return !selectedCourseId || String(item.course_id) === String(selectedCourseId);
      })
      .sort((a,b) => new Date(b.posted_at||0) - new Date(a.posted_at||0));
  }, [announcements, selectedCourseId, validCourseIds]);

  const filteredGrades = useMemo(() =>
    grades.filter(item => {
      if (!validCourseIds.has(String(item.course_id))) return false;
      return !selectedCourseId || String(item.course_id) === String(selectedCourseId);
    }), [grades, selectedCourseId, validCourseIds]);

  const courseColors = useMemo(() => new Map(courses.map(c => [c.course_code, c.color])), [courses]);

  const sync = useCallback(async () => {
    setSyncing(true); setError("");
    try {
      await syncCanvasAssignments(token);
      await load(true);
      setGrades([]); setFiles([]); setCourseModules([]); setCoursePages([]); setCourseSyllabus(null);
    } catch (e) { setError(e.message || "Sync failed."); }
    finally { setSyncing(false); }
  }, [load, token]);

  const selectedCourse = courses.find(c => String(c.id) === String(selectedCourseId));

  useWorkspaceToolbar(useMemo(() => ({
    title: "Modules",
    subtitle: selectedCourse ? selectedCourse.course_code : undefined,
  }), [selectedCourse]));

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="cv-page" style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader2 className="retro-icon-spin" size={20} style={{ color: "var(--text-muted)" }} />
    </div>
  );

  // LANDING — no course selected
  if (!selectedCourseId) return (
    <div className="cv-page">
      {error && <div style={{ padding: "12px 24px", color: "var(--error)", fontSize: 12 }}>{error}</div>}
      <div className="cv-landing">
        {displayedCourses.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            No modules configured. Add them in Settings → Academic Modules.
          </div>
        ) : (
          <div className="cv-landing-grid">
            {displayedCourses.map(course => {
              const upcoming = assignments.filter(a =>
                String(a.course_id) === String(course.id) && !a.has_submitted &&
                a.due_at && new Date(a.due_at) >= new Date()
              ).length;
              return (
                <button key={course.id} type="button" className="cv-course-card"
                  style={{ "--module-color": course.color }}
                  onClick={() => setSelectedCourseId(String(course.id))}>
                  <div className="cv-course-card-code">{course.course_code}</div>
                  <div className="cv-course-card-name">{course.name}</div>
                  <div className="cv-course-card-meta">
                    <span className={`cv-course-card-badge${upcoming === 0 ? " is-zero" : ""}`}>
                      {upcoming > 0 ? `${upcoming} due` : "All clear"}
                    </span>
                    <ChevronRight size={13} className="cv-course-card-chevron" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // COURSE VIEW — course selected
  const KNOWN_TABS = ["home","assignments","announcements","grades","files","modules","pages","syllabus"];

  return (
    <div className="cv-page">
      {/* Course header strip */}
      <div className="cv-course-header" style={{ "--module-color": selectedCourse?.color }}>
        <button type="button" className="cv-back-btn" onClick={() => setSelectedCourseId(null)}>
          <ChevronLeft size={14} /> All Modules
        </button>
        <span className="cv-course-header-code">{selectedCourse?.course_code}</span>
        <span className="cv-course-header-name">{selectedCourse?.name}</span>
        <div className="cv-course-header-actions">
          {error && <span style={{ fontSize: 10, color: "var(--error)" }}>{error}</span>}
          <button type="button" className="canvas-sync" onClick={sync} disabled={syncing} style={{ height: 28, fontSize: 10 }}>
            <RefreshCw size={12} className={syncing ? "retro-icon-spin" : ""} />
            {syncing ? "Syncing" : "Sync"}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="cv-tabs-bar">
        {navigation.map(nav => (
          <button key={nav.id} type="button"
            className={`cv-tab-btn${tab === nav.id ? " is-active" : ""}`}
            onClick={() => setTab(nav.id)}>
            {nav.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="cv-content">
        {tabLoading && !["files","home"].includes(tab) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 12, marginBottom: 16 }}>
            <Loader2 className="retro-icon-spin" size={14} /> Loading…
          </div>
        )}

        <section>

          {/* HOME / OVERVIEW */}
          {tab === "home" && (
            <CourseOverview
              courseId={selectedCourseId}
              courseName={selectedCourse?.name}
              courseCode={selectedCourse?.course_code}
              assignments={assignments}
              announcements={filteredAnnouncements}
              files={files}
              onSelectTab={setTab}
              onOpenItem={setActiveItem}
            />
          )}

          {/* ASSIGNMENTS */}
          {tab === "assignments" && (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span className="cv-section-title">Assignments</span>
                <div style={{ display:"flex", gap:3, border:"1px solid var(--border)", borderRadius:5, padding:3 }}>
                  {["upcoming","past","all"].map(v => (
                    <button key={v} type="button"
                      style={{ padding:"3px 10px", borderRadius:4, border:"none", cursor:"pointer", fontSize:11, textTransform:"capitalize",
                        background: assignmentFilter===v ? "var(--surface-hover)" : "transparent",
                        color: assignmentFilter===v ? "var(--text-h)" : "var(--text-muted)" }}
                      onClick={() => setAssignmentFilter(v)}>{v}</button>
                  ))}
                </div>
              </div>
              {filteredAssignments.length === 0
                ? <div className="cv-finder-empty">No assignments in this view.</div>
                : <div className="canvas-item-list">
                  {filteredAssignments.map(item => (
                    <button key={`${item.course_id}-${item.id}`} type="button"
                      style={{ "--module-color": courseColors.get(item.course_code) }}
                      className="canvas-item-row"
                      onClick={() => setActiveItem({ ...item, itemType:"assignment" })}>
                      <span className="canvas-item-icon"><BookOpen size={15}/></span>
                      <span className="canvas-item-copy">
                        <strong>{item.title}</strong>
                        <small>{item.course_code} · {item.due_at ? new Date(item.due_at).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "No due date"}</small>
                      </span>
                      <span className={`canvas-status ${item.has_submitted ? "is-done" : ""}`}>
                        {item.has_submitted && <CheckCircle2 size={12}/>}
                        {item.has_submitted ? "Submitted" : "Not submitted"}
                      </span>
                    </button>
                  ))}
                </div>
              }
            </>
          )}

          {/* ANNOUNCEMENTS */}
          {tab === "announcements" && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">Announcements</span></div>
              {filteredAnnouncements.length === 0
                ? <div className="cv-finder-empty">No recent announcements.</div>
                : <div className="canvas-item-list">
                  {filteredAnnouncements.map(item => (
                    <button key={item.id} type="button"
                      style={{ "--module-color": courseColors.get(item.course_code) }}
                      className="canvas-item-row"
                      onClick={() => setActiveItem({ ...item, itemType:"announcement" })}>
                      <span className="canvas-item-icon"><Bell size={15}/></span>
                      <span className="canvas-item-copy">
                        <strong>{item.title}</strong>
                        <small>{item.course_code} · {item.posted_at ? new Date(item.posted_at).toLocaleDateString() : item.author}</small>
                        <p>{stripHtml(item.body).slice(0,150)}</p>
                      </span>
                    </button>
                  ))}
                </div>
              }
            </>
          )}

          {/* GRADES */}
          {tab === "grades" && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">Grades</span></div>
              {tabLoading ? <div className="cv-finder-empty">Loading grades…</div>
                : filteredGrades.length === 0 ? <div className="cv-finder-empty">No grades available.</div>
                : <div className="grade-course-grid">
                  {filteredGrades.map(course => (
                    <article className="grade-course-card" key={course.course_id}>
                      <header>
                        <div><small>{course.course_code}</small><strong>{course.course_name}</strong></div>
                        <div className="grade-total">
                          <strong>{course.current_score != null ? `${course.current_score}%` : "—"}</strong>
                          <span>{course.current_grade || "No grade"}</span>
                        </div>
                      </header>
                      <div className="grade-assignment-list">
                        {course.assignments.filter(i=>i.score!=null||i.grade).slice(0,12).map(i=>(
                          <div key={i.id}><span>{i.title}</span><strong>{i.grade??`${i.score}/${i.points_possible??"?"}`}</strong></div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              }
            </>
          )}

          {/* FILES */}
          {tab === "files" && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">Files</span></div>
              <FileBrowser token={token} courseId={selectedCourseId} allFiles={files} />
            </>
          )}

          {/* MODULES */}
          {tab === "modules" && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">Modules</span></div>
              {tabLoading ? <div className="cv-finder-empty">Loading…</div>
                : courseModules.length === 0 ? <div className="cv-finder-empty">No modules found.</div>
                : <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                  {courseModules.map(mod => (
                    <div key={mod.id} style={{ border:"1px solid var(--border)", borderRadius:7, overflow:"hidden" }}>
                      <div style={{ padding:"11px 16px", borderBottom:"1px solid var(--border)", background:"var(--surface-muted)" }}>
                        <strong style={{ fontSize:13, fontWeight:600, color:"var(--text-h)" }}>{mod.name}</strong>
                      </div>
                      <div>
                        {mod.items.map(item => {
                          if (item.type === "SubHeader") return (
                            <div key={item.id} style={{ padding:"12px 16px 6px", fontWeight:600, color:"var(--text-muted)", fontSize:11, letterSpacing:"0.04em", textTransform:"uppercase", borderBottom:"1px solid var(--border)" }}>{item.title}</div>
                          );
                          let Icon = LinkIcon;
                          if (item.type==="File") Icon=File;
                          else if (item.type==="Page") Icon=BookOpen;
                          else if (item.type==="Assignment") Icon=CheckCircle2;
                          else if (item.type==="Discussion") Icon=MessageSquare;
                          else if (item.type==="Quiz") Icon=HelpCircle;
                          return (
                            <a key={item.id}
                              href={item.external_url||item.html_url||`https://canvas.nus.edu.sg/courses/${selectedCourseId}/modules/items/${item.id}`}
                              target="_blank" rel="noreferrer"
                              onClick={e => {
                                if (item.type==="Assignment"||item.type==="Page") {
                                  e.preventDefault();
                                  setActiveItem({ ...item, id: item.type==="Assignment"?item.content_id:item.id, itemType:item.type.toLowerCase(), course_id:selectedCourseId });
                                }
                              }}
                              style={{ padding:`9px 16px 9px ${16+(item.indent||0)*18}px`, display:"flex", alignItems:"center", justifyContent:"space-between", color:"var(--text)", textDecoration:"none", borderBottom:"1px solid var(--border)" }}
                              onMouseEnter={e=>e.currentTarget.style.background="var(--surface-hover)"}
                              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ color:"var(--text-muted)" }}><Icon size={13}/></span>
                                <span style={{ fontSize:13 }}>{item.title}</span>
                              </div>
                              {item.completion_requirement?.completed && <CheckCircle2 size={13} style={{ color:"var(--success)" }}/>}
                            </a>
                          );
                        })}
                        {mod.items.length===0&&<div style={{padding:"10px 16px",fontSize:11,color:"var(--text-muted)"}}>Empty module.</div>}
                      </div>
                    </div>
                  ))}
                </div>
              }
            </>
          )}

          {/* PAGES */}
          {tab === "pages" && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">Pages</span></div>
              {tabLoading ? <div className="cv-finder-empty">Loading…</div>
                : coursePages.length === 0 ? <div className="cv-finder-empty">No pages found.</div>
                : <div className="canvas-item-list">
                  {coursePages.map(page => (
                    <a key={page.url} href={`https://canvas.nus.edu.sg/courses/${selectedCourseId}/pages/${page.url}`}
                       target="_blank" rel="noreferrer" className="canvas-item-row" style={{ textDecoration:"none", color:"inherit" }}>
                      <span className="canvas-item-icon"><File size={15}/></span>
                      <span className="canvas-item-copy">
                        <strong>{page.title}</strong>
                        <small>Updated: {new Date(page.updated_at).toLocaleDateString()}</small>
                      </span>
                    </a>
                  ))}
                </div>
              }
            </>
          )}

          {/* SYLLABUS */}
          {tab === "syllabus" && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">Syllabus</span></div>
              {tabLoading ? <div className="cv-finder-empty">Loading…</div>
                : !courseSyllabus?.body ? <div className="cv-finder-empty">No syllabus available.</div>
                : <div className="canvas-syllabus-body" style={{ background:"var(--surface)", padding:"28px 32px", borderRadius:7, border:"1px solid var(--border)" }} dangerouslySetInnerHTML={{ __html:courseSyllabus.body }} />
              }
            </>
          )}

          {/* EXTERNAL TOOL FALLBACK */}
          {!KNOWN_TABS.includes(tab) && (
            <>
              <div style={{ marginBottom:14 }}><span className="cv-section-title">{navigation.find(n=>n.id===tab)?.label||"External Tool"}</span></div>
              <div className="cv-finder-empty" style={{ display:"flex", flexDirection:"column", gap:12, alignItems:"center" }}>
                <span>This section is hosted on Canvas.</span>
                <a href={navigation.find(n=>n.id===tab)?.html_url||`https://canvas.nus.edu.sg/courses/${selectedCourseId}/${tab}`}
                   target="_blank" rel="noreferrer"
                   style={{ display:"inline-flex", alignItems:"center", gap:5, color:"var(--accent)", fontSize:12, textDecoration:"none" }}>
                  <ArrowUpRight size={13} /> Open in Canvas
                </a>
              </div>
            </>
          )}

        </section>
      </div>

      <CanvasDrawer
        key={activeItem ? `${activeItem.itemType}-${activeItem.course_id}-${activeItem.id}` : "empty"}
        item={activeItem} token={token} onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
