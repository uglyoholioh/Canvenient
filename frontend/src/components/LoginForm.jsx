import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"

function LoginForm() {
    const navigate = useNavigate()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [message, setMessage] = useState("")
    const [isError, setIsError] = useState(false)

function LoginForm({ onLoginSuccess, onSwitchMode }) {
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

            const data = await response.json()

            if (response.ok) {
                setMessage("Login successful!")
                setIsError(false)
                setTimeout(() => {
                    navigate("/dashboard")
                }, 800)
            } else {
                const errorMessage = typeof data.detail === 'object'
                    ? "Invalid email or password format."
                    : data.detail || "Login failed"
                setMessage(errorMessage)
                setIsError(true)
            }
        } catch (error) {
            setMessage("Could not connect to the server.")
            setIsError(true)
        }
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@u.nus.edu"
          required
        />
      </label>

      <label>
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          required
        />
      </label>

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Log In"}
      </button>

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Sign in</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            id="email"
                            type="email"
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
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                    </div>
                    <br></br>

                    <button type="submit" className="button">Login</button>
                    <p className="auth-footer">
                        Don't have an account? <Link to="/register">Register</Link>
                    </p>

                    {message && (
                        <p style={{ color: isError ? "red" : "green" }}>{message}</p>
                    )}
                </form>
            </div>
        </div>
    )
}

export default LoginForm
