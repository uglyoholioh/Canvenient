  import { useState } from "react"

  function RegisterForm() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [message, setMessage] = useState("")
    const [isError, setIsError] = useState(false)

    const handleSubmit = async (e) => {
      e.preventDefault()
      setMessage("")

      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage("Registration successful! You can now log in.")
        setIsError(false)
      } else {
        setMessage(data.detail)
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
        <button type="submit">Register</button>

        {message && (
          <p style={{ color: isError ? "red" : "green" }}>{message}</p>
        )}
      </form>
    )
  }

export default RegisterForm