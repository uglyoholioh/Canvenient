import { useEffect, useState } from "react"
import { BookOpen, FileText, RefreshCw, Search } from "lucide-react"
import { getCanvasCourses, getCanvasFiles } from "../api"

function FileViewer({ token, currentUser }) {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState("")
  const [files, setFiles] = useState([])
  const [fileSearch, setFileSearch] = useState("")
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [courseError, setCourseError] = useState("")
  const [fileError, setFileError] = useState("")

  useEffect(() => {
    async function loadCourses() {
      if (!token || !currentUser?.canvas_token) {
        setCourses([])
        setSelectedCourseId("")
        return
      }

      setLoadingCourses(true)
      setCourseError("")

      try {
        const coursesData = await getCanvasCourses(token)
        const nextCourses = coursesData || []
        setCourses(nextCourses)
        setSelectedCourseId((currentCourseId) => {
          if (nextCourses.some((course) => String(course.id) === currentCourseId)) {
            return currentCourseId
          }

          return nextCourses[0]?.id ? String(nextCourses[0].id) : ""
        })
      } catch (err) {
        setCourseError(err.message || "Failed to load Canvas courses.")
      } finally {
        setLoadingCourses(false)
      }
    }

    loadCourses()
  }, [token, currentUser?.canvas_token])

  useEffect(() => {
    async function loadFiles() {
      if (!token || !selectedCourseId) {
        setFiles([])
        return
      }

      setLoadingFiles(true)
      setFileError("")
      setFileSearch("")

      try {
        const filesData = await getCanvasFiles(token, selectedCourseId)
        setFiles(filesData || [])
      } catch (err) {
        setFileError(err.message || "Failed to load Canvas files.")
      } finally {
        setLoadingFiles(false)
      }
    }

    loadFiles()
  }, [token, selectedCourseId])

  const selectedCourse = courses.find((course) => String(course.id) === selectedCourseId)
  const normalizedSearch = fileSearch.trim().toLowerCase()
  const displayedFiles = files.filter((file) => {
    if (!normalizedSearch) {
      return true
    }

    return `${file.display_name || ""} ${file.filename || ""}`
      .toLowerCase()
      .includes(normalizedSearch)
  })

  function formatFileSize(size) {
    if (!Number.isFinite(size)) {
      return "Unknown size"
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`
    }

    return `${(size / 1024 / 1024).toFixed(2)} MB`
  }

  function formatDate(dateStr) {
    if (!dateStr) {
      return "No update date"
    }

    return new Date(dateStr).toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <div className="dashboard-layout">
        <header className="dashboard-header">
            <h1>File Viewer</h1>
        </header>

        <main className="card">
            <div className="card-header">
                <h3>Canvas Files</h3>
                <span className="badge badge-progress">In Progress</span>
            </div>

            {!currentUser?.canvas_token ? (
                <div className="connect-canvas-card">
                    <h4>Connect Canvas Account</h4>
                    <p>Add your Canvas API token to browse files from your courses.</p>
                </div>
            ) : loadingCourses ? (
                <div className="canvas-loading">
                    <RefreshCw size={24} className="spin" />
                    <span>Loading Canvas courses...</span>
                </div>
            ) : courseError ? (
                <div className="canvas-error-state">
                    <p>{courseError}</p>
                </div>
            ) : courses.length === 0 ? (
                <div className="canvas-empty-state">
                    <p>No active Canvas courses found.</p>
                </div>
            ) : (
                <div className="file-viewer-grid">
                    <aside className="file-viewer-sidebar">
                        <div className="panel-header">
                            <h2>Courses</h2>
                            <p className="panel-subtitle">Choose a course to browse its files.</p>
                        </div>
                        <div className="course-list">
                            {courses.map((course) => {
                                const isSelected = String(course.id) === selectedCourseId

                                return (
                                    <button
                                      key={course.id}
                                      type="button"
                                      aria-pressed={isSelected}
                                      className={`course-item course-select-item ${isSelected ? "active" : ""}`}
                                      onClick={() => setSelectedCourseId(String(course.id))}
                                    >
                                        <div className="course-info">
                                            <span className="course-code">{course.course_code}</span>
                                            <span className="course-name">{course.name}</span>
                                        </div>
                                        <BookOpen size={18} />
                                    </button>
                                )
                            })}
                        </div>
                    </aside>

                    <section className="file-viewer-main">
                        <div className="file-viewer-toolbar">
                            <div>
                                <h2>{selectedCourse?.course_code || "Course files"}</h2>
                                <p className="panel-subtitle">{selectedCourse?.name || "Select a course to view files."}</p>
                            </div>

                            <label className="file-search-field">
                                <Search size={16} />
                                <input
                                  type="search"
                                  value={fileSearch}
                                  onChange={(event) => setFileSearch(event.target.value)}
                                  placeholder="Search files"
                                  disabled={loadingFiles || files.length === 0}
                                />
                            </label>
                        </div>

                        {loadingFiles ? (
                            <div className="canvas-loading">
                                <RefreshCw size={24} className="spin" />
                                <span>Loading course files...</span>
                            </div>
                        ) : fileError ? (
                            <div className="canvas-error-state">
                                <p>{fileError}</p>
                            </div>
                        ) : files.length === 0 ? (
                            <div className="canvas-empty-state">
                                <p>No files found for this course.</p>
                            </div>
                        ) : displayedFiles.length === 0 ? (
                            <div className="canvas-empty-state">
                                <p>No files match your search.</p>
                            </div>
                        ) : (
                            <div className="file-list">
                                {displayedFiles.map((file) => (
                                    <a
                                      key={file.id}
                                      href={file.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="file-list-item"
                                    >
                                        <div className="file-list-icon">
                                            <FileText size={18} />
                                        </div>
                                        <div className="file-details">
                                            <h4 className="file-name">{file.display_name}</h4>
                                            <span className="file-meta">
                                                {formatFileSize(file.size)} • Updated {formatDate(file.updated_at)}
                                            </span>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </main>
    </div>
  )
}

export default FileViewer
