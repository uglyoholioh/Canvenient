import { useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { joinGroup } from "../api"

function JoinGroupLink({ token, currentUser }) {
  const { code } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) {
      localStorage.setItem("pending_invite_code", code)
      navigate("/login", { replace: true })
      return
    }

    async function doJoin() {
      try {
        await joinGroup(token, code)
        sessionStorage.setItem("join_success", "Successfully joined group via invite link!")
        navigate("/organisations", { replace: true })
      } catch (err) {
        sessionStorage.setItem("join_error", err.message || "Invalid or expired invite code.")
        navigate("/organisations", { replace: true })
      }
    }

    doJoin()
  }, [code, token, navigate])

  return (
    <div className="auth-container">
      <div className="card auth-card text-center">
        <h2>Joining group...</h2>
        <p>Please wait while we add you to the group.</p>
      </div>
    </div>
  )
}

export default JoinGroupLink
