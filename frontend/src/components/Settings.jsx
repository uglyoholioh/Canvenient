import { useState, useEffect } from "react"
import { User, Key, Palette, Check, Loader2, Info } from "lucide-react"
import { updateProfile } from "../api"

const THEMES = [
  {
    id: "default",
    name: "Warm Olive",
    bg: "#F5F5D5",
    primary: "#354A2F",
    accent: "#5C724A",
    border: "#D4D9C8",
    isDark: false
  },
  {
    id: "ocean",
    name: "Ocean Breeze",
    bg: "#E0F2F1",
    primary: "#005A50",
    accent: "#00897B",
    border: "#B2DFDB",
    isDark: false
  },
  {
    id: "sunset",
    name: "Sunset Horizon",
    bg: "#FFF3E0",
    primary: "#C54B00",
    accent: "#E65100",
    border: "#FFE0B2",
    isDark: false
  },
  {
    id: "amethyst",
    name: "Royal Amethyst",
    bg: "#F3E5F5",
    primary: "#4A148C",
    accent: "#7B1FA2",
    border: "#E1BEE7",
    isDark: false
  },
  {
    id: "midnight",
    name: "Midnight Eclipse",
    bg: "#0C0D10",
    primary: "#64DFDF",
    accent: "#72EFDD",
    border: "#232738",
    isDark: true
  }
]

