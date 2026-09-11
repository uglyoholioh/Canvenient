import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown, ChevronRight, Download, ExternalLink, File, FileText, FileVideo, Folder,
  FolderOpen, Image, Loader2,
  Maximize2, Minimize2, Search, X,
} from "lucide-react";
import { fetchCanvasFileContent, downloadCanvasFile, getCanvasFolders } from "../../api";
import PdfViewer from "../PdfViewer";
import { getFileType, formatSize, relDate } from "./fileUtils";

function resolvePreviewType(file) {
  if (!file) return null;
  const contentType = (file.content_type || "").toLowerCase();
  if (contentType.startsWith("image/")) return "img";
  if (contentType === "application/pdf" || contentType.endsWith("pdf")) return "pdf";
  return getFileType(file.display_name || file.filename || "");
}

export function FileTypeIcon({ name, size = 13 }) {
  const type = getFileType(name);
  const iconMap = {
    pdf: <FileText size={size} />, img: <Image size={size} />,
    vid: <FileVideo size={size} />, doc: <FileText size={size} />,
    zip: <File size={size} />, other: <File size={size} />,
  };
  return <span className={`cv-file-type-icon type-${type}`}>{iconMap[type]}</span>;
}

export function FileBrowser({ token, courseId, allFiles }) {
  const [rawFolders, setRawFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set());
  const [isPdfFocus, setIsPdfFocus] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const previewType = resolvePreviewType(selectedFile);

  const handleDownload = useCallback(async (file) => {
    if (!file || downloadingId) return;
    setDownloadingId(file.id);
    try {
      await downloadCanvasFile(token, file.id, file.display_name || file.filename || "canvas-file");
    } catch (error) {
      window.dispatchEvent(new CustomEvent("canvenient-toast", { detail: { message: error.message || "Download failed." } }));
    } finally {
      setDownloadingId(null);
    }
  }, [downloadingId, token]);

  const selectFile = useCallback((file) => {
    setSelectedFile(file);
    // PDFs open straight into the full-width reading view; the side pane stays
    // for quick peeks at images and other files.
    setIsPdfFocus(Boolean(file) && resolvePreviewType(file) === "pdf");
  }, []);

  // Esc leaves the full-width reading mode.
  useEffect(() => {
    if (!isPdfFocus) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setIsPdfFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPdfFocus]);

  // Image previews go through the content proxy too: mirrored Canvas URLs go
  // stale, so the plain <img src={file.url}> broke after a while.
  useEffect(() => {
    // Reset-then-fetch: clearing the stale preview immediately is intentional.
    if (!selectedFile || previewType !== "img") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale preview immediately on deselection
      setPreviewImageSrc(null);
      return undefined;
    }
    let cancelled = false;
    let objectUrl = null;
    setPreviewImageSrc(null);
    fetchCanvasFileContent(token, selectedFile.id)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewImageSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewImageSrc(selectedFile.url || null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewType, selectedFile, token]);

  useEffect(() => {
    if (!courseId) return;
    let canceled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets per-course view state while the folder tree loads
    setLoading(true);
    setRawFolders([]);
    setSelectedFolderId(null);
    setSelectedFile(null);
    setIsPdfFocus(false);
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

  // Folder id → "ancestor names" so files are findable by the folder they
  // live in, not just by their own filename.
  const folderPaths = useMemo(() => {
    const byId = new Map((rawFolders || []).map((f) => [f.id, f]));
    const paths = new Map();
    const pathFor = (folder) => {
      if (paths.has(folder.id)) return paths.get(folder.id);
      const parent = folder.parent_folder_id ? byId.get(folder.parent_folder_id) : null;
      const path = parent ? `${pathFor(parent)} ${folder.name || ""}` : (folder.name || "");
      paths.set(folder.id, path);
      return path;
    };
    (rawFolders || []).forEach((f) => pathFor(f));
    return paths;
  }, [rawFolders]);

  // Filtered & sorted files
  const displayedFiles = useMemo(() => {
    let list = (allFiles || []).filter(f => selectedFolderId === null || f.folder_id === selectedFolderId);
    if (search.trim()) {
      const q = search.toLowerCase();
      // Search across ALL files if user entered a query!
      list = (allFiles || []).filter(f => {
        if ((f.display_name || f.filename || "").toLowerCase().includes(q)) return true;
        const folderPath = folderPaths.get(f.folder_id);
        return Boolean(folderPath && folderPath.toLowerCase().includes(q));
      });
    }
    if (typeFilter !== "all") {
      list = list.filter(f => getFileType(f.display_name || f.filename || "") === typeFilter);
    }
    return [...list].sort((a,b) => {
      if (sort === "date") return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      if (sort === "size") return (b.size || 0) - (a.size || 0);
      return (a.display_name || a.filename || "").localeCompare(b.display_name || b.filename || "");
    });
  }, [allFiles, selectedFolderId, search, typeFilter, sort, folderPaths]);

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
      <div className={`cv-files-split ${isPdfFocus ? "is-pdf-focus" : ""}`}>
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
                        onClick={() => selectFile(isSelected ? null : file)}
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
                          <button
                            type="button"
                            className="cv-btn-icon"
                            title="Download"
                            onClick={() => handleDownload(file)}
                          >
                            {downloadingId === file.id ? <Loader2 size={13} className="retro-icon-spin" /> : <Download size={13} />}
                          </button>
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
                {previewType === "pdf" && (
                  <button
                    type="button"
                    className="cv-btn-icon"
                    onClick={() => setIsPdfFocus((open) => !open)}
                    title={isPdfFocus ? "Exit full-width reading" : "Read full width"}
                    aria-label={isPdfFocus ? "Exit full-width reading" : "Read full width"}
                  >
                    {isPdfFocus ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  className="cv-btn-icon"
                  title="Download"
                  onClick={() => handleDownload(selectedFile)}
                >
                  {downloadingId === selectedFile.id ? <Loader2 size={13} className="retro-icon-spin" /> : <Download size={13} />}
                </button>
                <a
                  href={selectedFile.external_url || selectedFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="cv-btn-icon"
                  title="Open on Canvas"
                >
                  <ExternalLink size={13} />
                </a>
                <button type="button" className="cv-btn-icon" onClick={() => { setIsPdfFocus(false); selectFile(null); }} title="Close Preview">
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="cv-preview-body">
              {previewType === "pdf" ? (
                <PdfViewer
                  token={token}
                  fileId={selectedFile.id}
                  name={selectedFile.display_name || selectedFile.filename || ""}
                  externalUrl={selectedFile.external_url || selectedFile.url || ""}
                />
              ) : previewType === "img" ? (
                previewImageSrc ? (
                  <img src={previewImageSrc} alt={selectedFile.display_name || selectedFile.filename} />
                ) : (
                  <div className="cv-preview-fallback">
                    <Loader2 className="retro-icon-spin" size={16} />
                    <span>Loading preview…</span>
                  </div>
                )
              ) : (
                <div className="cv-preview-fallback">
                  <FileTypeIcon name={selectedFile.display_name || selectedFile.filename || ""} size={26} />
                  <span>Preview not available directly.</span>
                  <a href={selectedFile.external_url || selectedFile.url} target="_blank" rel="noreferrer" className="cv-link-accent">
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
