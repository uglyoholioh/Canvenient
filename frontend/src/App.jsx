import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom"
import RegisterForm from "./components/RegisterForm"
import LoginForm from "./components/LoginForm"
import "./App.css"

function App() {

  return (
    <Router>
      <div>
        <h1>CanVenient</h1>

        <nav style={{ marginBottom: "20px" }}>
          <Link to="/login" style={{ marginRight: "10px" }}>Log In</Link>
          <Link to="/register">Register</Link>
        </nav>


        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/dashboard" element={
            <div>
              <h2>Dashboard</h2>
              <p>Welcome to CanVenient! You are successfully logged in.</p>
              <Link to="/login">Log Out</Link>
            </div>
          } />
        </Routes>

      </div>
    </Router>
  )
}

export default App
