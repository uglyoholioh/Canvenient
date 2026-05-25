import { useState } from "react"
import RegisterForm from "./components/RegisterForm"
import LoginForm from "./components/LoginForm"
import "./App.css"

function App() {
  const [page, setPage] = useState("register")

  return (
    <div>
      <h1>CanVenient</h1>

      <div>
        <button onClick={() => setPage("login")} disabled={page === "login"}>
          Log In
        </button>
        <button
          onClick={() => setPage("register")}
          disabled={page === "register"}
        >
          Register
        </button>
      </div>

      {page === "register" && <RegisterForm />}

      {page === "login" && (
        <LoginForm onLoginSuccess={() => setPage("dashboard")} />
      )}

      {page === "dashboard" && (
        <div>
          <h2>Dashboard</h2>
          <p>Welcome to CanVenient! You are successfully logged in.</p>
          <button onClick={() => setPage("login")}>Log Out</button>
        </div>
      )}
    </div>
  )
}

export default App
