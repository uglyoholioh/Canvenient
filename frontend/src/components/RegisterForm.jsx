import { useState } from "react"

import { register } from "../api"

function RegisterForm({ onRegisterSuccess, onSwitchMode }) {
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
      const session = await register({ email, password })
      setMessage("Account created. Setting up your Task Manager...")
      onRegisterSuccess(session)
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
        {isSubmitting ? "Creating account..." : "Create Account"}
      </button>

      {message && (
        <p className={isError ? "status-message error" : "status-message success"}>
          {message}
        </p>
      )}

      <p className="auth-footnote">
        Already registered?{" "}
        <button
          className="text-button"
          type="button"
          onClick={onSwitchMode}
        >
          Log in instead
        </button>
      </p>
    </form>
  )
}

export default RegisterForm
