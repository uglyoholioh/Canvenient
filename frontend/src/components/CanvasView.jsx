import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, BookOpen, CheckCircle2, ChevronRight, Download, ExternalLink,
  File, FileText, FileVideo, Folder, FolderOpen,
  Image, Loader2, RefreshCw, LayoutGrid, Link as LinkIcon,
  MessageSquare, HelpCircle, Search, X,
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

function stripHtml(value = "") {
  const node = document.createElement("div");
  node.innerHTML = value;
  return node.textContent || "";
}

/** Resolve the file type category from a filename */
function getFileType(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "img";
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "vid";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md"].includes(ext)) return "doc";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "zip";
  return "other";
}

function FileTypeIcon({ name }) {
  const type = getFileType(name);
  const iconMap = {
    pdf: <FileText size={13} />,
    img: <Image size={13} />,
    vid: <FileVideo size={13} />,
    doc: <FileText size={13} />,
    zip: <File size={13} />,
    other: <File size={13} />,
  };
  return (
    <span className={`cv-file-type-icon type-${type}`}>
      {iconMap[type]}
    </span>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Build an ordered flat list of folder nodes with depth, from raw folder array */
function buildFolderTree(folders) {
  if (!folders || folders.length === 0) return [];
  const byId = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const f of byId.values()) {
    if (f.parent_folder_id && byId.has(f.parent_folder_id)) {
      byId.get(f.parent_folder_id).children.push(f);
    } else {
      roots.push(f);
    }
  }
  const result = [];
  const walk = (node, depth) => {
    result.push({ ...node, depth });
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach((child) => walk(child, depth + 1));
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach((r) => walk(r, 0));
  return result;
}

/** Compute ancestor chain for a given folder id */
function getFolderAncestors(flatTree, folderId) {
  const byId = new Map(flatTree.map((f) => [f.id, f]));
  const chain = [];
  let current = byId.get(folderId);
  while (current) {
    chain.unshift(current);
    current = byId.get(current.parent_folder_id);
  }
  return chain;
}

// ─── Files Browser Component ─────────────────────────────────────────────────

function FileBrowser({ token, courseId }) {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fileSearch, setFileSearch] = useState("");
  const [fileSort, setFileSort] = useState("name"); // name | date | size
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId || courseId === "all") return;
    let canceled = false;
    setLoading(true);
    setError("");
    setFiles([]);
    setFolders([]);
    setSelectedFolderId(null);
    setSelectedFile(null);

    Promise.all([
      getCanvasFiles(token, courseId),
      getCanvasFolders(token, courseId),
    ])
      .then(([fileData, folderData]) => {
        if (canceled) return;
        setFiles(fileData || []);
        const flatTree = buildFolderTree(folderData || []);
        setFolders(flatTree);
        if (flatTree.length > 0) {
          setSelectedFolderId(flatTree[0].id);
        }
      })
      .catch((err) => {
        if (!canceled) setError(err.message || "Could not load files.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => { canceled = true; };
  }, [courseId, token]);

  const flatTree = folders;

  const breadcrumbs = useMemo(
    () => (selectedFolderId ? getFolderAncestors(flatTree, selectedFolderId) : []),
    [flatTree, selectedFolderId]
  );

  const folderFiles = useMemo(() => {
    let list = files.filter((f) => f.folder_id === selectedFolderId);

    if (fileSearch.trim()) {
      const q = fileSearch.toLowerCase();
      list = list.filter(
        (f) => (f.display_name || f.filename || "").toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      if (fileSort === "date") {
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      }
      if (fileSort === "size") {
        return (b.size || 0) - (a.size || 0);
      }
      return (a.display_name || a.filename || "").localeCompare(
        b.display_name || b.filename || ""
      );
    });

    return list;
  }, [files, selectedFolderId, fileSearch, fileSort]);

  if (loading) {
    return (
      <div className="cv-file-browser" style={{ alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="retro-icon-spin" size={18} />
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>Loading files…</span>
      </div>
    );
  }

  if (error) {
    return <div className="module-error">{error}</div>;
  }

  if (files.length === 0) {
    return <div className="module-empty">No files found for this course.</div>;
  }

  const previewable = selectedFile
    ? getFileType(selectedFile.display_name || selectedFile.filename || "")
    : null;

  return (
    <div className="cv-file-browser">
      {/* Left — folder tree */}
      <nav className="cv-folder-tree" aria-label="Folders">
        <div className="cv-folder-tree-header">
          <Folder size={11} /> Folders
        </div>
        {flatTree.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={`cv-folder-node${selectedFolderId === folder.id ? " is-active" : ""}`}
            onClick={() => {
              setSelectedFolderId(folder.id);
              setSelectedFile(null);
              setFileSearch("");
            }}
          >
            {Array.from({ length: folder.depth }).map((_, i) => (
              <span key={i} className="cv-folder-node-indent" />
            ))}
            <span className="cv-folder-node-icon">
              {selectedFolderId === folder.id ? <FolderOpen size={13} /> : <Folder size={13} />}
            </span>
            <span className="cv-folder-node-label">{folder.name}</span>
            {folder.files_count > 0 && (
              <span className="cv-folder-node-count">{folder.files_count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Middle — file list pane */}
      <div className="cv-file-pane">
        {/* Breadcrumb */}
        {breadcrumbs.length > 0 && (
          <div className="cv-breadcrumb">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight size={10} className="cv-breadcrumb-sep" />}
                  <button
                    type="button"
                    className={`cv-breadcrumb-item${isLast ? " is-current" : ""}`}
                    onClick={() => {
                      if (!isLast) {
                        setSelectedFolderId(crumb.id);
                        setSelectedFile(null);
                      }
                    }}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Toolbar: search + sort */}
        <div className="cv-file-toolbar">
          <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            className="cv-file-search"
            type="text"
            placeholder="Search in folder…"
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
          />
          {fileSearch && (
            <button
              type="button"
              className="cv-file-action-btn"
              onClick={() => setFileSearch("")}
              aria-label="Clear search"
            >
              <X size={11} />
            </button>
          )}
          <span style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />
          {["name", "date", "size"].map((s) => (
            <button
              key={s}
              type="button"
              className={`cv-sort-btn${fileSort === s ? " is-active" : ""}`}
              onClick={() => setFileSort(s)}
            >
              {s === "name" ? "Name" : s === "date" ? "Recent" : "Size"}
            </button>
          ))}
        </div>

        {/* File list */}
        <div className="cv-file-list-wrap">
          {folderFiles.length === 0 ? (
            <div className="cv-file-empty">
              {fileSearch ? "No files match your search." : "This folder is empty."}
            </div>
          ) : (
            folderFiles.map((file) => {
              const name = file.display_name || file.filename || "Untitled";
              const updated = file.updated_at
                ? new Date(file.updated_at).toLocaleDateString([], {
                    month: "short", day: "numeric", year: "numeric",
                  })
                : null;
              return (
                <button
                  key={file.id}
                  type="button"
                  className={`cv-file-row${selectedFile?.id === file.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedFile(selectedFile?.id === file.id ? null : file)}
                >
                  <FileTypeIcon name={name} />
                  <span className="cv-file-info">
                    <span className="cv-file-name">{name}</span>
                    <span className="cv-file-meta">
                      {formatFileSize(file.size)}{updated ? ` · ${updated}` : ""}
                    </span>
                  </span>
                  <span className="cv-file-actions" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={file.url || file.external_url}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="cv-file-action-btn"
                      title="Download"
                    >
                      <Download size={12} />
                    </a>
                    <a
                      href={file.external_url || file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="cv-file-action-btn"
                      title="Open in Canvas"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right — preview panel */}
      {selectedFile && (
        <aside className="cv-file-preview-panel">
          <div className="cv-file-preview-header">
            <span className="cv-file-preview-name">
              {selectedFile.display_name || selectedFile.filename}
            </span>
            <div className="cv-file-preview-actions">
              <a
                href={selectedFile.url || selectedFile.external_url}
                target="_blank"
                rel="noreferrer"
                download
                className="cv-file-action-btn"
                title="Download"
              >
                <Download size={13} />
              </a>
              <a
                href={selectedFile.external_url || selectedFile.url}
                target="_blank"
                rel="noreferrer"
                className="cv-file-action-btn"
                title="Open in Canvas"
              >
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                className="cv-file-action-btn"
                onClick={() => setSelectedFile(null)}
                title="Close preview"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="cv-file-preview-body">
            {previewable === "img" ? (
              <img
                src={selectedFile.url}
                alt={selectedFile.display_name || selectedFile.filename}
              />
            ) : previewable === "pdf" ? (
              <iframe
                src={selectedFile.url}
                title={selectedFile.display_name || selectedFile.filename}
              />
            ) : (
              <div className="cv-file-preview-fallback">
                <FileTypeIcon name={selectedFile.display_name || selectedFile.filename || ""} />
                <span>Preview not available for this file type.</span>
                <a
                  href={selectedFile.url || selectedFile.external_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}
                >
                  Open in Canvas ↗
                </a>
              </div>
            )}
          </div>

          <div className="cv-file-preview-meta">
            <div className="cv-file-preview-meta-row">
              <span>Size</span>
              <span>{formatFileSize(selectedFile.size)}</span>
            </div>
            {selectedFile.updated_at && (
              <div className="cv-file-preview-meta-row">
                <span>Modified</span>
                <span>
                  {new Date(selectedFile.updated_at).toLocaleDateString([], {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </span>
              </div>
            )}
            <div className="cv-file-preview-meta-row">
              <span>Type</span>
              <span>
                {(selectedFile.display_name || selectedFile.filename || "").split(".").pop().toUpperCase() || "—"}
              </span>
            </div>
          </div>
        </aside>
      )}
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

  const [courseModules, setCourseModules] = useState([]);
  const [coursePages, setCoursePages] = useState([]);
  const [courseSyllabus, setCourseSyllabus] = useState(null);

  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [tab, setTab] = useState("assignments");
  const [navigation, setNavigation] = useState([
    { id: "assignments", label: "Assignments" },
    { id: "announcements", label: "Announcements" },
  ]);

  const [assignmentFilter, setAssignmentFilter] = useState("upcoming");
  const [activeItem, setActiveItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      try {
        const [courseData, assignmentData, announcementData, modulesData] = await Promise.all([
          getCanvasCourses(token, force),
          getCanvasAssignments(token, force),
          getCanvasAnnouncements(token, force),
          getAcademicModules(token),
        ]);
        setCourses(courseData || []);
        setAssignments(assignmentData || []);
        setAnnouncements(announcementData || []);
        setAcademicModules(modulesData || []);
      } catch (loadError) {
        setError(loadError.message || "Could not load Canvas.");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setCourseModules([]);
    setCoursePages([]);
    setCourseSyllabus(null);

    if (selectedCourseId === "all") {
      setNavigation([
        { id: "assignments", label: "Assignments" },
        { id: "announcements", label: "Announcements" },
        { id: "grades", label: "Grades" },
      ]);
      setTab("assignments");
      return;
    }

    let canceled = false;
    setTabLoading(true);
    getCanvasCourseNavigation(token, selectedCourseId)
      .then((nav) => {
        if (canceled) return;
        const coreTabs = [
          { id: "home", label: "Home" },
          { id: "announcements", label: "Announcements" },
          { id: "modules", label: "Modules" },
          { id: "pages", label: "Pages" },
          { id: "files", label: "Files" },
          { id: "assignments", label: "Assignments" },
          { id: "grades", label: "Grades" },
          { id: "people", label: "People" },
          { id: "syllabus", label: "Syllabus" },
        ];
        const finalNav = [...nav];
        const existingIds = new Set(nav.map((n) => n.id));
        for (const core of coreTabs) {
          if (!existingIds.has(core.id)) finalNav.push(core);
        }
        setNavigation(finalNav);
        setTab(finalNav[0].id);
      })
      .catch((err) => {
        console.error(err);
        if (!canceled) {
          setNavigation([
            { id: "home", label: "Home" },
            { id: "announcements", label: "Announcements" },
            { id: "modules", label: "Modules" },
            { id: "pages", label: "Pages" },
            { id: "files", label: "Files" },
            { id: "assignments", label: "Assignments" },
            { id: "grades", label: "Grades" },
            { id: "people", label: "People" },
            { id: "syllabus", label: "Syllabus" },
          ]);
          setTab("home");
        }
      })
      .finally(() => { if (!canceled) setTabLoading(false); });

    return () => { canceled = true; };
  }, [selectedCourseId, token]);

  useEffect(() => {
    if (tab !== "grades" || grades.length) return;
    let canceled = false;
    Promise.resolve().then(() => setTabLoading(true));
    getCanvasGrades(token)
      .then((data) => { if (!canceled) setGrades(data); })
      .catch((err) => { if (!canceled) setError(err.message); })
      .finally(() => { if (!canceled) setTabLoading(false); });
    return () => { canceled = true; };
  }, [grades.length, tab, token]);

  useEffect(() => {
    if (selectedCourseId === "all") return;
    let canceled = false;

    if (tab === "modules" && courseModules.length === 0) {
      setTabLoading(true);
      getCanvasCourseModules(token, selectedCourseId)
        .then((data) => { if (!canceled) setCourseModules(data || []); })
        .catch((err) => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "pages" && coursePages.length === 0) {
      setTabLoading(true);
      getCanvasPages(token, selectedCourseId)
        .then((data) => { if (!canceled) setCoursePages(data || []); })
        .catch((err) => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "syllabus" && courseSyllabus === null) {
      setTabLoading(true);
      getCanvasSyllabus(token, selectedCourseId)
        .then((data) => { if (!canceled) setCourseSyllabus(data); })
        .catch((err) => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    }

    return () => { canceled = true; };
  }, [tab, selectedCourseId, token, courseModules.length, coursePages.length, courseSyllabus]);

  const displayedCourses = useMemo(() => {
    const validModules = academicModules
      .filter((m) => m.is_selected && m.module_code && m.module_code.trim() !== "")
      .map((m) => m.module_code.trim());
    if (validModules.length === 0) return [];
    return courses.filter((c) => {
      if (!c.course_code) return false;
      return validModules.some((mod) => {
        const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${mod}(?![a-zA-Z0-9])`, "i");
        return regex.test(c.course_code);
      });
    });
  }, [courses, academicModules]);

  const validCourseIds = useMemo(
    () => new Set(displayedCourses.map((c) => String(c.id))),
    [displayedCourses]
  );

  const filteredAssignments = useMemo(() => {
    const list = assignments.filter((item) => {
      if (!validCourseIds.has(String(item.course_id))) return false;
      if (selectedCourseId !== "all" && String(item.course_id) !== String(selectedCourseId)) return false;
      if (assignmentFilter === "all") return true;
      const due = item.due_at ? new Date(item.due_at) : null;
      return assignmentFilter === "upcoming"
        ? !due || due >= new Date()
        : Boolean(due && due < new Date());
    });
    list.sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      const da = new Date(a.due_at).getTime();
      const db = new Date(b.due_at).getTime();
      return assignmentFilter === "past" ? db - da : da - db;
    });
    return list;
  }, [assignmentFilter, assignments, selectedCourseId, validCourseIds]);

  const filteredAnnouncements = useMemo(() => {
    const list = announcements.filter((item) => {
      if (!validCourseIds.has(String(item.course_id))) return false;
      return selectedCourseId === "all" || String(item.course_id) === String(selectedCourseId);
    });
    list.sort((a, b) => {
      const da = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const db = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return db - da;
    });
    return list;
  }, [announcements, selectedCourseId, validCourseIds]);

  const filteredGrades = useMemo(
    () =>
      grades.filter((item) => {
        if (!validCourseIds.has(String(item.course_id))) return false;
        return selectedCourseId === "all" || String(item.course_id) === String(selectedCourseId);
      }),
    [grades, selectedCourseId, validCourseIds]
  );

  const courseColors = useMemo(
    () => new Map(courses.map((course) => [course.course_code, course.color])),
    [courses]
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    setError("");
    try {
      await syncCanvasAssignments(token);
      await load(true);
      setGrades([]);
      setCourseModules([]);
      setCoursePages([]);
      setCourseSyllabus(null);
    } catch (syncError) {
      setError(syncError.message || "Canvas sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [load, token]);

  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId));
  const toolbarConfig = useMemo(
    () => ({ title: "Modules", subtitle: selectedCourse ? selectedCourse.course_code : "Overview" }),
    [selectedCourse]
  );
  useWorkspaceToolbar(toolbarConfig);

  return (
    <div className="canvas-page" style={{ flexDirection: "row" }}>
      {/* Sidebar — course list */}
      <aside
        className="canvas-sidebar"
        style={{
          width: "280px",
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <strong
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono)",
            }}
          >
            Select Module
          </strong>
        </div>
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
          <button
            type="button"
            className="canvas-item-row"
            style={{
              border: selectedCourseId === "all" ? "1px solid var(--border-focus)" : "1px solid var(--border)",
              background: selectedCourseId === "all" ? "var(--surface-muted)" : "var(--surface)",
              boxShadow: selectedCourseId === "all" ? "var(--shadow-soft)" : "none",
            }}
            onClick={() => setSelectedCourseId("all")}
          >
            <span
              className="canvas-item-icon"
              style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              <LayoutGrid size={15} />
            </span>
            <span className="canvas-item-copy">
              <strong>All Modules</strong>
              <small>Overview</small>
            </span>
          </button>

          <div style={{ margin: "8px 0", borderBottom: "1px solid var(--border)" }} />

          {loading ? (
            <div className="module-empty" style={{ fontSize: "12px", padding: "10px" }}>
              <Loader2 className="retro-icon-spin" size={14} /> Loading...
            </div>
          ) : displayedCourses.length === 0 ? (
            <div className="module-empty" style={{ fontSize: "12px", padding: "10px" }}>
              No modules match your settings. Configure them in Settings.
            </div>
          ) : (
            displayedCourses.map((course) => {
              const upcomingCount = assignments.filter(
                (a) =>
                  String(a.course_id) === String(course.id) &&
                  a.due_at &&
                  new Date(a.due_at) >= new Date() &&
                  !a.has_submitted
              ).length;
              return (
                <button
                  type="button"
                  key={course.id}
                  className="canvas-item-row"
                  style={{
                    "--module-color": course.color,
                    border:
                      selectedCourseId === String(course.id)
                        ? "1px solid var(--module-color, var(--accent))"
                        : "1px solid var(--border)",
                    background:
                      selectedCourseId === String(course.id) ? "var(--surface-muted)" : "var(--surface)",
                    boxShadow:
                      selectedCourseId === String(course.id) ? "var(--shadow-soft)" : "none",
                  }}
                  onClick={() => setSelectedCourseId(String(course.id))}
                >
                  <span className="canvas-item-icon">
                    <BookOpen size={15} />
                  </span>
                  <span className="canvas-item-copy">
                    <strong>{course.course_code}</strong>
                    <small>{course.name}</small>
                  </span>
                  {upcomingCount > 0 && (
                    <span
                      style={{
                        fontSize: "10px",
                        background: "var(--error-bg)",
                        color: "var(--error)",
                        padding: "2px 6px",
                        borderRadius: "10px",
                        fontWeight: "bold",
                      }}
                    >
                      {upcomingCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="canvas-main" style={{ flex: 1, minWidth: 0, padding: "24px 40px", overflowY: "auto" }}>
        <div
          className="canvas-view-header"
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "48px",
            marginBottom: "24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="canvas-tabs">
            {navigation.map((nav) => (
              <button
                key={nav.id}
                type="button"
                className={tab === nav.id ? "is-active" : ""}
                onClick={() => setTab(nav.id)}
              >
                {nav.label}
              </button>
            ))}
          </div>
          <button type="button" className="canvas-sync" onClick={sync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "retro-icon-spin" : ""} />
            {syncing ? "Syncing" : "Sync"}
          </button>
        </div>

        <div className="canvas-content" style={{ maxWidth: "960px", margin: "0 auto", width: "100%" }}>
          {error && <div className="module-error">{error}</div>}

          {loading ? (
            <div className="canvas-loading">
              <Loader2 className="retro-icon-spin" />
              Loading Content...
            </div>
          ) : (
            <>
              {/* ASSIGNMENTS */}
              {tab === "assignments" && (
                <section>
                  <div
                    className="canvas-content-toolbar"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}
                  >
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>
                      Assignments
                    </h2>
                    <div
                      style={{
                        display: "flex",
                        gap: "4px",
                        background: "var(--surface)",
                        padding: "4px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {["upcoming", "past", "all"].map((value) => (
                        <button
                          type="button"
                          key={value}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "4px",
                            background: assignmentFilter === value ? "var(--surface-hover)" : "transparent",
                            color: assignmentFilter === value ? "var(--text-h)" : "var(--text-muted)",
                            fontSize: "12px",
                            border: "none",
                            cursor: "pointer",
                            textTransform: "capitalize",
                          }}
                          onClick={() => setAssignmentFilter(value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredAssignments.length === 0 ? (
                    <div className="module-empty">No assignments in this view.</div>
                  ) : (
                    <div className="canvas-item-list">
                      {filteredAssignments.map((item) => (
                        <button
                          type="button"
                          key={`${item.course_id}-${item.id}`}
                          style={{ "--module-color": courseColors.get(item.course_code) }}
                          className="canvas-item-row"
                          onClick={() => setActiveItem({ ...item, itemType: "assignment" })}
                        >
                          <span className="canvas-item-icon"><BookOpen size={15} /></span>
                          <span className="canvas-item-copy">
                            <strong>{item.title}</strong>
                            <small>
                              {item.course_code} ·{" "}
                              {item.due_at
                                ? new Date(item.due_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                                : "No due date"}
                            </small>
                          </span>
                          <span className={`canvas-status ${item.has_submitted ? "is-done" : ""}`}>
                            {item.has_submitted && <CheckCircle2 size={12} />}
                            {item.has_submitted ? "Submitted" : "Not submitted"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ANNOUNCEMENTS */}
              {tab === "announcements" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>Announcements</h2>
                  </div>
                  {filteredAnnouncements.length === 0 ? (
                    <div className="module-empty">No recent announcements.</div>
                  ) : (
                    <div className="canvas-item-list">
                      {filteredAnnouncements.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          style={{ "--module-color": courseColors.get(item.course_code) }}
                          className="canvas-item-row"
                          onClick={() => setActiveItem({ ...item, itemType: "announcement" })}
                        >
                          <span className="canvas-item-icon"><Bell size={15} /></span>
                          <span className="canvas-item-copy">
                            <strong>{item.title}</strong>
                            <small>
                              {item.course_code} · {item.posted_at ? new Date(item.posted_at).toLocaleDateString() : item.author}
                            </small>
                            <p>{stripHtml(item.body).slice(0, 150)}</p>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* GRADES */}
              {tab === "grades" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>Grades</h2>
                  </div>
                  {tabLoading ? (
                    <div className="module-empty">Loading grades…</div>
                  ) : filteredGrades.length === 0 ? (
                    <div className="module-empty">No grades available.</div>
                  ) : (
                    <div className="grade-course-grid">
                      {filteredGrades.map((course) => (
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
                            {course.assignments
                              .filter((item) => item.score != null || item.grade)
                              .slice(0, 12)
                              .map((item) => (
                                <div key={item.id}>
                                  <span>{item.title}</span>
                                  <strong>{item.grade ?? `${item.score}/${item.points_possible ?? "?"}`}</strong>
                                </div>
                              ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* FILES — folder tree browser */}
              {tab === "files" && selectedCourseId !== "all" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "16px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>Files</h2>
                  </div>
                  <FileBrowser token={token} courseId={selectedCourseId} />
                </section>
              )}

              {/* MODULES */}
              {tab === "modules" && selectedCourseId !== "all" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>Modules</h2>
                  </div>
                  {tabLoading ? (
                    <div className="module-empty">Loading modules…</div>
                  ) : courseModules.length === 0 ? (
                    <div className="module-empty">No modules found for this course.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      {courseModules.map((mod) => (
                        <div
                          key={mod.id}
                          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}
                        >
                          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-muted)" }}>
                            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "var(--text-h)" }}>{mod.name}</h3>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {mod.items.map((item) => {
                              if (item.type === "SubHeader") {
                                return (
                                  <div key={item.id} style={{ padding: "16px 16px 8px 16px", display: "flex", alignItems: "center", fontWeight: "bold", color: "var(--text-h)", fontSize: "13px", borderBottom: "1px solid var(--border)" }}>
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
                              const isCompleted = item.completion_requirement?.completed;
                              return (
                                <a
                                  key={item.id}
                                  href={item.external_url || item.html_url || `https://canvas.nus.edu.sg/courses/${selectedCourseId}/modules/items/${item.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => {
                                    if (item.type === "Assignment" || item.type === "Page") {
                                      e.preventDefault();
                                      setActiveItem({ ...item, id: item.type === "Assignment" ? item.content_id : item.id, itemType: item.type.toLowerCase(), course_id: selectedCourseId });
                                    }
                                  }}
                                  style={{ padding: `10px 16px 10px ${16 + (item.indent || 0) * 20}px`, display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text)", textDecoration: "none", borderBottom: "1px solid var(--border)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-muted)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    <span style={{ color: "var(--text-muted)" }}><Icon size={14} /></span>
                                    <span style={{ fontSize: "14px" }}>{item.title}</span>
                                  </div>
                                  {isCompleted && (
                                    <span style={{ color: "var(--success)", display: "flex", alignItems: "center" }} title="Completed">
                                      <CheckCircle2 size={14} />
                                    </span>
                                  )}
                                </a>
                              );
                            })}
                            {mod.items.length === 0 && (
                              <div style={{ padding: "10px 16px", fontSize: "12px", color: "var(--text-muted)" }}>Empty module.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* PAGES */}
              {tab === "pages" && selectedCourseId !== "all" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>Pages</h2>
                  </div>
                  {tabLoading ? (
                    <div className="module-empty">Loading pages…</div>
                  ) : coursePages.length === 0 ? (
                    <div className="module-empty">No pages found.</div>
                  ) : (
                    <div className="canvas-item-list">
                      {coursePages.map((page) => (
                        <a
                          key={page.url}
                          href={`https://canvas.nus.edu.sg/courses/${selectedCourseId}/pages/${page.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="canvas-item-row"
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <span className="canvas-item-icon"><File size={15} /></span>
                          <span className="canvas-item-copy">
                            <strong>{page.title}</strong>
                            <small>Updated: {new Date(page.updated_at).toLocaleDateString()}</small>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* SYLLABUS */}
              {tab === "syllabus" && selectedCourseId !== "all" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>Syllabus</h2>
                  </div>
                  {tabLoading ? (
                    <div className="module-empty">Loading syllabus…</div>
                  ) : !courseSyllabus?.body ? (
                    <div className="module-empty">No syllabus content available.</div>
                  ) : (
                    <div
                      className="canvas-syllabus-body"
                      style={{ background: "var(--surface)", padding: "32px", borderRadius: "6px", border: "1px solid var(--border)" }}
                      dangerouslySetInnerHTML={{ __html: courseSyllabus.body }}
                    />
                  )}
                </section>
              )}

              {/* EXTERNAL TOOL FALLBACK */}
              {!["assignments", "announcements", "grades", "files", "modules", "pages", "syllabus"].includes(tab) && selectedCourseId !== "all" && (
                <section>
                  <div className="canvas-content-toolbar" style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)" }}>
                      {navigation.find((n) => n.id === tab)?.label || "External Tool"}
                    </h2>
                  </div>
                  <div className="module-empty" style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
                    <p>This content is hosted outside of Canvenient.</p>
                    <a
                      href={
                        navigation.find((n) => n.id === tab)?.html_url ||
                        (tab === "home"
                          ? `https://canvas.nus.edu.sg/courses/${selectedCourseId}`
                          : tab === "people"
                          ? `https://canvas.nus.edu.sg/courses/${selectedCourseId}/users`
                          : `https://canvas.nus.edu.sg/courses/${selectedCourseId}/${tab}`)
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="retro-btn"
                      style={{ padding: "8px 16px", borderRadius: "4px", background: "var(--accent)", color: "#fff", textDecoration: "none", fontWeight: "bold" }}
                    >
                      Open in Canvas
                    </a>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
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
