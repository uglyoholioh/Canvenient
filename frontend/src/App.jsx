import { useState } from "react"
import RegisterForm from "./components/RegisterForm"
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

      {page === "login" && <p>Login form coming soon.</p>}
    </div>
  )
}

export default App
