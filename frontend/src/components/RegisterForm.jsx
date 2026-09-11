import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Eye, EyeOff, Loader2, AlertCircle, Check } from "lucide-react"
import { register } from "../api"
import AuthShell, { BrandMark } from "./AuthShell"
import "./auth.css"

function RegisterForm({ onLoginSuccess }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [didSucceed, setDidSucceed] = useState(false)
  const [isShaking, setIsShaking] = useState(false)

  // The backend returns a session on register, so new accounts land straight
  // in the workspace instead of bouncing through the login form.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage("")
    setIsError(false)
    setIsSubmitting(true)

    try {
      const session = await register({ email, password })
      setDidSucceed(true)
      window.setTimeout(() => {
        onLoginSuccess(session)
        navigate("/workspace", { replace: true })
      }, 350)
    } catch (error) {
      setMessage(error.message || "Registration failed")
      setIsError(true)
      setIsSubmitting(false)
      setIsShaking(true)
    }
  }

  return (
    <AuthShell>
      <div
        className={isShaking ? "auth-poster--shake" : ""}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setIsShaking(false)
        }}
      >
        <BrandMark />
        <h1 className="auth-title auth-rise" style={{ "--auth-delay": "300ms" }}>
          Create your account
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="auth-field auth-rise" style={{ "--auth-delay": "380ms" }}>
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

          <div className="auth-field auth-field--with-toggle auth-rise" style={{ "--auth-delay": "440ms" }}>
            <label className="auth-label" htmlFor="password">Password</label>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
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

          {message && isError && (
            <div className="auth-alert" role="alert">
              <AlertCircle size={15} />
              <span>{message}</span>
            </div>
          )}

          <div className="auth-rise" style={{ "--auth-delay": "520ms" }}>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {didSucceed ? (
                <Check size={16} className="auth-check-pop" />
              ) : isSubmitting ? (
                <><Loader2 size={15} className="retro-icon-spin" /> Creating account…</>
              ) : (
                "Create account"
              )}
            </button>
          </div>

          <footer className="auth-footer auth-rise" style={{ "--auth-delay": "580ms" }}>
            Already registered?{" "}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </footer>
        </form>
      </div>
    </AuthShell>
  )
}

export default RegisterForm
