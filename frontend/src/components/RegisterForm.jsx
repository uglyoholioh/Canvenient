import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"

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
      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage("Registration successful! Redirecting to login...")
        setIsError(false)
        setTimeout(() => {
          navigate("/login")
        }, 1500)
      }
      else {
        const errorMessage = typeof data.detail === 'object'
          ? "Invalid email or password format."
          : data.detail || "Registration failed"
        setMessage(errorMessage)
        setIsError(true)
      }
    } catch (error) {
      setMessage(error.message || "Could not connect to the server.")
      setIsError(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <h2>Create Account</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. EXXXXXXX@u.nus.edu"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Registering..." : "Register"}
          </button>
          <p className="auth-footer">
            Already have an account? <Link to="/login">Log In</Link>
          </p>

          {message && (
            <p className={isError ? "text-error" : "text-success"}>{message}</p>
          )}
        </form>
      </div>
    </div>
  )
}

export default RegisterForm
