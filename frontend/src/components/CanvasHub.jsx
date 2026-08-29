import { useState, useEffect, useCallback } from "react"
import {
  BookOpen,
  Megaphone,
  FolderOpen,
  FileText,
  RefreshCw,
  ExternalLink,
  Download,
  Search,
  ChevronRight,
  Clock,
  CheckCircle2,
  Folder
} from "lucide-react"
import {
  getCanvasAnnouncements,
  getCanvasAssignments,
  loadCachedCanvasFiles,
  syncCanvasFiles,
  getCanvasCourses,
} from "../api"

export default function CanvasHub({ token, currentUser }) {
  const [activeTab, setActiveTab] = useState("announcements") // "announcements" | "assignments" | "files"
  const [announcements, setAnnouncements] = useState([])
  const [assignments, setAssignments] = useState([])
  const [filesData, setFilesData] = useState({ files: [], folders: [] })
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [syncingFiles, setSyncingFiles] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState(null)

  const loadData = useCallback(async (isSilent = false) => {
    if (!token) return
    if (!isSilent) setLoading(true)
    try {
      const [annRes, assRes, filesRes, cRes] = await Promise.allSettled([
        getCanvasAnnouncements(token),
        getCanvasAssignments(token),
        loadCachedCanvasFiles(token),
        getCanvasCourses(token),
      ])

      if (annRes.status === "fulfilled" && Array.isArray(annRes.value)) {
        setAnnouncements(annRes.value)
        localStorage.setItem("canvenient.cache.announcements", JSON.stringify(annRes.value))
      }
      if (assRes.status === "fulfilled" && Array.isArray(assRes.value)) {
        setAssignments(assRes.value)
        localStorage.setItem("canvenient.cache.assignments", JSON.stringify(assRes.value))
      }
      if (filesRes.status === "fulfilled" && filesRes.value) {
        setFilesData(filesRes.value)
        localStorage.setItem("canvenient.cache.canvas_files", JSON.stringify(filesRes.value))
      }
      if (cRes.status === "fulfilled" && Array.isArray(cRes.value)) {
        setCourses(cRes.value)
      }
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    try {
      const cAnn = localStorage.getItem("canvenient.cache.announcements")
      if (cAnn) setAnnouncements(JSON.parse(cAnn))
      const cAss = localStorage.getItem("canvenient.cache.assignments")
      if (cAss) setAssignments(JSON.parse(cAss))
      const cFiles = localStorage.getItem("canvenient.cache.canvas_files")
      if (cFiles) setFilesData(JSON.parse(cFiles))
    } catch {}

    loadData()

    // 5-minute background refresh
    const interval = setInterval(() => {
      loadData(true)
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [loadData])

  const handleSyncFiles = async () => {
    setSyncingFiles(true)
    try {
      const res = await syncCanvasFiles(token)
      if (res && res.files) {
        setFilesData(res)
      } else {
        await loadData(false)
      }
    } catch (err) {
      alert(err.message || "Failed to sync files")
    } finally {
      setSyncingFiles(false)
    }
  }

  // Filtered Announcements
  const filteredAnnouncements = announcements.filter((a) => {
    if (selectedCourse !== "all" && a.course_code !== selectedCourse) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const titleMatch = (a.title || "").toLowerCase().includes(q)
      const bodyMatch = (a.message || "").toLowerCase().includes(q)
      if (!titleMatch && !bodyMatch) return false
    }
    return true
  })

  // Filtered Assignments
  const filteredAssignments = assignments
    .filter((a) => {
      if (selectedCourse !== "all" && a.course_code !== selectedCourse) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!(a.name || "").toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (!a.due_at) return 1
      if (!b.due_at) return -1
      return new Date(a.due_at) - new Date(b.due_at)
    })

  // Filtered Files
  const allFiles = filesData.files || []
  const allFolders = filesData.folders || []
  const filteredFiles = allFiles.filter((f) => {
    if (selectedCourse !== "all" && f.module_code !== selectedCourse) return false
    if (searchQuery) {
      return (f.filename || "").toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  return (
    <div className="canvas-hub-container">
      {/* Header */}
      <header className="page-header flex justify-between items-start">
        <div>
          <span className="hub-eyebrow">CANVAS LMS INTEGRATION</span>
          <h1 className="hub-title">Canvas Hub</h1>
          <p className="text-sm text-muted mt-xs">
            Announcements, assignments, and cached files from Canvas
          </p>
        </div>

        <div className="flex items-center gap-xs">
          <button
            className={`btn btn--subtle ${loading ? "spinning" : ""}`}
            onClick={() => loadData(false)}
            title="Sync all Canvas data"
          >
            <RefreshCw size={14} />
            <span>{loading ? "Syncing..." : "Sync Canvas"}</span>
          </button>
        </div>
      </header>

      {/* Tabs & Controls Toolbar */}
      <div className="canvas-toolbar">
        {/* Navigation Tabs */}
        <div className="canvas-tabs">
          <button
            className={`canvas-tab ${activeTab === "announcements" ? "active" : ""}`}
            onClick={() => setActiveTab("announcements")}
          >
            <Megaphone size={15} />
            <span>Announcements</span>
            <span className="tab-counter">{announcements.length}</span>
          </button>
          <button
            className={`canvas-tab ${activeTab === "assignments" ? "active" : ""}`}
            onClick={() => setActiveTab("assignments")}
          >
            <BookOpen size={15} />
            <span>Assignments</span>
            <span className="tab-counter">{assignments.length}</span>
          </button>
          <button
            className={`canvas-tab ${activeTab === "files" ? "active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            <FolderOpen size={15} />
            <span>Files</span>
            <span className="tab-counter">{allFiles.length}</span>
          </button>
        </div>

        {/* Filter controls */}
        <div className="canvas-filters">
          {/* Module Filter */}
          <select
            className="filter-select"
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
          >
            <option value="all">All Modules</option>
            {courses.map((c) => (
              <option key={c.id || c.course_code} value={c.course_code}>
                {c.course_code}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="filter-search-wrap">
            <Search size={14} className="text-muted" />
            <input
              type="text"
              className="filter-search-input"
              placeholder="Filter by keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Panes */}
      <div className="canvas-content-area">
        {/* TAB 1: ANNOUNCEMENTS */}
        {activeTab === "announcements" && (
          <div className="canvas-announcements-grid">
            {filteredAnnouncements.length === 0 ? (
              <div className="hub-empty-state">
                <Megaphone size={28} className="text-muted" />
                <p>No announcements found.</p>
              </div>
            ) : (
              filteredAnnouncements.map((ann, idx) => (
                <article key={ann.id || idx} className="canvas-ann-card">
                  <div className="flex justify-between items-start mb-xs">
                    <span className="badge-module">{ann.course_code || "Module"}</span>
                    <span className="text-xs text-muted font-mono">
                      {ann.posted_at ? new Date(ann.posted_at).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }) : ""}
                    </span>
                  </div>
                  <h3 className="canvas-ann-title">{ann.title}</h3>
                  <div
                    className="canvas-ann-body"
                    dangerouslySetInnerHTML={{ __html: ann.message || "" }}
                  />
                  {ann.author && (
                    <div className="canvas-ann-author text-xs text-muted mt-sm font-mono">
                      Posted by {ann.author.display_name || "Instructor"}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        )}

        {/* TAB 2: ASSIGNMENTS */}
        {activeTab === "assignments" && (
          <div className="canvas-assignments-list">
            {filteredAssignments.length === 0 ? (
              <div className="hub-empty-state">
                <BookOpen size={28} className="text-muted" />
                <p>No assignments found.</p>
              </div>
            ) : (
              filteredAssignments.map((ass) => {
                const dueDate = ass.due_at ? new Date(ass.due_at) : null
                const isOverdue = dueDate && dueDate < new Date()

                return (
                  <div key={ass.id} className="canvas-assignment-row">
                    <div className="assignment-left">
                      <div className="flex items-center gap-xs">
                        <span className="badge-module text-xs">{ass.course_code || "Canvas"}</span>
                        <h4 className="assignment-name">{ass.name}</h4>
                      </div>
                      {ass.points_possible !== undefined && ass.points_possible !== null && (
                        <span className="text-xs text-muted font-mono">
                          {ass.points_possible} points
                        </span>
                      )}
                    </div>

                    <div className="assignment-right">
                      {dueDate ? (
                        <div className={`assignment-due font-mono ${isOverdue ? "text-error" : ""}`}>
                          <Clock size={12} />
                          <span>
                            {dueDate.toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            {dueDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted font-mono">No due date</span>
                      )}

                      {ass.html_url && (
                        <a
                          href={ass.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon-subtle"
                          title="Open Assignment in Canvas"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* TAB 3: FILES */}
        {activeTab === "files" && (
          <div className="canvas-files-view">
            <div className="files-header-actions flex justify-between items-center mb-md">
              <span className="text-xs text-muted font-mono">
                {filteredFiles.length} files available
              </span>
              <button
                className={`btn btn--secondary btn-sm ${syncingFiles ? "spinning" : ""}`}
                onClick={handleSyncFiles}
                disabled={syncingFiles}
              >
                <RefreshCw size={13} />
                <span>{syncingFiles ? "Syncing Files..." : "Sync Files from Canvas"}</span>
              </button>
            </div>

            {filteredFiles.length === 0 ? (
              <div className="hub-empty-state">
                <FolderOpen size={28} className="text-muted" />
                <p>No files synced yet. Click "Sync Files from Canvas" above.</p>
              </div>
            ) : (
              <div className="canvas-file-table">
                <div className="file-table-head font-mono text-xs text-muted">
                  <span>NAME</span>
                  <span>MODULE</span>
                  <span>SIZE</span>
                  <span>ACTION</span>
                </div>
                <div className="file-table-body">
                  {filteredFiles.map((file) => (
                    <div key={file.id || file.canvas_file_id} className="file-table-row">
                      <div className="file-name-cell">
                        <FileText size={15} className="text-accent" />
                        <span className="file-name-text">{file.filename}</span>
                      </div>
                      <div className="file-module-cell">
                        <span className="badge-module text-xs">{file.module_code}</span>
                      </div>
                      <div className="file-size-cell font-mono text-xs text-muted">
                        {file.size_bytes ? `${Math.round(file.size_bytes / 1024)} KB` : "—"}
                      </div>
                      <div className="file-action-cell">
                        {file.canvas_url && (
                          <a
                            href={file.canvas_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-icon-subtle"
                            title="Download / View"
                          >
                            <Download size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
