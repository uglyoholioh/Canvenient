import { useEffect, useState } from "react"

import {
  clearStoredToken,
  getCurrentUser,
  getStoredToken,
  persistToken,
} from "./api"
import RegisterForm from "./components/RegisterForm"
import LoginForm from "./components/LoginForm"
import TaskManagerDashboard from "./components/TaskManagerDashboard"
import "./App.css"

function App() {
  const [authMode, setAuthMode] = useState("login")
  const [token, setToken] = useState(() => getStoredToken())
  const [currentUser, setCurrentUser] = useState(null)
  const [sessionMessage, setSessionMessage] = useState("")
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
          setSessionMessage("Your session expired. Please log in again.")
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

  function handleAuthSuccess(session) {
    persistToken(session.access_token)
    setToken(session.access_token)
    setCurrentUser(session.user)
    setSessionMessage("")
  }

  function handleLogout() {
    clearStoredToken()
    setToken("")
    setCurrentUser(null)
    setAuthMode("login")
    setSessionMessage("You have been logged out.")
  }

  if (isCheckingSession) {
    return (
      <main className="auth-shell">
        <section className="auth-card loading-card">
          <p className="eyebrow">CanVenient</p>
          <h1>Restoring your workspace...</h1>
          <p>Checking your saved session before loading Task Manager.</p>
        </section>
      </main>
    )
  }

  if (currentUser) {
    return (
      <TaskManagerDashboard
        token={token}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <p className="eyebrow">CanVenient</p>
        <h1>Built by students, for students.</h1>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button
            className={authMode === "login" ? "tab-button active" : "tab-button"}
            type="button"
            onClick={() => setAuthMode("login")}
          >
            Log In
          </button>
          <button
            className={authMode === "register" ? "tab-button active" : "tab-button"}
            type="button"
            onClick={() => setAuthMode("register")}
          >
            Register
          </button>
        </div>

        {sessionMessage && <p className="status-banner success">{sessionMessage}</p>}

        {authMode === "login" ? (
          <LoginForm
            onLoginSuccess={handleAuthSuccess}
            onSwitchMode={() => setAuthMode("register")}
          />
        ) : (
          <RegisterForm
            onRegisterSuccess={handleAuthSuccess}
            onSwitchMode={() => setAuthMode("login")}
          />
        )}
      </section>
    </main>
  )
}

export default App
