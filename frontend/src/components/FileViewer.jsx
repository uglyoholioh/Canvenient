import { useEffect, useMemo, useState } from "react"
import {
  Clock3,
  Download,
  Eye,
  FolderOpen,
  RefreshCw,
  Search,
} from "lucide-react"
import { loadCachedCanvasFiles, syncCanvasFiles } from "../api"

const RECENT_FILES_KEY = "canvenient-recent-files"

function getFileType(file) {
  const filename = file.filename || file.display_name || ""
  const extension = filename.split(".").pop()?.toLowerCase()

  if (["pdf"].includes(extension)) return "PDF"
  if (["doc", "docx"].includes(extension)) return "DOC"
  if (["ppt", "pptx"].includes(extension)) return "PPT"
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return "IMG"
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "ZIP"
  if (["xls", "xlsx", "csv"].includes(extension)) return "XLS"
  return extension?.slice(0, 3).toUpperCase() || "FILE"
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return "Unknown size"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(dateStr) {
  if (!dateStr) return "No date"

  return new Date(dateStr).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function FileViewer({ token, currentUser }) {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState("all")
  const [files, setFiles] = useState([])
  const [fileSearch, setFileSearch] = useState("")
  const [fileType, setFileType] = useState("all")
  const [sortOrder, setSortOrder] = useState("newest")
  const [view, setView] = useState("all")
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [syncingFiles, setSyncingFiles] = useState(false)
  const [syncedAt, setSyncedAt] = useState(null)
  const [fileError, setFileError] = useState("")
  const [recentFileIds, setRecentFileIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || "[]")
    } catch {
      return []
    }
  })

  useEffect(() => {
    let cancelled = false

    async function loadCachedFiles() {
      if (!token || !currentUser?.canvas_token) {
        setCourses([])
        setFiles([])
        return
      }

      setLoadingFiles(true)
      setFileError("")

      try {
        const data = await loadCachedCanvasFiles(token, {
          onSyncRequired: () => {
            if (!cancelled) setSyncingFiles(true)
          },
        })
        if (!cancelled) {
          setCourses(data.courses || [])
          setFiles(data.files || [])
          setSyncedAt(data.synced_at || null)
        }
      } catch (err) {
        if (!cancelled) setFileError(err.message || "Failed to load cached files.")
      } finally {
        if (!cancelled) {
          setLoadingFiles(false)
          setSyncingFiles(false)
        }
      }
    }

    loadCachedFiles()
    return () => { cancelled = true }
  }, [token, currentUser?.canvas_token])

  async function handleCanvasSync() {
    setSyncingFiles(true)
    setFileError("")

    try {
      const data = await syncCanvasFiles(token)
      const nextCourses = data.courses || []
      setCourses(nextCourses)
      setFiles(data.files || [])
      setSyncedAt(data.synced_at || null)
      setSelectedCourseId((currentId) =>
        currentId === "all" || nextCourses.some((course) => String(course.id) === currentId)
          ? currentId
          : "all",
      )
    } catch (err) {
      setFileError(err.message || "Canvas file sync failed.")
    } finally {
      setSyncingFiles(false)
    }
  }

  const availableTypes = useMemo(
    () => [...new Set(files.map(getFileType))].sort(),
    [files],
  )

  const displayedFiles = useMemo(() => {
    const normalizedSearch = fileSearch.trim().toLowerCase()
    const recentIds = new Set(recentFileIds.map(String))
    const nextFiles = files.filter((file) => {
      const matchesSearch = !normalizedSearch ||
        `${file.display_name || ""} ${file.filename || ""} ${file.courseCode || ""}`
          .toLowerCase()
          .includes(normalizedSearch)
      const matchesType = fileType === "all" || getFileType(file) === fileType
      const matchesView = view === "all" || recentIds.has(String(file.id))
      const matchesCourse = selectedCourseId === "all" || String(file.courseId) === selectedCourseId
      return matchesSearch && matchesType && matchesView && matchesCourse
    })

    return nextFiles.sort((a, b) => {
      if (sortOrder === "name") {
        return (a.display_name || "").localeCompare(b.display_name || "")
      }

      const difference = new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      return sortOrder === "oldest" ? -difference : difference
    })
  }, [fileSearch, fileType, files, recentFileIds, selectedCourseId, sortOrder, view])

  function markAsAccessed(fileId) {
    setRecentFileIds((currentIds) => {
      const nextIds = [String(fileId), ...currentIds.filter((id) => String(id) !== String(fileId))].slice(0, 30)
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(nextIds))
      return nextIds
    })
  }

  const emptyMessage = view === "recent"
    ? "Files you preview or download will appear here."
    : fileSearch || fileType !== "all"
      ? "No files match these filters."
      : files.length === 0
        ? "No cached files yet. Sync Canvas to load your course files."
        : "No files found for this course."

  const syncLabel = syncedAt
    ? `Last synced ${formatDate(syncedAt)}`
    : "Not synced yet"

  return (
    <div className="dashboard-layout file-viewer-page">
      <header className="file-viewer-heading">
        <div>
          <h1>Course Files</h1>
          <p>Find and open files synced from your Canvas courses.</p>
        </div>
        {currentUser?.canvas_token && (
          <button
            type="button"
            className="btn btn--primary file-sync-button"
            onClick={handleCanvasSync}
            disabled={syncingFiles || loadingFiles}
          >
            <RefreshCw size={15} className={syncingFiles ? "spin" : ""} />
            {syncingFiles ? "Syncing..." : "Sync Canvas"}
          </button>
        )}
      </header>

      {!currentUser?.canvas_token ? (
        <section className="connect-canvas-card file-viewer-state">
          <FolderOpen size={28} />
          <h2>Connect Canvas Account</h2>
          <p>Add your Canvas API token to browse files from your courses.</p>
        </section>
      ) : loadingFiles ? (
        <div className="canvas-loading file-viewer-state">
          <RefreshCw size={24} className="spin" />
          <span>{syncingFiles ? "Syncing your Canvas files for the first time..." : "Loading saved course files..."}</span>
        </div>
      ) : (
        <main className="file-browser">
          <div className="file-view-tabs" aria-label="File views">
            <button
              type="button"
              className={view === "all" ? "active" : ""}
              onClick={() => setView("all")}
            >
              <FolderOpen size={16} /> All Files
            </button>
            <button
              type="button"
              className={view === "recent" ? "active" : ""}
              onClick={() => setView("recent")}
            >
              <Clock3 size={16} /> Recently Accessed
            </button>
          </div>

          <div className="course-filter-list" aria-label="Filter files by course">
            <button
              type="button"
              className={selectedCourseId === "all" ? "active" : ""}
              onClick={() => setSelectedCourseId("all")}
            >
              All Courses
            </button>
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={String(course.id) === selectedCourseId ? "active" : ""}
                onClick={() => setSelectedCourseId(String(course.id))}
                title={course.name}
              >
                {course.course_code || course.name}
              </button>
            ))}
          </div>

          <div className="file-controls">
            <label className="file-search-field">
              <Search size={17} />
              <input
                type="search"
                value={fileSearch}
                onChange={(event) => setFileSearch(event.target.value)}
                placeholder="Search files by name or course..."
                aria-label="Search files"
              />
            </label>

            <div className="file-selects">
              <select value={fileType} onChange={(event) => setFileType(event.target.value)} aria-label="File type">
                <option value="all">All Types</option>
                {availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort files">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
              </select>
            </div>

            <span className="file-sync-status">
              <RefreshCw size={13} className={syncingFiles ? "spin" : ""} /> {syncingFiles ? "Syncing in background..." : syncLabel}
            </span>
          </div>

          {fileError && files.length > 0 && (
            <p className="file-sync-error">{fileError} Showing your last saved files.</p>
          )}

          {fileError && files.length === 0 ? (
            <div className="canvas-error-state file-viewer-state"><p>{fileError}</p></div>
          ) : displayedFiles.length === 0 ? (
            <div className="canvas-empty-state file-viewer-state">
              <p>{emptyMessage}</p>
              {files.length === 0 && (
                <button type="button" className="btn btn--primary" onClick={handleCanvasSync} disabled={syncingFiles}>
                  <RefreshCw size={15} className={syncingFiles ? "spin" : ""} />
                  {syncingFiles ? "Syncing..." : "Sync Canvas"}
                </button>
              )}
            </div>
          ) : (
            <div className="file-card-grid">
              {displayedFiles.map((file) => {
                const type = getFileType(file)
                return (
                  <article className="file-card" key={`${file.courseId}-${file.id}`}>
                    <div className={`file-type-badge file-type-${type.toLowerCase()}`}>{type}</div>
                    <div className="file-card-content">
                      <h2 title={file.display_name}>{file.display_name || file.filename}</h2>
                      <p>{file.courseCode}</p>
                      <div className="file-card-meta">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{formatDate(file.updated_at)}</span>
                      </div>
                      <div className="file-card-actions">
                        <a
                          href={file.external_url || file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markAsAccessed(file.id)}
                        >
                          <Eye size={14} /> Preview
                        </a>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          onClick={() => markAsAccessed(file.id)}
                        >
                          <Download size={14} /> Download
                        </a>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      )}
    </div>
  )
}

export default FileViewer
