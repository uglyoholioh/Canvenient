import { useState } from "react"

import { login } from "../api"

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

    try {
      const session = await login({ email, password })
      setMessage("Welcome back. Loading your workspace...")
      onLoginSuccess(session)
    } catch (error) {
      setMessage(error.message || "Could not connect to the server.")
      setIsError(true)
    } finally {
      setIsSubmitting(false)
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

      {message && (
        <p className={isError ? "status-message error" : "status-message success"}>
          {message}
        </p>
      )}

      <p className="auth-footnote">
        New here?{" "}
        <button
          className="text-button"
          type="button"
          onClick={onSwitchMode}
        >
          Create an account
        </button>
      </p>
    </form>
  )
}

export default LoginForm
