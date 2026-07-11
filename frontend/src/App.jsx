import { useEffect, useState } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import RegisterForm from "./components/RegisterForm"
import LoginForm from "./components/LoginForm"
import Dashboard from "./components/Dashboard"
import TaskManagerDashboard from "./components/TaskManagerDashboard"
import OnboardingForm from "./components/OnboardingForm"
import FileViewer from "./components/FileViewer"
import Schedule from "./components/Schedule"
import Organisations from "./components/Organisations"
import JoinGroupLink from "./components/JoinGroupLink"
import Settings from "./components/Settings"

import { getStoredToken, persistToken, clearStoredToken, getCurrentUser, joinGroup } from "./api"
import { Outlet } from "react-router-dom"
import Sidebar from "./components/Sidebar"

function Layout({ currentUser, onLogout }) {
  return (
    <div className="app-layout">
      <Sidebar currentUser={currentUser} onLogout={onLogout} />

      <div className="app-content">
        <Outlet />
      </div>
    </div>
  )
}


function App() {
  const [token, setToken] = useState(() => getStoredToken())
  const [currentUser, setCurrentUser] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(getStoredToken()))

  useEffect(() => {
    if (token && currentUser && currentUser.name) {
      const pendingCode = localStorage.getItem("pending_invite_code")
      if (pendingCode) {
        localStorage.removeItem("pending_invite_code")
        joinGroup(token, pendingCode)
          .then(() => {
            sessionStorage.setItem("join_success", "Successfully joined group via invite link!")
            window.location.href = "/organisations"
          })
          .catch((err) => {
            sessionStorage.setItem("join_error", err.message || "Invalid or expired invite code.")
            window.location.href = "/organisations"
          })
      }
    }
  }, [token, currentUser])

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

  useEffect(() => {
    if (currentUser && currentUser.theme) {
      if (currentUser.theme === "default") {
        document.documentElement.removeAttribute("data-theme")
      } else {
        document.documentElement.setAttribute("data-theme", currentUser.theme)
      }
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
  }, [currentUser])

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
      <main className="auth-container">
        <section className="card auth-card text-center">
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
        <Route path="/join/:code" element={<JoinGroupLink token={token} currentUser={currentUser} />} />
        <Route
          element={
            !currentUser ? (
              <Navigate to="/login" replace />
            ) : !currentUser.name ? (
              <OnboardingForm
                token={token}
                currentUser={currentUser}
                onComplete={(updatedUser) => setCurrentUser(updatedUser)}
              />
            ) : (
              <Layout currentUser={currentUser} onLogout={handleLogout} />
            )
          }
        >
          <Route path="/dashboard" element={<Dashboard token={token} currentUser={currentUser} onLogout={handleLogout} />} />
          <Route path="/planner" element={<TaskManagerDashboard token={token} currentUser={currentUser} onLogout={handleLogout} />} />
          <Route path="/files" element={<FileViewer token={token} currentUser={currentUser} onLogout={handleLogout} />} />
          <Route path="/schedule" element={<Schedule token={token} currentUser={currentUser} />} />
          <Route path="/organisations" element={<Organisations token={token} currentUser={currentUser} />} />
          <Route path="/settings" element={<Settings token={token} currentUser={currentUser} onUpdateProfile={(updatedUser) => setCurrentUser(updatedUser)} />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
