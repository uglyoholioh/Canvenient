import { useState } from "react"
import { updateProfile } from "../api"

function OnboardingForm({ token, currentUser, onComplete }) {
  const [name, setName] = useState("")
  const [canvasToken, setCanvasToken] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      const updatedUser = await updateProfile(token, {
        name: name.trim(),
        canvas_token: canvasToken.trim(),
      })
      onComplete(updatedUser)
    } catch (err) {
      setError(err.message || "Could not save your profile.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Welcome to Canvenient</h2>
        <p style={{ fontSize: "14px", color: "var(--text)", marginTop: "-16px" }}>
          Let&apos;s set up your workspace before we get started.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice Smith"
              required
            />
          </div>

          <div className="form-group" style={{ marginTop: "16px" }}>
            <label htmlFor="canvas-token">Canvas API Token (optional)</label>
            <input
              id="canvas-token"
              type="text"
              value={canvasToken}
              onChange={(e) => setCanvasToken(e.target.value)}
              placeholder="Paste your token here"
            />
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
              Generate this in Canvas under Settings → Approved Integrations → New Access Token.
            </p>
          </div>

          {error && (
            <p style={{ color: "var(--error)", fontSize: "13px", marginTop: "12px" }}>{error}</p>
          )}

          <button
            type="submit"
            className="button"
            style={{ marginTop: "24px" }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Set Up My Workspace"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default OnboardingForm
