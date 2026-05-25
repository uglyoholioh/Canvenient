import { useState } from "react"
import { useNavigate } from "react-router-dom"

function LoginForm() {
    const navigate = useNavigate()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [message, setMessage] = useState("")
    const [isError, setIsError] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setMessage("")
        setIsError(false)

        try {
            const response = await fetch('/auth/login', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            })

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

    return (
        <form onSubmit={handleSubmit}>
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
            />
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
            />
            <button type="submit">Login</button>

            {message && (
                <p style={{ color: isError ? "red" : "green" }}>{message}</p>
            )}
        </form>
    )
}

export default LoginForm
