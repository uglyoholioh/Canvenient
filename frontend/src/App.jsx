import { useEffect, useState } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom"
import RegisterForm from "./components/RegisterForm"
import LoginForm from "./components/LoginForm"
import WorkspaceLayout from "./components/WorkspaceLayout"
import "./components/auth.css"

import {
  getStoredToken,
  persistToken,
  clearStoredToken,
  getStoredUser,
  persistUser,
  getCurrentUser,
} from "./api"

function App() {
  const [token, setToken] = useState(() => getStoredToken())
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())
  const [isCheckingSession, setIsCheckingSession] = useState(
    () => Boolean(getStoredToken()) && !getStoredUser()
  )

  useEffect(() => {
    let cancelled = false
    async function restoreSession() {
      if (!token) {
        setCurrentUser(null)
        setIsCheckingSession(false)
        return
      }
      try {
        const user = await getCurrentUser(token)
        if (!cancelled) {
          setCurrentUser(user)
          persistUser(user)
        }
      } catch {
        if (!cancelled) {
          clearStoredToken()
          setToken("")
          setCurrentUser(null)
        }
      } finally {
        if (!cancelled) setIsCheckingSession(false)
      }
    }
    restoreSession()
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark")
  }, [])

  const handleLoginSuccess = (session) => {
    persistToken(session.access_token)
    persistUser(session.user)
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
      <main className="retro-auth-container">
        <section className="retro-auth-card text-center">
          <h2 className="font-serif">Canvenient</h2>
          <p className="text-muted text-sm mt-xs">Loading terminal...</p>
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
              <Navigate to="/workspace" replace />
            ) : (
              <LoginForm onLoginSuccess={handleLoginSuccess} />
            )
          }
        />
        <Route
          path="/workspace"
          element={
            !currentUser ? (
              <Navigate to="/login" replace />
            ) : (
              <WorkspaceLayout token={token} user={currentUser} onLogout={handleLogout} />
            )
          }
        />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Routes>
    </Router>
  )
}

export default App
