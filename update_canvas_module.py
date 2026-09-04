import re

with open("frontend/src/components/dashboard/CanvasModule.jsx", "r") as f:
    content = f.read()

# Make triage button always visible and text "Inbox"
old_triage_btn = """        {unreadAnnouncementsCount > 0 && (
          <button
            type="button"
            className="canvas-triage-trigger-btn"
            onClick={() => setShowTriage(true)}
            title="Open Announcements Triage Inbox"
          >
            <Inbox size={11} />
            <span>Triage ({unreadAnnouncementsCount})</span>
          </button>
        )}"""

new_triage_btn = """        <button
          type="button"
          className="canvas-triage-trigger-btn"
          onClick={() => setShowTriage(true)}
          title="Open Canvas Inbox"
          style={{ background: unreadAnnouncementsCount > 0 ? "var(--accent)" : "var(--surface-muted)", color: unreadAnnouncementsCount > 0 ? "var(--text-inverse)" : "var(--text-muted)" }}
        >
          <Inbox size={11} />
          <span>Inbox {unreadAnnouncementsCount > 0 ? `(${unreadAnnouncementsCount})` : ""}</span>
        </button>"""

content = content.replace(old_triage_btn, new_triage_btn)

with open("frontend/src/components/dashboard/CanvasModule.jsx", "w") as f:
    f.write(content)
print("CanvasModule.jsx updated successfully.")
