const fs = require('fs');

let css = fs.readFileSync('frontend/src/index.css', 'utf8');

// Add the missing Canvas CSS and Sidebar Slim CSS
const fixes = `
/* Fix slim sidebar text pushing icons */
.mac-source-row.is-slim .mac-source-row-label,
.mac-source-row.is-slim .mac-source-row-shortcut {
  display: none;
}

/* Fix Canvas compact rows that were rendering as white native buttons */
.canvas-compact-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.canvas-compact-row {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 44px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.canvas-compact-row:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}
.canvas-compact-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.canvas-course-code {
  flex: none;
  font-size: 9px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-glow);
  padding: 3px 6px;
  border-radius: 4px;
}
.canvas-row-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.canvas-row-copy strong {
  font-size: 11px;
  color: var(--text-h);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.canvas-row-copy small {
  font-size: 9px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.canvas-row-action {
  flex: none;
  width: 32px;
  border: 0;
  border-left: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}
.canvas-row-action:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-h);
}
.canvas-row-action:disabled {
  opacity: 0.5;
  cursor: default;
}
`;

css = css + '\n' + fixes;
fs.writeFileSync('frontend/src/index.css', css);

console.log("CSS patched.");
