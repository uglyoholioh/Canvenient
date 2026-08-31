import { useState, useEffect } from "react";
import { Moon, Sun, Monitor, Database, Keyboard, PanelLeft, MoveHorizontal, Palette, Loader2 } from "lucide-react";
import DashboardCustomizer from "./dashboard/DashboardCustomizer";
import { readDashboardConfig, readDashboardLayout, saveDashboardConfig, saveDashboardLayout } from "./dashboard/dashboardConfig";
import { applyModulePalette, getModuleColors, updateModuleColor } from "../api";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatShortcut,
  readKeyboardShortcuts,
  saveKeyboardShortcuts,
  shortcutFromKeyboardEvent,
} from "../keyboardShortcuts";

const getSidebarBehavior = () => {
  const stored = localStorage.getItem('canvenient-sidebar-mode');
  return ['hover', 'pinned', 'hidden'].includes(stored) ? stored : 'hover';
};

function ShortcutRecorder({ allowShiftOnly = false, description, label, onChange, onReset, value }) {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = (event) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(false);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      onReset();
      setRecording(false);
      return;
    }
    const next = shortcutFromKeyboardEvent(event);
    const hasModifier = event.metaKey || event.ctrlKey || event.altKey || (allowShiftOnly && event.shiftKey);
    if (!next || (!hasModifier && !/^F\d{1,2}$/.test(event.key))) return;
    onChange(next);
    setRecording(false);
  };

  return (
    <div className="settings-shortcut-row">
      <div><strong>{label}</strong><small>{description}</small></div>
      <div className="settings-shortcut-actions">
        <button
          type="button"
          className={recording ? "is-recording" : ""}
          aria-label={recording ? `Recording ${label}` : `Change ${label}`}
          onClick={() => setRecording(true)}
          onKeyDown={handleKeyDown}
        >{recording ? "Press shortcut…" : formatShortcut(value)}</button>
        <button type="button" className="settings-shortcut-reset" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}

