const fs = require('fs');

// 1. Fix WorkspaceLayout.jsx
let wl = fs.readFileSync('frontend/src/components/WorkspaceLayout.jsx', 'utf8');

// Remove the old sidebar header completely
wl = wl.replace(
  /<header className="mac-sidebar-header".*?<\/header>/s,
  ''
);

// Ensure mac-app-container is the root and clean up global toolbar
const targetStart = `<div className="mac-app-container">`;
const replacementStart = `<div className="mac-app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg)' }}>
      <header className="mac-global-toolbar" data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', flexShrink: 0, gap: 16, borderBottom: '1px solid var(--border)' }}>
        <div className="mac-global-toolbar-window-controls" data-tauri-drag-region style={{ width: 72, height: '100%' }} />
        
        <div className="mac-global-toolbar-left" style={{ display: 'flex', alignItems: 'center' }}>
          {isSidebarVisible && (
            <button
              type="button"
              className="mac-toolbar-button"
              onClick={() => setAndPersistSidebarBehavior(sidebarBehavior === 'pinned' ? 'hover' : 'pinned')}
              title={sidebarBehavior === 'pinned' ? 'Use hover sidebar (Command+\\)' : 'Keep sidebar open (Command+\\)'}
            >
              {sidebarBehavior === 'pinned' ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          )}
          {sidebarBehavior === 'hidden' && (
            <button
              type="button"
              className="mac-toolbar-button"
              onClick={() => setAndPersistSidebarBehavior('hover')}
              title="Show sidebar"
            >
              <PanelLeft size={16} />
            </button>
          )}
        </div>
        
        <div className="mac-global-toolbar-center" data-tauri-drag-region style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {toolbarTitle && <div className="mac-toolbar-heading" style={{ fontSize: 13, fontWeight: 600 }}>{toolbarTitle}</div>}
          {!toolbarTitle && activeTab === 'dashboard' && <div className="mac-toolbar-heading" style={{ fontSize: 13, fontWeight: 600 }}>Dashboard</div>}
          
          <button type="button" className="mac-toolbar-search mac-toolbar-search-primary" onClick={() => setIsOmnibarOpen(true)}>
            <Search size={14} />
            <span>Search for anything…</span>
            <kbd>{formatShortcut(shortcuts.search)}</kbd>
          </button>
        </div>

        <div className="mac-global-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {toolbar?.actions}
        </div>
      </header>
      
      <div className="mac-workspace-shell" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>`;

wl = wl.replace(/<div className="mac-app-container">[\s\S]*?<div className="mac-workspace-shell">/, replacementStart);

fs.writeFileSync('frontend/src/components/WorkspaceLayout.jsx', wl);

// 2. Fix index.css (remove my added classes to avoid conflicts, since I use inline styles for the layout roots now)
let css = fs.readFileSync('frontend/src/index.css', 'utf8');

// Strip out the block I appended
const appendIndex = css.indexOf('/* Global Toolbar Added by Antigravity */');
if (appendIndex !== -1) {
  css = css.substring(0, appendIndex);
}

// Restore mac-workspace-shell in css
css = css.replace(
  '.mac-workspace-shell {\\n  width: 100vw;\\n  flex: 1;',
  '.mac-workspace-shell {\\n  width: 100vw;\\n  height: 100vh;' // wait, inline styles will override, but let's just make it normal
);

fs.writeFileSync('frontend/src/index.css', css);

console.log("Layout patched.");
