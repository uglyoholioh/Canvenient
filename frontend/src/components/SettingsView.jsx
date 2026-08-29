import { useState, useEffect } from "react";
import { Moon, Sun, Monitor, Database, Keyboard, PanelLeft, MoveHorizontal } from "lucide-react";

const getSidebarBehavior = () => {
  const stored = localStorage.getItem('canvenient-sidebar-mode');
  return ['hover', 'pinned', 'hidden'].includes(stored) ? stored : 'hover';
};

export default function SettingsView() {
  const [theme, setTheme] = useState(localStorage.getItem('canvenient-theme') || 'system');
  const [sidebarBehavior, setSidebarBehavior] = useState(getSidebarBehavior);
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('canvenient-sidebar-width') || '250', 10));
  const [checkboxStyle, setCheckboxStyle] = useState(localStorage.getItem('canvenient-checkbox-style') || 'brackets');
  const [defaultMode, setDefaultMode] = useState(localStorage.getItem('canvenient-default-mode') || 'task');
  const [canvasToken, setCanvasToken] = useState("");

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

  const handleDefaultModeChange = (e) => {
    const val = e.target.value;
    setDefaultMode(val);
    localStorage.setItem('canvenient-default-mode', val);
    window.dispatchEvent(new Event('settings-updated'));
  };

  const handleChangeHotkey = () => {
    alert("Customizing the global hotkey is currently unsupported by the native backend. This will be added in a future update!");
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--surface)' }}>
            <div>
              <div style={{ color: 'var(--text-h)', fontWeight: '500' }}>Default Input Mode</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>The starting mode of the main input bar</div>
            </div>
            <select 
              value={defaultMode} 
              onChange={handleDefaultModeChange}
              style={{ padding: '6px 12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: '4px', color: 'var(--text-h)', outline: 'none', cursor: 'pointer' }}
              tabIndex={0}
            >
              <option value="command">Command Mode</option>
              <option value="task">Task Mode</option>
              <option value="note">Note Mode</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--surface)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ padding: '8px', backgroundColor: 'var(--surface-muted)', borderRadius: '4px', color: 'var(--text-muted)' }}>
                <Keyboard size={20} />
              </div>
              <div>
                <div style={{ color: 'var(--text-h)', fontWeight: '500' }}>Global Hotkey</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Shortcut to instantly show/hide the app</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ padding: '6px 12px', backgroundColor: 'var(--surface-muted)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)', border: '1px solid var(--border-strong)' }}>
                Cmd + J
              </div>
              <button 
                onClick={handleChangeHotkey}
                style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-h)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
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
