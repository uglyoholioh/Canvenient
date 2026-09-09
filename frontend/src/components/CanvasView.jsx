import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, BookOpen, CheckCircle2, ChevronRight, ChevronDown, Download,
  ExternalLink, File, FileText, FileVideo, Folder, FolderOpen,
  Image, Loader2, RefreshCw, Link as LinkIcon,
  MessageSquare, HelpCircle, Search, X, Clock, ArrowUpRight,
  Filter, Eye, Layers, BookMarked, Calendar, CheckSquare
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
  if (!str) return "";
  const d = new Date(str), now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dueLabel(str) {
  if (!str) return "No due date";
  const d = new Date(str), now = new Date();
  const diff = d - now;
  if (diff < 0) return "Past due";
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `Due in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days}d`;
  return `Due ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// ─── Files Browser Component with Tree View ───────────────────────────────────

function FileBrowser({ token, courseId, allFiles }) {
  const [rawFolders, setRawFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set());

  useEffect(() => {
    if (!courseId) return;
    let canceled = false;
    setLoading(true);
    setRawFolders([]);
    setSelectedFolderId(null);
    setSelectedFile(null);
    getCanvasFolders(token, courseId)
      .then(data => {
        if (!canceled) {
          const list = data || [];
          setRawFolders(list);
          // Auto expand root folders
          const rootIds = list.filter(f => !f.parent_folder_id).map(f => f.id);
          setExpandedFolderIds(new Set(rootIds));
          if (list.length > 0) {
            setSelectedFolderId(rootIds[0] || list[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [courseId, token]);

  const toggleFolderExpand = (folderId, e) => {
    e.stopPropagation();
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Build folder hierarchy
  const folderTree = useMemo(() => {
    const map = new Map((rawFolders || []).map(f => [f.id, { ...f, children: [] }]));
    const roots = [];
    for (const f of map.values()) {
      if (f.parent_folder_id && map.has(f.parent_folder_id)) {
        map.get(f.parent_folder_id).children.push(f);
      } else {
        roots.push(f);
      }
    }
    const sortNodes = (nodes) => {
      nodes.sort((a,b) => a.name.localeCompare(b.name));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);
    return roots;
  }, [rawFolders]);

  // Current folder and breadcrumb
  const currentFolder = useMemo(() => {
    return (rawFolders || []).find(f => f.id === selectedFolderId);
  }, [rawFolders, selectedFolderId]);

  const breadcrumbs = useMemo(() => {
    if (!selectedFolderId || !rawFolders.length) return [];
    const map = new Map(rawFolders.map(f => [f.id, f]));
    const crumbs = [];
    let cur = map.get(selectedFolderId);
    while (cur) {
      crumbs.unshift(cur);
      cur = cur.parent_folder_id ? map.get(cur.parent_folder_id) : null;
    }
    return crumbs;
  }, [rawFolders, selectedFolderId]);

  // Filtered & sorted files
  const displayedFiles = useMemo(() => {
    let list = (allFiles || []).filter(f => selectedFolderId === null || f.folder_id === selectedFolderId);
    if (search.trim()) {
      const q = search.toLowerCase();
      // Search across ALL files if user entered a query!
      list = (allFiles || []).filter(f => (f.display_name || f.filename || "").toLowerCase().includes(q));
    }
    if (typeFilter !== "all") {
      list = list.filter(f => getFileType(f.display_name || f.filename || "") === typeFilter);
    }
    return [...list].sort((a,b) => {
      if (sort === "date") return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      if (sort === "size") return (b.size || 0) - (a.size || 0);
      return (a.display_name || a.filename || "").localeCompare(b.display_name || b.filename || "");
    });
  }, [allFiles, selectedFolderId, search, typeFilter, sort]);

  // Render tree node
  const renderFolderNode = (node, depth = 0) => {
    const isExpanded = expandedFolderIds.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className="cv-ftree-item-wrap">
        <div
          className={`cv-ftree-node ${isSelected ? "is-selected" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            setSelectedFolderId(node.id);
            setSearch("");
          }}
        >
          <span
            className={`cv-ftree-arrow ${hasChildren ? "" : "is-empty"}`}
            onClick={(e) => hasChildren && toggleFolderExpand(node.id, e)}
          >
            {hasChildren ? (isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
          </span>
          <span className="cv-ftree-icon">
            {isSelected || isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
          </span>
          <span className="cv-ftree-label">{node.name}</span>
          {node.files_count > 0 && <span className="cv-ftree-count">{node.files_count}</span>}
        </div>
        {hasChildren && isExpanded && (
          <div className="cv-ftree-children">
            {node.children.map(child => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const previewType = selectedFile ? getFileType(selectedFile.display_name || selectedFile.filename || "") : null;

  return (
    <div className="cv-files-container">
      {/* Search & Filter Bar */}
      <div className="cv-files-header-bar">
        <div className="cv-files-search-box">
          <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder={selectedFolderId ? `Search in ${currentFolder?.name || 'folder'} or all files...` : "Search all files..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="cv-btn-icon" onClick={() => setSearch("")} title="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="cv-files-filter-group">
          {["all", "pdf", "doc", "img", "vid", "zip"].map(t => (
            <button
              key={t}
              type="button"
              className={`cv-filter-btn ${typeFilter === t ? "is-active" : ""}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === "all" ? "All types" : t.toUpperCase()}
            </button>
          ))}
          <span className="cv-filter-divider" />
          <select className="cv-sort-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="name">Name (A–Z)</option>
            <option value="date">Recently updated</option>
            <option value="size">File size</option>
          </select>
        </div>
      </div>

      {/* Main Files Layout: Folders Tree (Left) + File List (Right) */}
      <div className="cv-files-split">
        {/* Left Sidebar: Folder Tree */}
        <aside className="cv-files-sidebar">
          <div className="cv-ftree-header">
            <span>Folders</span>
            <button
              type="button"
              className={`cv-btn-link ${selectedFolderId === null ? "is-active" : ""}`}
              onClick={() => setSelectedFolderId(null)}
            >
              All files ({allFiles?.length || 0})
            </button>
          </div>
          <div className="cv-ftree-list">
            {loading ? (
              <div className="cv-loading-state"><Loader2 className="retro-icon-spin" size={13} /> Loading…</div>
            ) : folderTree.length === 0 ? (
              <div className="cv-empty-note">No folders</div>
            ) : (
              folderTree.map(root => renderFolderNode(root, 0))
            )}
          </div>
        </aside>

        {/* Right Pane: Breadcrumb + Files List / Table */}
        <div className="cv-files-main">
          {/* Breadcrumb row */}
          <div className="cv-files-subnav">
            <div className="cv-breadcrumbs">
              <button
                type="button"
                className={`cv-crumb ${selectedFolderId === null ? "is-current" : ""}`}
                onClick={() => { setSelectedFolderId(null); setSearch(""); }}
              >
                All Files
              </button>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight size={10} className="cv-crumb-sep" />
                    <button
                      type="button"
                      className={`cv-crumb ${isLast ? "is-current" : ""}`}
                      onClick={() => { if (!isLast) { setSelectedFolderId(crumb.id); setSearch(""); } }}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <span className="cv-files-count-badge">
              {displayedFiles.length} {displayedFiles.length === 1 ? "item" : "items"}
            </span>
          </div>

          {/* Table of Files */}
          <div className="cv-files-scroll">
            {displayedFiles.length === 0 ? (
              <div className="cv-empty-pane">
                {search ? "No files match your search criteria." : "This folder contains no files."}
              </div>
            ) : (
              <table className="cv-files-table">
                <thead>
                  <tr>
                    <th style={{ width: "55%" }}>Name</th>
                    <th style={{ width: "20%" }}>Date Modified</th>
                    <th style={{ width: "13%" }}>Size</th>
                    <th style={{ width: "12%", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedFiles.map(file => {
                    const name = file.display_name || file.filename || "Untitled";
                    const isSelected = selectedFile?.id === file.id;
                    return (
                      <tr
                        key={file.id}
                        className={`cv-file-row ${isSelected ? "is-selected" : ""}`}
                        onClick={() => setSelectedFile(isSelected ? null : file)}
                      >
                        <td className="cv-file-col-name">
                          <FileTypeIcon name={name} />
                          <span className="cv-file-name-text" title={name}>{name}</span>
                        </td>
                        <td className="cv-file-col-date">
                          {file.updated_at ? relDate(file.updated_at) : "—"}
                        </td>
                        <td className="cv-file-col-size">{formatSize(file.size)}</td>
                        <td className="cv-file-col-actions" onClick={e => e.stopPropagation()}>
                          <a
                            href={file.url || file.external_url}
                            download
                            className="cv-btn-icon"
                            title="Download"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download size={13} />
                          </a>
                          <a
                            href={file.external_url || file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="cv-btn-icon"
                            title="Open on Canvas"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Preview Drawer (if a file is selected) */}
        {selectedFile && (
          <aside className="cv-file-preview-aside">
            <div className="cv-preview-header">
              <span className="cv-preview-title" title={selectedFile.display_name || selectedFile.filename}>
                {selectedFile.display_name || selectedFile.filename}
              </span>
              <div className="cv-preview-actions">
                <a
                  href={selectedFile.url || selectedFile.external_url}
                  download
                  className="cv-btn-icon"
                  title="Download"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={13} />
                </a>
                <a
                  href={selectedFile.external_url || selectedFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="cv-btn-icon"
                  title="Open on Canvas"
                >
                  <ExternalLink size={13} />
                </a>
                <button type="button" className="cv-btn-icon" onClick={() => setSelectedFile(null)} title="Close Preview">
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="cv-preview-body">
              {previewType === "img" ? (
                <img src={selectedFile.url} alt={selectedFile.display_name || selectedFile.filename} />
              ) : previewType === "pdf" ? (
                <iframe src={selectedFile.url} title={selectedFile.display_name || selectedFile.filename} />
              ) : (
                <div className="cv-preview-fallback">
                  <FileTypeIcon name={selectedFile.display_name || selectedFile.filename || ""} size={26} />
                  <span>Preview not available directly.</span>
                  <a href={selectedFile.url || selectedFile.external_url} target="_blank" rel="noreferrer" className="cv-link-accent">
                    Open in Canvas ↗
                  </a>
                </div>
              )}
            </div>
            <div className="cv-preview-meta">
              <div><span>Size:</span> <strong>{formatSize(selectedFile.size)}</strong></div>
              <div><span>Type:</span> <strong>{(selectedFile.display_name || selectedFile.filename || "").split(".").pop().toUpperCase()}</strong></div>
              {selectedFile.updated_at && <div><span>Modified:</span> <strong>{new Date(selectedFile.updated_at).toLocaleDateString()}</strong></div>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Course Overview Component ────────────────────────────────────────────────

function CourseOverview({ courseId, courseName, courseCode, assignments, announcements, files, onSelectTab, onOpenItem }) {
  const now = new Date();
  const upcoming = useMemo(() =>
    assignments
      .filter(a => String(a.course_id) === String(courseId) && !a.has_submitted)
      .filter(a => !a.due_at || new Date(a.due_at) >= now)
      .sort((a,b) => (a.due_at ? new Date(a.due_at) : Infinity) - (b.due_at ? new Date(b.due_at) : Infinity))
      .slice(0, 5),
  [assignments, courseId]);

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
              return (
                <div key={a.id} className="cv-list-item" onClick={() => onOpenItem({ ...a, itemType: "assignment" })}>
                  <span className="cv-list-item-icon"><CheckSquare size={13} /></span>
                  <div className="cv-list-item-body">
                    <div className="cv-list-item-title">{a.title}</div>
                    <div className="cv-list-item-sub">{dueLabel(a.due_at)}</div>
                  </div>
                  {urgent && <span className="cv-badge-urgent">Due soon</span>}
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

export default function CanvasView({ token }) {
  const [courses, setCourses] = useState([]);
  const [academicModules, setAcademicModules] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades] = useState([]);
  const [files, setFiles] = useState([]);
  const [courseModules, setCourseModules] = useState([]);
  const [coursePages, setCoursePages] = useState([]);
  const [courseSyllabus, setCourseSyllabus] = useState(null);

  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [tab, setTab] = useState("overview");
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
        getCanvasCourses(token, force),
        getCanvasAssignments(token, force),
        getCanvasAnnouncements(token, force),
        getAcademicModules(token),
      ]);
      setCourses(c || []);
      setAssignments(a || []);
      setAnnouncements(ann || []);
      setAcademicModules(m || []);
    } catch (e) {
      setError(e.message || "Could not load Canvas data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Derived: courses active for this student
  const displayedCourses = useMemo(() => {
    const codes = academicModules.filter(m => m.is_selected && m.module_code?.trim()).map(m => m.module_code.trim());
    if (!codes.length) return courses || [];
    return (courses || []).filter(c => {
      if (!c.course_code) return false;
      return codes.some(mod => new RegExp(`(?:^|[^a-zA-Z0-9])${mod}(?![a-zA-Z0-9])`, "i").test(c.course_code));
    });
  }, [courses, academicModules]);

  const validCourseIds = useMemo(() => new Set(displayedCourses.map(c => String(c.id))), [displayedCourses]);
  const courseColors = useMemo(() => new Map(courses.map(c => [c.course_code, c.color])), [courses]);

  // If a single course is selected, reset per-course tab data and auto-fetch files/modules
  useEffect(() => {
    setFiles([]);
    setCourseModules([]);
    setCoursePages([]);
    setCourseSyllabus(null);

    if (selectedCourseId === "all") {
      if (["files", "modules", "pages", "syllabus"].includes(tab)) {
        setTab("overview");
      }
      return;
    }

    let canceled = false;
    setTabLoading(true);
    getCanvasFiles(token, selectedCourseId)
      .then(d => { if (!canceled) setFiles(d || []); })
      .catch(() => {})
      .finally(() => { if (!canceled) setTabLoading(false); });

    return () => { canceled = true; };
  }, [selectedCourseId, token]);

  // Fetch modules or pages on tab switch
  useEffect(() => {
    if (selectedCourseId === "all") return;
    let canceled = false;

    if (tab === "modules" && courseModules.length === 0) {
      setTabLoading(true);
      getCanvasCourseModules(token, selectedCourseId)
        .then(d => { if (!canceled) setCourseModules(d || []); })
        .catch(() => {})
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "pages" && coursePages.length === 0) {
      setTabLoading(true);
      getCanvasPages(token, selectedCourseId)
        .then(d => { if (!canceled) setCoursePages(d || []); })
        .catch(() => {})
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "syllabus" && courseSyllabus === null) {
      setTabLoading(true);
      getCanvasSyllabus(token, selectedCourseId)
        .then(d => { if (!canceled) setCourseSyllabus(d); })
        .catch(() => {})
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "grades" && grades.length === 0) {
      setTabLoading(true);
      getCanvasGrades(token)
        .then(d => { if (!canceled) setGrades(d || []); })
        .catch(() => {})
        .finally(() => { if (!canceled) setTabLoading(false); });
    }

    return () => { canceled = true; };
  }, [tab, selectedCourseId, token, courseModules.length, coursePages.length, courseSyllabus, grades.length]);

  // Filtered lists
  const filteredAssignments = useMemo(() => {
    const list = assignments.filter(item => {
      if (selectedCourseId !== "all" && String(item.course_id) !== String(selectedCourseId)) return false;
      if (!validCourseIds.has(String(item.course_id))) return false;
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
  }, [assignments, selectedCourseId, validCourseIds, assignmentFilter]);

  const filteredAnnouncements = useMemo(() => {
    return announcements
      .filter(item => {
        if (selectedCourseId !== "all" && String(item.course_id) !== String(selectedCourseId)) return false;
        return validCourseIds.has(String(item.course_id));
      })
      .sort((a,b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0));
  }, [announcements, selectedCourseId, validCourseIds]);

  const filteredGrades = useMemo(() => {
    return grades.filter(item => {
      if (selectedCourseId !== "all" && String(item.course_id) !== String(selectedCourseId)) return false;
      return validCourseIds.has(String(item.course_id));
    });
  }, [grades, selectedCourseId, validCourseIds]);

  const sync = useCallback(async () => {
    setSyncing(true); setError("");
    try {
      await syncCanvasAssignments(token);
      await load(true);
      setGrades([]); setFiles([]); setCourseModules([]); setCoursePages([]); setCourseSyllabus(null);
    } catch (e) {
      setError(e.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [load, token]);

  const selectedCourse = courses.find(c => String(c.id) === String(selectedCourseId));

  useWorkspaceToolbar(useMemo(() => ({
    title: "Modules",
    subtitle: selectedCourse ? selectedCourse.course_code : "All Modules",
  }), [selectedCourse]));

  if (loading) {
    return (
      <div className="cv-page-loader">
        <Loader2 className="retro-icon-spin" size={20} />
        <span>Syncing Canvas workspace…</span>
      </div>
    );
  }

  // Available tabs depending on context
  const tabs = selectedCourseId === "all" ? [
    { id: "overview", label: "Overview" },
    { id: "assignments", label: "Assignments" },
    { id: "announcements", label: "Announcements" },
    { id: "grades", label: "Grades" },
  ] : [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "modules", label: "Modules" },
    { id: "assignments", label: "Assignments" },
    { id: "announcements", label: "Announcements" },
    { id: "grades", label: "Grades" },
    { id: "pages", label: "Pages" },
    { id: "syllabus", label: "Syllabus" },
  ];

  return (
    <div className="cv-wrapper">
      {/* ── Top Bar: Course Selector Pills + Sync Action ── */}
      <header className="cv-top-bar">
        <div className="cv-course-pills">
          <button
            type="button"
            className={`cv-pill ${selectedCourseId === "all" ? "is-active" : ""}`}
            onClick={() => setSelectedCourseId("all")}
          >
            All Modules
          </button>
          {displayedCourses.map(c => {
            const isSelected = selectedCourseId === String(c.id);
            const dueCount = assignments.filter(a => String(a.course_id) === String(c.id) && !a.has_submitted && a.due_at && new Date(a.due_at) >= new Date()).length;
            return (
              <button
                key={c.id}
                type="button"
                className={`cv-pill ${isSelected ? "is-active" : ""}`}
                style={{ "--module-color": c.color }}
                onClick={() => setSelectedCourseId(String(c.id))}
              >
                <span className="cv-pill-dot" />
                <span className="cv-pill-label">{c.course_code}</span>
                {dueCount > 0 && <span className="cv-pill-badge">{dueCount}</span>}
              </button>
            );
          })}
        </div>
        <div className="cv-top-actions">
          {error && <span className="cv-error-msg">{error}</span>}
          <button type="button" className="cv-sync-btn" onClick={sync} disabled={syncing}>
            <RefreshCw size={12} className={syncing ? "retro-icon-spin" : ""} />
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </header>

      {/* ── Second Bar: Sub-Navigation Tabs ── */}
      <nav className="cv-sub-bar">
        <div className="cv-tab-strip">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              className={`cv-tab-item ${tab === t.id ? "is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {selectedCourse && (
          <a
            href={`https://canvas.nus.edu.sg/courses/${selectedCourse.id}`}
            target="_blank"
            rel="noreferrer"
            className="cv-ext-link"
          >
            <span>Open {selectedCourse.course_code} on Canvas</span>
            <ExternalLink size={11} />
          </a>
        )}
      </nav>

      {/* ── Main View Content Area ── */}
      <main className="cv-view-content">
        {tabLoading && !["files", "overview"].includes(tab) && (
          <div className="cv-view-loading">
            <Loader2 className="retro-icon-spin" size={14} /> Loading content…
          </div>
        )}

        {/* 1. OVERVIEW TAB */}
        {tab === "overview" && (
          selectedCourseId === "all" ? (
            <div className="cv-all-overview">
              <div className="cv-overview-grid">
                {/* Cross-course Assignments */}
                <section className="cv-card">
                  <header className="cv-card-header">
                    <div className="cv-card-title"><Calendar size={13} /> Upcoming Assignments Across All Modules</div>
                    <button type="button" className="cv-btn-link" onClick={() => setTab("assignments")}>View all →</button>
                  </header>
                  <div className="cv-card-content">
                    {filteredAssignments.slice(0, 7).length === 0 ? (
                      <div className="cv-empty-note">All clear! No assignments due.</div>
                    ) : (
                      filteredAssignments.slice(0, 7).map(a => {
                        const due = a.due_at ? new Date(a.due_at) : null;
                        const urgent = due && (due - new Date()) < 86400000 * 3;
                        return (
                          <div
                            key={`${a.course_id}-${a.id}`}
                            className="cv-list-item"
                            onClick={() => { setSelectedCourseId(String(a.course_id)); setActiveItem({ ...a, itemType: "assignment" }); }}
                          >
                            <span className="cv-pill-dot" style={{ backgroundColor: courseColors.get(a.course_code) }} />
                            <div className="cv-list-item-body">
                              <div className="cv-list-item-title">{a.title}</div>
                              <div className="cv-list-item-sub">{a.course_code} · {dueLabel(a.due_at)}</div>
                            </div>
                            {urgent && <span className="cv-badge-urgent">{dueLabel(a.due_at)}</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Cross-course Announcements */}
                <section className="cv-card">
                  <header className="cv-card-header">
                    <div className="cv-card-title"><Bell size={13} /> Latest Announcements</div>
                    <button type="button" className="cv-btn-link" onClick={() => setTab("announcements")}>View all →</button>
                  </header>
                  <div className="cv-card-content">
                    {filteredAnnouncements.slice(0, 7).length === 0 ? (
                      <div className="cv-empty-note">No recent announcements.</div>
                    ) : (
                      filteredAnnouncements.slice(0, 7).map(ann => (
                        <div
                          key={ann.id}
                          className="cv-list-item"
                          onClick={() => { setSelectedCourseId(String(ann.course_id)); setActiveItem({ ...ann, itemType: "announcement" }); }}
                        >
                          <span className="cv-pill-dot" style={{ backgroundColor: courseColors.get(ann.course_code) }} />
                          <div className="cv-list-item-body">
                            <div className="cv-list-item-title">{ann.title}</div>
                            <div className="cv-list-item-sub">{ann.course_code} · {relDate(ann.posted_at)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : (
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
          )
        )}

        {/* 2. FILES TAB */}
        {tab === "files" && selectedCourseId !== "all" && (
          <FileBrowser token={token} courseId={selectedCourseId} allFiles={files} />
        )}

        {/* 3. MODULES TAB */}
        {tab === "modules" && selectedCourseId !== "all" && (
          <div className="cv-modules-view">
            {courseModules.length === 0 ? (
              <div className="cv-empty-note">No Canvas module units found for this course.</div>
            ) : (
              <div className="cv-modules-list">
                {courseModules.map(mod => (
                  <div key={mod.id} className="cv-module-block">
                    <div className="cv-module-block-header">
                      <Layers size={14} />
                      <span>{mod.name}</span>
                    </div>
                    <div className="cv-module-items">
                      {mod.items.map(item => {
                        if (item.type === "SubHeader") {
                          return (
                            <div key={item.id} className="cv-module-subheader">
                              {item.title}
                            </div>
                          );
                        }
                        let Icon = LinkIcon;
                        if (item.type === "File") Icon = File;
                        else if (item.type === "Page") Icon = BookOpen;
                        else if (item.type === "Assignment") Icon = CheckCircle2;
                        else if (item.type === "Discussion") Icon = MessageSquare;
                        else if (item.type === "Quiz") Icon = HelpCircle;

                        return (
                          <a
                            key={item.id}
                            href={item.external_url || item.html_url || `https://canvas.nus.edu.sg/courses/${selectedCourseId}/modules/items/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="cv-module-item-row"
                            style={{ paddingLeft: `${14 + (item.indent || 0) * 16}px` }}
                            onClick={e => {
                              if (item.type === "Assignment" || item.type === "Page") {
                                e.preventDefault();
                                setActiveItem({
                                  ...item,
                                  id: item.type === "Assignment" ? item.content_id : item.id,
                                  itemType: item.type.toLowerCase(),
                                  course_id: selectedCourseId,
                                });
                              }
                            }}
                          >
                            <span className="cv-module-item-icon"><Icon size={13} /></span>
                            <span className="cv-module-item-title">{item.title}</span>
                            {item.completion_requirement?.completed && (
                              <CheckCircle2 size={13} style={{ color: "var(--success)", marginLeft: "auto" }} />
                            )}
                          </a>
                        );
                      })}
                      {mod.items.length === 0 && (
                        <div className="cv-empty-note" style={{ padding: "8px 14px" }}>Empty module section</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. ASSIGNMENTS TAB */}
        {tab === "assignments" && (
          <div className="cv-assignments-view">
            <div className="cv-toolbar-row">
              <span className="cv-toolbar-title">
                {selectedCourse ? `${selectedCourse.course_code} Assignments` : "All Assignments"}
              </span>
              <div className="cv-filter-segmented">
                {["upcoming", "past", "all"].map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`cv-filter-btn ${assignmentFilter === v ? "is-active" : ""}`}
                    onClick={() => setAssignmentFilter(v)}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="cv-empty-pane">No assignments in this filter view.</div>
            ) : (
              <div className="cv-item-rows">
                {filteredAssignments.map(item => (
                  <div
                    key={`${item.course_id}-${item.id}`}
                    className="cv-assignment-row"
                    onClick={() => setActiveItem({ ...item, itemType: "assignment" })}
                  >
                    <span className="cv-pill-dot" style={{ backgroundColor: courseColors.get(item.course_code) }} />
                    <div className="cv-row-body">
                      <div className="cv-row-title">{item.title}</div>
                      <div className="cv-row-sub">
                        {item.course_code} · {item.due_at ? new Date(item.due_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No due date"}
                      </div>
                    </div>
                    <span className={`cv-badge-status ${item.has_submitted ? "is-submitted" : ""}`}>
                      {item.has_submitted ? "Submitted" : "Not submitted"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. ANNOUNCEMENTS TAB */}
        {tab === "announcements" && (
          <div className="cv-announcements-view">
            {filteredAnnouncements.length === 0 ? (
              <div className="cv-empty-pane">No announcements.</div>
            ) : (
              <div className="cv-item-rows">
                {filteredAnnouncements.map(item => (
                  <div
                    key={item.id}
                    className="cv-announcement-row"
                    onClick={() => setActiveItem({ ...item, itemType: "announcement" })}
                  >
                    <div className="cv-row-top">
                      <span className="cv-pill-dot" style={{ backgroundColor: courseColors.get(item.course_code) }} />
                      <strong className="cv-row-title">{item.title}</strong>
                      <span className="cv-row-date">{relDate(item.posted_at)}</span>
                    </div>
                    <div className="cv-row-sub">{item.course_code} {item.author ? `· by ${item.author}` : ""}</div>
                    <p className="cv-announcement-snippet">{stripHtml(item.body).slice(0, 160)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. GRADES TAB */}
        {tab === "grades" && (
          <div className="cv-grades-view">
            {filteredGrades.length === 0 ? (
              <div className="cv-empty-pane">No grade summaries currently available.</div>
            ) : (
              <div className="grade-course-grid">
                {filteredGrades.map(course => (
                  <article className="grade-course-card" key={course.course_id}>
                    <header>
                      <div>
                        <small>{course.course_code}</small>
                        <strong>{course.course_name}</strong>
                      </div>
                      <div className="grade-total">
                        <strong>{course.current_score != null ? `${course.current_score}%` : "—"}</strong>
                        <span>{course.current_grade || "No grade"}</span>
                      </div>
                    </header>
                    <div className="grade-assignment-list">
                      {course.assignments.filter(i => i.score != null || i.grade).slice(0, 12).map(i => (
                        <div key={i.id}>
                          <span>{i.title}</span>
                          <strong>{i.grade ?? `${i.score}/${i.points_possible ?? "?"}`}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 7. PAGES TAB */}
        {tab === "pages" && selectedCourseId !== "all" && (
          <div className="cv-pages-view">
            {coursePages.length === 0 ? (
              <div className="cv-empty-pane">No course pages found.</div>
            ) : (
              <div className="cv-item-rows">
                {coursePages.map(page => (
                  <a
                    key={page.url}
                    href={`https://canvas.nus.edu.sg/courses/${selectedCourseId}/pages/${page.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cv-page-row"
                  >
                    <BookMarked size={14} style={{ color: "var(--text-muted)" }} />
                    <span className="cv-row-title">{page.title}</span>
                    <span className="cv-row-date">{page.updated_at ? relDate(page.updated_at) : ""}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 8. SYLLABUS TAB */}
        {tab === "syllabus" && selectedCourseId !== "all" && (
          <div className="cv-syllabus-view">
            {!courseSyllabus?.body ? (
              <div className="cv-empty-pane">No syllabus content available.</div>
            ) : (
              <div
                className="cv-syllabus-body"
                dangerouslySetInnerHTML={{ __html: courseSyllabus.body }}
              />
            )}
          </div>
        )}
      </main>

      <CanvasDrawer
        key={activeItem ? `${activeItem.itemType}-${activeItem.course_id}-${activeItem.id}` : "empty"}
        item={activeItem}
        token={token}
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
