import React, { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Sparkles, Loader2 } from "lucide-react"
import { login } from "../api"
import "./auth.css"

function LoginForm({ onLoginSuccess }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage("")
    setIsError(false)
    setIsSubmitting(true)

    try {
      const session = await login({ email, password })
      onLoginSuccess(session)
      navigate("/workspace")
    } catch (error) {
      setMessage(error.message || "Login failed")
      setIsError(true)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="retro-auth-container">
      <div className="retro-auth-card">
        <div className="retro-auth-header">
          <Sparkles size={28} color="var(--accent)" style={{ marginBottom: '16px' }} />
          <h2 className="retro-auth-title">Sign In</h2>
          <p className="retro-auth-subtitle">Welcome back to your workspace</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="retro-form-group">
            <label className="retro-label" htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="retro-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@university.edu"
              required
            />
          </div>
          <div className="retro-form-group">
            <label className="retro-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="retro-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {message && (
            <p className={`text-sm text-center mb-sm ${isError ? "text-error" : "text-success"}`}>
              {message}
            </p>
          )}

          <button type="submit" className="retro-btn" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 size={16} className="retro-icon-spin" /> Signing in...</>
            ) : (
              "Sign In"
            )}
          </button>

          <div className="retro-footer">
            Don't have an account?{" "}
            <Link to="/register" className="retro-link">
              Register here
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LoginForm