export default function SettingsView({ token }) {
  const [theme, setTheme] = useState(localStorage.getItem('canvenient-theme') || 'system');
  const [sidebarBehavior, setSidebarBehavior] = useState(getSidebarBehavior);
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('canvenient-sidebar-width') || '250', 10));
  const [checkboxStyle, setCheckboxStyle] = useState(localStorage.getItem('canvenient-checkbox-style') || 'brackets');
  const [shortcutConfig, setShortcutConfig] = useState(readKeyboardShortcuts);
  const [shortcutError, setShortcutError] = useState("");
  const [canvasToken, setCanvasToken] = useState("");
  const [dashboardLayout, setDashboardLayout] = useState(readDashboardLayout);
  const [dashboardConfig, setDashboardConfig] = useState(readDashboardConfig);
  const [moduleColors, setModuleColors] = useState({ active_palette: "balanced", palettes: [], modules: [] });
  const [moduleColorsLoading, setModuleColorsLoading] = useState(true);
  const [moduleColorsSaving, setModuleColorsSaving] = useState("");
  const [moduleColorsError, setModuleColorsError] = useState("");

  useEffect(() => {
    if (!token) return;
    getModuleColors(token)
      .then(setModuleColors)
      .catch((error) => setModuleColorsError(error.message || "Could not load course colours."))
      .finally(() => setModuleColorsLoading(false));
  }, [token]);

  useEffect(() => {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('canvenient-theme', theme);
  }, [theme]);

  const handleSidebarBehaviorChange = (e) => {
    const val = e.target.value;
    setSidebarBehavior(val);
    localStorage.setItem('canvenient-sidebar-mode', val);
    window.dispatchEvent(new Event('settings-updated'));
  };

  const handleSidebarWidthChange = (e) => {
    const val = Number(e.target.value);
    setSidebarWidth(val);
    localStorage.setItem('canvenient-sidebar-width', String(val));
    window.dispatchEvent(new Event('settings-updated'));
  };

  const handleCheckboxStyleChange = (e) => {
    const val = e.target.value;
    setCheckboxStyle(val);
    localStorage.setItem('canvenient-checkbox-style', val);
    window.dispatchEvent(new Event('settings-updated'));
  };

  const handleDashboardLayoutChange = (layout) => {
    setDashboardLayout(layout);
    saveDashboardLayout(layout);
  };

  const handleDashboardConfigChange = (config) => {
    setDashboardConfig(config);
    saveDashboardConfig(config);
  };

  const handlePaletteChange = async (palette) => {
    setModuleColorsSaving(`palette:${palette}`);
    setModuleColorsError("");
    try {
      setModuleColors(await applyModulePalette(token, palette));
      window.dispatchEvent(new Event("module-colors-updated"));
    } catch (error) {
      setModuleColorsError(error.message || "Could not apply that palette.");
    } finally {
      setModuleColorsSaving("");
    }
  };

  const handleModuleColorChange = async (moduleCode, color) => {
    setModuleColorsSaving(`module:${moduleCode}`);
    setModuleColorsError("");
    try {
      setModuleColors(await updateModuleColor(token, moduleCode, color));
      window.dispatchEvent(new Event("module-colors-updated"));
    } catch (error) {
      setModuleColorsError(error.message || "Could not update that course colour.");
    } finally {
      setModuleColorsSaving("");
    }
  };

  const updateShortcut = (name, value) => {
    const duplicate = Object.entries(shortcutConfig).find(([key, shortcut]) => key !== name && typeof shortcut === "string" && shortcut === value);
    if (duplicate) {
      const labels = { tasksPanel: "Tasks panel", quickTask: "New task", quickNote: "Quick note", search: "Search" };
      setShortcutError(`${formatShortcut(value)} is already assigned to ${labels[duplicate[0]]}.`);
      return;
    }
    setShortcutError("");
    setShortcutConfig((current) => saveKeyboardShortcuts({ ...current, [name]: value }));
  };

  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', width: '100%', overflowY: 'auto', height: '100%' }} tabIndex={-1}>
      <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '24px', fontFamily: 'var(--font-mono)' }}>Settings</h1>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', letterSpacing: '1px' }}>Appearance</h2>
        
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <button 
            onClick={() => setTheme('light')}
            tabIndex={0}
            style={{ flex: 1, padding: '16px', borderRadius: '8px', border: `1px solid ${theme === 'light' ? 'var(--accent)' : 'var(--border-strong)'}`, backgroundColor: 'var(--surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', outline: 'none', transition: 'all 0.2s ease' }}
          >
            <Sun size={24} color={theme === 'light' ? 'var(--accent)' : 'var(--text-muted)'} />
            <span style={{ color: theme === 'light' ? 'var(--text-h)' : 'var(--text)' }}>Light</span>
          </button>

          <button 
            onClick={() => setTheme('dark')}
            tabIndex={0}
            style={{ flex: 1, padding: '16px', borderRadius: '8px', border: `1px solid ${theme === 'dark' ? 'var(--accent)' : 'var(--border-strong)'}`, backgroundColor: 'var(--surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', outline: 'none', transition: 'all 0.2s ease' }}
          >
            <Moon size={24} color={theme === 'dark' ? 'var(--accent)' : 'var(--text-muted)'} />
            <span style={{ color: theme === 'dark' ? 'var(--text-h)' : 'var(--text)' }}>Dark</span>
          </button>

          <button 
            onClick={() => setTheme('system')}
            tabIndex={0}
            style={{ flex: 1, padding: '16px', borderRadius: '8px', border: `1px solid ${theme === 'system' ? 'var(--accent)' : 'var(--border-strong)'}`, backgroundColor: 'var(--surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', outline: 'none', transition: 'all 0.2s ease' }}
          >
            <Monitor size={24} color={theme === 'system' ? 'var(--accent)' : 'var(--text-muted)'} />
            <span style={{ color: theme === 'system' ? 'var(--text-h)' : 'var(--text)' }}>System</span>
          </button>
        </div>
      </section>

      <section className="settings-course-colors">
        <div className="settings-section-heading">
          <div><Palette size={15} /><h2>Course colours</h2></div>
          <p>One colour per module, shared by Schedule and Canvas.</p>
        </div>

        {moduleColorsLoading ? (
          <div className="settings-colors-state"><Loader2 size={15} className="retro-icon-spin" />Loading courses</div>
        ) : (
          <div className="settings-colors-panel">
            <div className="settings-palette-list" role="radiogroup" aria-label="Course colour palette">
              {moduleColors.palettes.map((palette) => {
                const active = moduleColors.active_palette === palette.id;
                const saving = moduleColorsSaving === `palette:${palette.id}`;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={active ? "is-active" : ""}
                    key={palette.id}
                    disabled={Boolean(moduleColorsSaving)}
                    onClick={() => handlePaletteChange(palette.id)}
                  >
                    <span className="settings-palette-swatches" aria-hidden="true">
                      {palette.colors.slice(0, 5).map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                    </span>
                    <strong>{palette.name}</strong>
                    {saving && <Loader2 size={12} className="retro-icon-spin" />}
                  </button>
                );
              })}
            </div>

            <div className="settings-module-colors">
              {moduleColors.modules.length ? moduleColors.modules.map((module) => (
                <label key={module.module_code}>
                  <span className="settings-module-swatch" style={{ backgroundColor: module.color }} />
                  <span><strong>{module.module_code}</strong><small>{module.module_name}</small></span>
                  <input
                    type="color"
                    value={module.color}
                    disabled={Boolean(moduleColorsSaving)}
                    onChange={(event) => handleModuleColorChange(module.module_code, event.target.value)}
                    aria-label={`Change ${module.module_code} colour`}
                  />
                </label>
              )) : <div className="settings-colors-empty">Import a timetable or connect Canvas to add courses.</div>}
            </div>
          </div>
        )}
        {moduleColorsError && <div className="settings-colors-error">{moduleColorsError}</div>}
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', letterSpacing: '1px' }}>Dashboard</h2>
        <div style={{ padding: '16px', backgroundColor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '8px' }}>
          <DashboardCustomizer layout={dashboardLayout} config={dashboardConfig} onLayoutChange={handleDashboardLayoutChange} onConfigChange={handleDashboardConfigChange} />
        </div>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', letterSpacing: '1px' }}>Preferences</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', backgroundColor: 'var(--border-strong)', border: '1px solid var(--border-strong)', borderRadius: '8px', overflow: 'hidden' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--surface)' }}>
            <div>
              <div style={{ color: 'var(--text-h)', fontWeight: '500' }}>Task Checkbox Style</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>How checkmarks are displayed</div>
            </div>
            <select 
              value={checkboxStyle} 
              onChange={handleCheckboxStyleChange}
              style={{ padding: '6px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: '4px', color: 'var(--text-h)', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
              tabIndex={0}
            >
              <option value="brackets">[ ] Brackets</option>
              <option value="circle">( ) Circle</option>
              <option value="icon">✓ Icon</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--surface)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ padding: '8px', backgroundColor: 'var(--surface-muted)', borderRadius: '4px', color: 'var(--text-muted)' }}><PanelLeft size={20} /></div>
              <div>
                <div style={{ color: 'var(--text-h)', fontWeight: '500' }}>Sidebar Behavior</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose how the workspace navigation expands</div>
              </div>
            </div>
            <select 
              value={sidebarBehavior} 
              onChange={handleSidebarBehaviorChange}
              style={{ padding: '6px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: '4px', color: 'var(--text-h)', outline: 'none', cursor: 'pointer' }}
              tabIndex={0}
            >
              <option value="hover">Hover to Expand</option>
              <option value="pinned">Always Expanded</option>
              <option value="hidden">Fully Hidden</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--surface)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ padding: '8px', backgroundColor: 'var(--surface-muted)', borderRadius: '4px', color: 'var(--text-muted)' }}><MoveHorizontal size={20} /></div>
              <div>
                <div style={{ color: 'var(--text-h)', fontWeight: '500' }}>Expanded Sidebar Width</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Width used while pinned or hovered</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="range" min="190" max="420" step="10" value={sidebarWidth} onChange={handleSidebarWidthChange} aria-label="Expanded sidebar width" />
              <span style={{ width: '48px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'right' }}>{sidebarWidth}px</span>
            </div>
          </div>

        </div>
      </section>

      <section className="settings-shortcuts-section">
        <div className="settings-section-heading">
          <div><Keyboard size={15} /><h2>Keyboard shortcuts</h2></div>
          <p>Click a shortcut, then press the replacement. Changes apply immediately.</p>
        </div>
        <div className="settings-shortcuts-panel">
          <ShortcutRecorder allowShiftOnly label="Tasks panel" description="Toggle the full Tasks panel from anywhere" value={shortcutConfig.tasksPanel} onChange={(value) => updateShortcut("tasksPanel", value)} onReset={() => updateShortcut("tasksPanel", DEFAULT_KEYBOARD_SHORTCUTS.tasksPanel)} />
          <ShortcutRecorder label="New task" description="Open the Tasks panel and focus its composer" value={shortcutConfig.quickTask} onChange={(value) => updateShortcut("quickTask", value)} onReset={() => updateShortcut("quickTask", DEFAULT_KEYBOARD_SHORTCUTS.quickTask)} />
          <ShortcutRecorder label="Quick note" description="Open the note capture dock" value={shortcutConfig.quickNote} onChange={(value) => updateShortcut("quickNote", value)} onReset={() => updateShortcut("quickNote", DEFAULT_KEYBOARD_SHORTCUTS.quickNote)} />
          <ShortcutRecorder label="Search" description="Open workspace search" value={shortcutConfig.search} onChange={(value) => updateShortcut("search", value)} onReset={() => updateShortcut("search", DEFAULT_KEYBOARD_SHORTCUTS.search)} />
        </div>
        {shortcutError && <div className="settings-shortcut-error" role="alert">{shortcutError}</div>}
        <p className="settings-shortcut-footnote">The system-wide show/hide shortcut remains ⌘J.</p>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', letterSpacing: '1px' }}>Integrations</h2>
        
        <div style={{ backgroundColor: 'var(--surface-muted)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '8px', backgroundColor: 'var(--accent)', borderRadius: '4px', color: 'var(--bg)' }}>
              <Database size={20} />
            </div>
            <div>
              <div style={{ fontWeight: '600', color: 'var(--text-h)' }}>Canvas LMS Sync</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Automatically pull assignments and announcements into your workspace.</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="password" 
              placeholder="Canvas API Token..." 
              value={canvasToken}
              onChange={e => setCanvasToken(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg)', color: 'var(--text-h)', outline: 'none' }}
              tabIndex={0}
            />
            <button 
              tabIndex={0} 
              style={{ padding: '0 20px', backgroundColor: 'var(--text-h)', color: 'var(--bg)', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', outline: 'none' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Save
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
