import { useState } from "react"
import { Sparkles, ArrowRight } from "lucide-react"
import { updateProfile } from "../api"

function OnboardingForm({ token, onComplete }) {
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
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="flex flex-col items-center mb-md gap-sm">
          <div className="auth-brand-mark">
            <Sparkles size={24} className="text-accent" />
          </div>
          <h2 className="font-serif" style={{ fontSize: '32px', color: 'var(--text-h)' }}>Welcome</h2>
          <p className="text-sm text-muted text-center" style={{ marginTop: '-4px' }}>
            Let's set up your workspace before we get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              id="name"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice Smith"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="canvas-token">Canvas API Token (optional)</label>
            <input
              id="canvas-token"
              type="text"
              className="form-control"
              value={canvasToken}
              onChange={(e) => setCanvasToken(e.target.value)}
              placeholder="Paste your token here"
            />
            <p className="text-xs text-muted mt-xs" style={{ lineHeight: '1.4' }}>
              Generate this in Canvas under Settings → Approved Integrations → New Access Token.
            </p>
          </div>

          {error && (
            <p className="text-sm text-center text-error">{error}</p>
          )}

          <button
            type="submit"
            className="btn btn--primary w-full mt-sm"
            style={{ width: '100%', justifyContent: 'space-between' }}
            disabled={isSubmitting}
          >
            <span>{isSubmitting ? "Saving..." : "Set Up My Workspace"}</span>
            {!isSubmitting && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  )
}

export default OnboardingForm
