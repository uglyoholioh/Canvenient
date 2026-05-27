import { useEffect, useState } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import RegisterForm from "./components/RegisterForm"
import LoginForm from "./components/LoginForm"
import Dashboard from "./components/Dashboard"
import TaskManagerDashboard from "./components/TaskManagerDashboard"
import { getStoredToken, persistToken, clearStoredToken, getCurrentUser } from "./api"
import "./App.css"

function App() {
  const [token, setToken] = useState(() => getStoredToken())
  const [currentUser, setCurrentUser] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(getStoredToken()))

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (!token) {
        setCurrentUser(null)
        setIsCheckingSession(false)
        return
      }

      setIsCheckingSession(true)

      try {
        const user = await getCurrentUser(token)
        if (!cancelled) {
          setCurrentUser(user)
        }
      } catch {
        clearStoredToken()
        if (!cancelled) {
          setToken("")
          setCurrentUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false)
        }
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [token])

  const handleLoginSuccess = (session) => {
    persistToken(session.access_token)
    setToken(session.access_token)
    setCurrentUser(session.user)
  }

  const handleLogout = () => {
    clearStoredToken()
    setToken("")
    setCurrentUser(null)
  }

  if (isCheckingSession) {
    return (
      <main className="auth-shell" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <section className="auth-card" style={{ textAlign: "center" }}>
          <h2>Canvenient</h2>
          <p>Restoring your workspace...</p>
        </section>
      </main>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/register" element={<RegisterForm />} />
        <Route 
          path="/login" 
          element={
            currentUser ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginForm onLoginSuccess={handleLoginSuccess} />
            )
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            currentUser ? (
              <Dashboard token={token} currentUser={currentUser} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        <Route 
          path="/tasks" 
          element={
            currentUser ? (
              <TaskManagerDashboard token={token} currentUser={currentUser} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
      </Routes>
    </Router>
  )
}

export default App
