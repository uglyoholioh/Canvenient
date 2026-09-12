import { useState, useEffect } from "react";
import {
  Sparkles,
  Key,
  Palette,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Moon,
  Sun,
  Monitor,
  Trees,
  Check,
  X,
} from "lucide-react";
import { updateProfile, validateCanvasToken } from "../api";
import "./onboarding.css";

const THEMES = [
  { id: "graphite", label: "Graphite", description: "Soft monochrome", icon: Moon, swatches: ["#101113", "#1a1b1e", "#9c9da1"] },
  { id: "dusk", label: "Dusk", description: "Smoky violet", icon: Sparkles, swatches: ["#14131a", "#211e2a", "#b7a6d8"] },
  { id: "forest", label: "Moss", description: "Muted green", icon: Trees, swatches: ["#101512", "#1a211c", "#9fb49f"] },
  { id: "ocean", label: "Tide", description: "Muted blue", icon: Palette, swatches: ["#0f1418", "#182126", "#9ab7c2"] },
  { id: "light", label: "Paper", description: "Quiet light", icon: Sun, swatches: ["#f2f1ed", "#ffffff", "#66716f"] },
  { id: "system", label: "System", description: "Follow device", icon: Monitor, swatches: ["#242528", "#e7e5df", "#8b8b8b"] },
];

