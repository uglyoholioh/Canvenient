import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Sparkles, Loader2 } from "lucide-react"
import { register } from "../api"
import "./auth.css"

function RegisterForm() {
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
      await register({ email, password })
      setMessage("Account created. Redirecting...")
      setIsError(false)
      setTimeout(() => {
        navigate("/login")
      }, 1500)
    } catch (error) {
      setMessage(error.message || "Connection refused.")
      setIsError(true)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="retro-auth-container">
      <div className="retro-auth-card">
        <div className="retro-auth-header">
          <Sparkles size={28} color="var(--accent)" style={{ marginBottom: '16px' }} />
          <h2 className="retro-auth-title">Register</h2>
          <p className="retro-auth-subtitle">Join the workspace</p>
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

          <button
            type="submit"
            className="retro-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 size={16} className="retro-icon-spin" /> Registering...</>
            ) : (
              "Create Account"
            )}
          </button>

          <div className="retro-footer">
            Already have an account?{" "}
            <Link to="/login" className="retro-link">
              Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RegisterForm
