import { useEffect, useState } from "react"
import { BookOpen, RefreshCw } from "lucide-react"
import { getCanvasCourses } from "../api"

function FileViewer({ token, currentUser }) {
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [courseError, setCourseError] = useState("")

  useEffect(() => {
    async function loadCourses() {
      if (!token || !currentUser?.canvas_token) {
        setCourses([])
        return
      }

      setLoadingCourses(true)
      setCourseError("")

      try {
        const coursesData = await getCanvasCourses(token)
        setCourses(coursesData || [])
      } catch (err) {
        setCourseError(err.message || "Failed to load Canvas courses.")
      } finally {
        setLoadingCourses(false)
      }
    }

    loadCourses()
  }, [token, currentUser?.canvas_token])

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
                <div className="course-list">
                    {courses.map((course) => (
                        <div key={course.id} className="course-item">
                            <div className="course-info">
                                <span className="course-code">{course.course_code}</span>
                                <span className="course-name">{course.name}</span>
                            </div>
                            <BookOpen size={18} />
                        </div>
                    ))}
                </div>
            )}
        </main>
    </div>
  )
}

export default FileViewer