export default function OnboardingModal({
  token,
  user,
  isOpen = true,
  onComplete,
  onClose,
  canDismiss = false,
}) {
  const [step, setStep] = useState(1);
  // Prefill from the email prefix so Continue is never a dead end; the
  // suggestion stays editable and profile-name semantics are unchanged.
  const [name, setName] = useState(
    () => user?.name || (user?.email ? user.email.split("@")[0] : "")
  );
  // The raw Canvas token is never sent back to the client; the field starts
  // empty and only carries a value when entered during onboarding.
  const [canvasToken, setCanvasToken] = useState("");
  const [showCanvasToken, setShowCanvasToken] = useState(false);
  const [testingToken, setTestingToken] = useState(false);
  const [tokenResult, setTokenResult] = useState(null);
  const [selectedTheme, setSelectedTheme] = useState(() => {
    const saved = localStorage.getItem("canvenient-theme") || user?.theme || "graphite";
    return saved === "dark" ? "graphite" : saved;
  });
  const [sidebarMode, setSidebarMode] = useState(() => {
    return localStorage.getItem("canvenient-sidebar-mode") || "hover";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (selectedTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "graphite" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", selectedTheme);
    }
  }, [selectedTheme]);

  if (!isOpen) return null;

  const handleTestToken = async () => {
    if (!canvasToken.trim()) {
      setTokenResult({ valid: false, error: "Please enter a token first." });
      return;
    }
    setTestingToken(true);
    setTokenResult(null);
    try {
      const res = await validateCanvasToken(token, canvasToken.trim());
      setTokenResult(res);
    } catch (err) {
      setTokenResult({ valid: false, error: err.message || "Failed to validate token." });
    } finally {
      setTestingToken(false);
    }
  };

  const handleFinish = async () => {
    const finalName = name.trim() || (user?.email ? user.email.split("@")[0] : "Student");
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const updatedUser = await updateProfile(token, {
        name: finalName,
        // Omitting canvas_token preserves an existing connection when the
        // step is skipped; a typed token replaces it.
        ...(canvasToken.trim() ? { canvas_token: canvasToken.trim() } : {}),
        theme: selectedTheme,
      });

      localStorage.setItem("canvenient-theme", selectedTheme);
      localStorage.setItem("canvenient-sidebar-mode", sidebarMode);
      if (user?.id) {
        localStorage.setItem(`canvenient_onboarding_completed_${user.id}`, "true");
      }
      window.dispatchEvent(new Event("settings-updated"));
      window.dispatchEvent(new Event("academic-modules-updated"));

      onComplete?.(updatedUser);
      onClose?.();
    } catch (err) {
      setSubmitError(err.message || "Could not save your preferences.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Onboarding"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        className="onboarding-card"
        onKeyDown={(e) => {
          if (e.key === "Escape" && canDismiss) onClose?.();
        }}
        style={{
          width: "100%",
          maxWidth: "520px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "8px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Step indicator header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "4px",
                backgroundColor: "var(--surface-muted)",
                border: "1px solid var(--border-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "600",
                fontFamily: "var(--font-mono)",
                color: "var(--text-h)",
              }}
            >
              {step}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Step {step} of 4: {step === 1 ? "Identity" : step === 2 ? "Canvas LMS" : step === 3 ? "Appearance" : "Ready"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ display: "flex", gap: "4px" }} aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  style={{
                    width: "18px",
                    height: "2px",
                    borderRadius: "1px",
                    backgroundColor: n <= step ? "var(--accent)" : "var(--border)",
                    transition: "background-color 140ms ease",
                  }}
                />
              ))}
            </div>
            {canDismiss && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="mac-toolbar-button"
                aria-label="Close setup"
                style={{ padding: "4px" }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Modal content body — keyed by step so each change re-runs the fade */}
        <div key={step} className="onboarding-step" style={{ padding: "28px 24px" }}>
          {/* STEP 1: Profile Name */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)", margin: "0 0 6px 0" }}>
                  Welcome to Canvenient
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: "1.5" }}>
                  Let's personalize your workspace. What should we call you?
                </p>
              </div>

              <div>
                <label
                  htmlFor="onboarding-name"
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "8px",
                  }}
                >
                  Your Name
                </label>
                <input
                  id="onboarding-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Tan"
                  className="form-input"
                  autoFocus
                  style={{ width: "100%", fontSize: "14px", padding: "10px 12px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) setStep(2);
                  }}
                />
                <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                  This will be shown on your dashboard greeting and workspace header.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Canvas LMS API Key */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)", margin: "0 0 6px 0" }}>
                  Canvas LMS API Key
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: "1.5" }}>
                  Sync your modules, deadlines, assignments, and files directly to your workbench.
                </p>
              </div>

              <div>
                <label
                  htmlFor="onboarding-canvas-token"
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "8px",
                  }}
                >
                  Canvas Access Token
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      id="onboarding-canvas-token"
                      type={showCanvasToken ? "text" : "password"}
                      value={canvasToken}
                      onChange={(e) => {
                        setCanvasToken(e.target.value);
                        setTokenResult(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canvasToken.trim()) setStep(3);
                      }}
                      placeholder="Paste token here (optional)"
                      className="form-input"
                      style={{ width: "100%", paddingRight: "36px", fontSize: "13px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCanvasToken(!showCanvasToken)}
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: "4px",
                      }}
                      title={showCanvasToken ? "Hide token" : "Show token"}
                    >
                      {showCanvasToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestToken}
                    disabled={testingToken || !canvasToken.trim()}
                    className="secondary-button"
                    style={{ fontSize: "12px", fontWeight: "500", flexShrink: 0 }}
                  >
                    {testingToken ? <Loader2 size={13} className="retro-icon-spin" /> : <Key size={13} />}
                    <span>Test</span>
                  </button>
                </div>

                {tokenResult && (
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "8px 12px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor: tokenResult.valid ? "var(--success-bg)" : "var(--error-bg)",
                      color: tokenResult.valid ? "var(--success)" : "var(--error)",
                      border: `1px solid ${tokenResult.valid ? "var(--success)" : "var(--error)"}`,
                    }}
                  >
                    {tokenResult.valid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span>
                      {tokenResult.valid
                        ? `Connected to Canvas: ${tokenResult.name || "Active Session"}`
                        : tokenResult.error || "Token invalid."}
                    </span>
                  </div>
                )}
              </div>

              {/* Step by step instructions */}
              <div
                style={{
                  backgroundColor: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "12px 16px",
                  fontSize: "12px",
                  color: "var(--text)",
                  lineHeight: "1.6",
                }}
              >
                <div style={{ fontWeight: "600", marginBottom: "6px", color: "var(--text-h)" }}>
                  How to generate your token:
                </div>
                <ol style={{ margin: 0, paddingLeft: "18px", color: "var(--text-muted)" }}>
                  <li>Log in to Canvas at <a href="https://canvas.nus.edu.sg" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>canvas.nus.edu.sg <ExternalLink size={10} style={{ display: "inline" }} /></a></li>
                  <li>Click <strong>Account</strong> in the left sidebar → <strong>Settings</strong></li>
                  <li>Scroll down to <strong>Approved Integrations</strong></li>
                  <li>Click <strong>+ New Access Token</strong>, enter a label (e.g. <em>Canvenient</em>), and generate</li>
                  <li>Copy and paste the generated string above</li>
                </ol>
              </div>
            </div>
          )}

          {/* STEP 3: Appearance & Preferences */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)", margin: "0 0 6px 0" }}>
                  Workspace Appearance
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: "1.5" }}>
                  Choose your preferred color palette and navigation layout.
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "10px",
                  }}
                >
                  Theme Palette
                </label>
                <div
                  className="theme-picker"
                  role="radiogroup"
                  aria-label="Application theme"
                  style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}
                >
                  {THEMES.map(({ id, label, description, swatches }) => {
                    const active = selectedTheme === id;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={active ? "is-active" : ""}
                        key={id}
                        onClick={() => setSelectedTheme(id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          backgroundColor: active ? "var(--surface-hover)" : "var(--surface-muted)",
                          border: `1px solid ${active ? "var(--border-focus)" : "var(--border)"}`,
                          borderRadius: "4px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span className="theme-picker-preview" aria-hidden="true" style={{ display: "flex", gap: "2px" }}>
                          {swatches.map((swatch) => (
                            <i key={swatch} style={{ width: "8px", height: "18px", background: swatch, borderRadius: "2px", display: "inline-block" }} />
                          ))}
                        </span>
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-h)" }}>{label}</div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "8px",
                  }}
                >
                  Sidebar Navigation Mode
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  {[
                    { id: "hover", title: "Hover to expand", desc: "Compact 48px rail, expands on hover" },
                    { id: "pinned", title: "Always expanded", desc: "Pinned sidebar with full labels" },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        backgroundColor: sidebarMode === mode.id ? "var(--surface-hover)" : "var(--surface-muted)",
                        border: `1px solid ${sidebarMode === mode.id ? "var(--border-focus)" : "var(--border)"}`,
                        borderRadius: "4px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="radio"
                        name="sidebar-mode"
                        checked={sidebarMode === mode.id}
                        onChange={() => setSidebarMode(mode.id)}
                        style={{ marginTop: "3px" }}
                      />
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-h)" }}>{mode.title}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{mode.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Ready to Launch */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-h)", margin: "0 0 6px 0" }}>
                  Workspace Ready
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: "1.5" }}>
                  Here is a summary of your workspace configuration. You can change these anytime in Settings.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  backgroundColor: "var(--border)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "var(--surface)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Profile Name</span>
                  <strong style={{ fontSize: "13px", color: "var(--text-h)" }}>{name.trim() || "Student"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "var(--surface)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Canvas LMS</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: canvasToken.trim() ? "var(--success)" : "var(--text-muted)",
                      }}
                    />
                    <strong style={{ fontSize: "13px", color: "var(--text-h)" }}>
                      {canvasToken.trim() ? (tokenResult?.name ? `Connected (${tokenResult.name})` : "Key configured") : "Not configured"}
                    </strong>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "var(--surface)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Theme Palette</span>
                  <strong style={{ fontSize: "13px", color: "var(--text-h)", textTransform: "capitalize" }}>{selectedTheme}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "var(--surface)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Sidebar Mode</span>
                  <strong style={{ fontSize: "13px", color: "var(--text-h)", textTransform: "capitalize" }}>{sidebarMode}</strong>
                </div>
              </div>

              {submitError && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    backgroundColor: "var(--error-bg)",
                    color: "var(--error)",
                    border: "1px solid var(--error)",
                  }}
                >
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal footer with navigation actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--surface-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="secondary-button"
              style={{ fontSize: "13px", flexShrink: 0 }}
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            {step === 2 && !canvasToken.trim() && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="secondary-button"
                style={{ fontSize: "13px", color: "var(--text-muted)", flexShrink: 0 }}
              >
                Skip for now
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !name.trim()) return;
                  setStep((s) => s + 1);
                }}
                disabled={step === 1 && !name.trim()}
                className="primary-button"
                style={{
                  padding: "8px 18px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting}
                className="primary-button"
                style={{
                  padding: "8px 20px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="retro-icon-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Workspace</span>
                    <Check size={14} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
