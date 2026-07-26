import React, { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { login } from "../api"

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
            setMessage("Login successful! Redirecting...")
            setIsError(false)
            onLoginSuccess(session)
            setTimeout(() => {
                navigate("/dashboard")
            }, 800)
        } catch (error) {
            setMessage(error.message || "Login failed")
            setIsError(true)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="auth-container">
            <div className="card auth-card">
                <h2>Sign in</h2>
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
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn--primary btn--full" disabled={isSubmitting}>
                        {isSubmitting ? "Logging in..." : "Login"}
                    </button>
                    <p className="auth-footer">
                        Don't have an account? <Link to="/register">Register</Link>
                    </p>

                    {message && (
                        <p className={`text-sm text-center ${isError ? "text-error" : "text-success"}`}>{message}</p>
                    )}
                </form>
            </div>
        </div>
    )
}

export default LoginForm