function Settings({ token, currentUser, onUpdateProfile }) {
  const [name, setName] = useState(currentUser?.name || "")
  const [canvasToken, setCanvasToken] = useState(currentUser?.canvas_token || "")
  const [selectedTheme, setSelectedTheme] = useState(currentUser?.theme || "default")
  const [showToken, setShowToken] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState({ text: "", type: "" }) // 'success' | 'error'

  // Live preview theme
  const handleThemePreview = (themeId) => {
    setSelectedTheme(themeId)
    if (themeId === "default") {
      document.documentElement.removeAttribute("data-theme")
    } else {
      document.documentElement.setAttribute("data-theme", themeId)
    }
  }

  // Restore user's saved theme on leave
  useEffect(() => {
    return () => {
      const activeTheme = currentUser?.theme || "default"
      if (activeTheme === "default") {
        document.documentElement.removeAttribute("data-theme")
      } else {
        document.documentElement.setAttribute("data-theme", activeTheme)
      }
    }
  }, [currentUser])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage({ text: "", type: "" })

    try {
      const updatedUser = await updateProfile(token, {
        name: name.trim(),
        canvas_token: canvasToken.trim(),
        theme: selectedTheme,
      })
      onUpdateProfile(updatedUser)
      setMessage({ text: "Settings saved successfully!", type: "success" })
    } catch (err) {
      setMessage({ text: err.message || "Failed to update settings.", type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="flex justify-between items-center mb-lg">
        <div>
          <span className="eyebrow">WORKSPACE CONFIGURATION</span>
          <h1 style={{ fontSize: "2.8rem" }}>Settings</h1>
          <p className="text-muted text-sm mt-sm">Customize your personal workspace, integration preferences, and app theme.</p>
        </div>
      </header>

      <div className="list" style={{ gap: "24px" }}>
        <form onSubmit={handleSubmit} className="form flex-col gap-lg">
          {/* Profile */}
          <section className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="flex items-center gap-md" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
              <User size={22} className="text-h" />
              <h3 style={{ fontSize: "1.5rem" }}>Profile Information</h3>
            </div>

            <div className="form-group">
              <label htmlFor="settings-email" className="text-sm text-muted">Email Address (Read Only)</label>
              <input
                id="settings-email"
                type="email"
                className="form-input"
                value={currentUser?.email || ""}
                disabled
                style={{ opacity: 0.6, cursor: "not-allowed" }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="settings-name" className="text-sm font-semibold">Your Name</label>
              <input
                id="settings-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alice Smith"
                required
              />
            </div>
          </section>

          {/* Canvas integration */}
          <section className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="flex items-center gap-md" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
              <Key size={22} className="text-h" />
              <h3 style={{ fontSize: "1.5rem" }}>Canvas Integration</h3>
            </div>

            <p className="text-sm text" style={{ marginTop: "-8px" }}>
              Connecting your Canvas LMS account automatically imports courses, syllabus schedules, deadlines, and files into Canvenient.
            </p>

            <div className="form-group">
              <label htmlFor="settings-canvas-token" className="text-sm font-semibold">Canvas API Access Token</label>
              <div className="relative" style={{ display: "flex", alignItems: "center" }}>
                <input
                  id="settings-canvas-token"
                  type={showToken ? "text" : "password"}
                  className="form-input w-full"
                  value={canvasToken}
                  onChange={(e) => setCanvasToken(e.target.value)}
                  placeholder="Paste your token here (starts with 12345~...)"
                  style={{ paddingRight: "80px" }}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    padding: "4px 10px"
                  }}
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
              
              <div className="flex gap-sm items-start mt-md text-xs text-muted" style={{ padding: "10px", backgroundColor: "var(--surface-warm)", borderRadius: "var(--radius-sm)" }}>
                <Info size={14} className="text-info flex-shrink-0" style={{ marginTop: "2px" }} />
                <span>
                  To create an access token, log into your Canvas account, click <strong>Account</strong> &rarr; <strong>Settings</strong>, scroll down to <strong>Approved Integrations</strong>, and click <strong>+ New Access Token</strong>.
                </span>
              </div>
            </div>
          </section>

          {/* Themes */}
          <section className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="flex items-center gap-md" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
              <Palette size={22} className="text-h" />
              <h3 style={{ fontSize: "1.5rem" }}>App Themes</h3>
            </div>

            <p className="text-sm text" style={{ marginTop: "-8px" }}>
              Choose a custom, professionally-designed color theme to set the atmosphere of your workspace.
            </p>

            {/* Themes list */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "16px",
                marginTop: "8px"
              }}
            >
              {THEMES.map((theme) => {
                const isSelected = selectedTheme === theme.id
                return (
                  <div
                    key={theme.id}
                    onClick={() => handleThemePreview(theme.id)}
                    className="card cursor-pointer flex-col justify-between"
                    style={{
                      padding: "16px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      backgroundColor: theme.isDark ? "#14161F" : "#FFFFFF",
                      boxShadow: isSelected ? "var(--shadow)" : "var(--shadow-soft)",
                      transform: isSelected ? "scale(1.02)" : "scale(1)",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      position: "relative",
                      borderRadius: "var(--radius-lg)"
                    }}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center w-full mb-md">
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: theme.isDark ? "#FFFFFF" : "#333333"
                        }}
                      >
                        {theme.name}
                      </span>
                      {isSelected && (
                        <div
                          style={{
                            backgroundColor: "var(--primary)",
                            color: "var(--bg)",
                            borderRadius: "50%",
                            width: "20px",
                            height: "20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </div>

                    {/* Color swatches */}
                    <div
                      className="flex gap-sm"
                      style={{
                        padding: "8px",
                        backgroundColor: theme.bg,
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${theme.border}`,
                        height: "45px",
                        alignItems: "center"
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: theme.primary,
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.1)"
                        }}
                        title="Primary Color"
                      />
                      <div
                        style={{
                          backgroundColor: theme.accent,
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.1)"
                        }}
                        title="Accent Color"
                      />
                      <div
                        style={{
                          backgroundColor: theme.bg,
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.15)"
                        }}
                        title="Background Color"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Messages */}
          {message.text && (
            <div
              className="card flex items-center gap-md"
              style={{
                padding: "12px 16px",
                backgroundColor: message.type === "success" ? "rgba(46, 125, 50, 0.1)" : "rgba(211, 47, 47, 0.1)",
                borderColor: message.type === "success" ? "var(--success)" : "var(--error)",
                color: message.type === "success" ? "var(--success)" : "var(--error)"
              }}
            >
              <span className="text-sm font-semibold">{message.text}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-md">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSubmitting}
              style={{ padding: "12px 30px", minWidth: "150px" }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Settings
