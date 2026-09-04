with open("frontend/src/index.css", "r") as f:
    css = f.read()

# Replace .triage-modal-backdrop properties
new_backdrop = """.triage-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}"""

import re
css = re.sub(r'\.triage-modal-backdrop\s*\{[^}]*\}', new_backdrop, css)

new_container = """.triage-modal-container {
  width: min(850px, 85vw);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border-strong);
  box-shadow: -16px 0 50px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: drawer-in 0.2s ease-out;
}"""
css = re.sub(r'\.triage-modal-container\s*\{[^}]*\}', new_container, css)

with open("frontend/src/index.css", "w") as f:
    f.write(css)
print("CSS updated successfully.")
