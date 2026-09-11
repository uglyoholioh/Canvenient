import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { login } from "../api"
import "./auth.css"

function LoginForm({ onLoginSuccess }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isShaking, setIsShaking] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage("")
    setIsError(false)
    setIsSubmitting(true)

    try {
      const session = await login({ email, password })
      onLoginSuccess(session)
      navigate("/workspace", { replace: true })
    } catch (error) {
      setMessage(error.message || "Login failed")
      setIsError(true)
      setIsSubmitting(false)
      setIsShaking(true)
    }
  }

  return (
    <div className="auth-container">
      <div
        className={`auth-card ${isShaking ? "auth-card--shake" : ""}`}
        onAnimationEnd={() => setIsShaking(false)}
      >
        <header className="auth-header auth-rise" style={{ "--auth-delay": "40ms" }}>
          <span className="auth-wordmark">canvenient</span>
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-subtitle">Welcome back to your workspace</p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="auth-field auth-rise" style={{ "--auth-delay": "90ms" }}>
            <label className="auth-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@university.edu"
              autoComplete="email"
              autoFocus
              required
            />
          </div>

          <div className="auth-field auth-rise" style={{ "--auth-delay": "130ms" }}>
            <label className="auth-label" htmlFor="password">Password</label>
            <div className="auth-input-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {message && isError && (
            <div className="auth-alert" role="alert">
              <AlertCircle size={15} />
              <span>{message}</span>
            </div>
          )}

          <div className="auth-rise" style={{ "--auth-delay": "170ms" }}>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 size={15} className="retro-icon-spin" /> Signing in…</>
              ) : (
                "Sign in"
              )}
            </button>
          </div>

          <footer className="auth-footer auth-rise" style={{ "--auth-delay": "210ms" }}>
            Don&apos;t have an account?{" "}
            <Link to="/register" className="auth-link">
              Create one
            </Link>
          </footer>
        </form>
      </div>
    </div>
  )
}

export default LoginForm
