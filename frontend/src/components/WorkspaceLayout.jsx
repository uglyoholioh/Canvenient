import { useState, useEffect, useCallback } from "react";
import TaskView from "./TaskView";
import Omnibar from "./Omnibar";
import SettingsView from "./SettingsView";
import CanvasView from "./CanvasView";
import Dashboard from "./Dashboard";
import NotesView from "./NotesView";
import MarkdownEditor from "./MarkdownEditor";
import { appWindow } from "@tauri-apps/api/window";
import { Folder, Search, Settings, CheckSquare, PanelLeft, BookOpen, Plus, LogOut, LayoutDashboard, FileText, Pin, PinOff } from "lucide-react";
import { createNote } from "../api";

const handleKeyDownAction = (e, action) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
};

const getSidebarBehavior = () => {
  const stored = localStorage.getItem('canvenient-sidebar-mode');
  return ['hover', 'pinned', 'hidden'].includes(stored) ? stored : 'hover';
};

const NavItem = ({ icon: Icon, label, active, onClick, shortcut, isSlim }) => (
  <div 
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => handleKeyDownAction(e, onClick)}
    style={{ 
      padding: isSlim ? '10px 0' : '8px 12px', 
      borderRadius: '6px', 
      cursor: 'pointer', WebkitAppRegion: "no-drag", 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: isSlim ? 'center' : 'flex-start',
      gap: '12px', 
      backgroundColor: active ? 'var(--surface-hover)' : 'transparent', 
      color: active ? 'var(--text-h)' : 'var(--text-muted)',
      outline: 'none',
      marginBottom: '4px',
      transition: 'all 0.1s ease',
      fontWeight: active ? '500' : '400'
    }}
    onMouseEnter={e => { if(!active) e.currentTarget.style.color = 'var(--text-h)'; e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
    onMouseLeave={e => { if(!active) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
    title={isSlim ? label : undefined}
  >
    <Icon size={16} style={{ flexShrink: 0 }} />
    {!isSlim && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
    {!isSlim && shortcut && <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', backgroundColor: 'var(--surface-muted)', padding: '2px 6px', borderRadius: '4px' }}>{shortcut}</span>}
  </div>
);

export default function WorkspaceLayout({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isOmnibarOpen, setIsOmnibarOpen] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('canvenient-sidebar-width') || '250', 10));
  const [isDragging, setIsDragging] = useState(false);
  
  const [sidebarBehavior, setSidebarBehavior] = useState(getSidebarBehavior);

  useEffect(() => {
    const handleStorage = () => {
      setSidebarBehavior(getSidebarBehavior());
      setSidebarWidth(parseInt(localStorage.getItem('canvenient-sidebar-width') || '250', 10));
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('settings-updated', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('settings-updated', handleStorage);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOmnibarOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarBehavior(current => {
          const next = current === 'pinned' ? 'hover' : 'pinned';
          localStorage.setItem('canvenient-sidebar-mode', next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      const newWidth = Math.max(150, Math.min(e.clientX, 600));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem('canvenient-sidebar-width', sidebarWidth.toString());
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, sidebarWidth]);

  const isSidebarVisible = sidebarBehavior !== 'hidden';
  const isSidebarExpanded = sidebarBehavior === 'pinned' || (sidebarBehavior === 'hover' && isSidebarHovered) || isDragging;
  const currentSidebarWidth = !isSidebarVisible ? 0 : (isSidebarExpanded ? sidebarWidth : 58);
  const layoutSidebarWidth = !isSidebarVisible ? 0 : (sidebarBehavior === 'pinned' ? sidebarWidth : 58);
  const isSlim = isSidebarVisible && !isSidebarExpanded;

  const setAndPersistSidebarBehavior = (behavior) => {
    localStorage.setItem('canvenient-sidebar-mode', behavior);
    setSidebarBehavior(behavior);
    setIsSidebarHovered(false);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      {/* Sidebar rail. Hover expansion overlays the workspace instead of shifting it. */}
      <div style={{ width: layoutSidebarWidth, position: 'relative', flexShrink: 0, zIndex: 20, transition: isDragging ? 'none' : 'width 0.18s ease' }}>
      <div
        onMouseEnter={() => { if (sidebarBehavior === 'hover') setIsSidebarHovered(true); }}
        onMouseLeave={() => { if (sidebarBehavior === 'hover' && !isDragging) setIsSidebarHovered(false); }}
        style={{ 
        width: currentSidebarWidth + 'px', 
        position: 'absolute',
        inset: '0 auto 0 0',
        borderRight: isSidebarVisible ? '1px solid var(--border-subtle)' : 'none', 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundColor: 'var(--surface)',
        transition: isDragging ? 'none' : 'width 0.2s ease, border-right 0.2s ease',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        boxShadow: isSidebarExpanded && sidebarBehavior === 'hover' ? '10px 0 28px rgba(0,0,0,.22)' : 'none',
        zIndex: 20
      }}>
        {/* Header / Logo */}
        <div style={{ padding: '16px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: isSlim ? 'center' : 'space-between' , WebkitAppRegion: "drag" }} onMouseDown={(e) => { if (e.target === e.currentTarget) appWindow.startDragging(); }}>
          {!isSlim && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent)', flexShrink: 0 }}></div>
              <span style={{ fontStyle: 'italic', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-h)', fontSize: '15px' }}>canvenient.</span>
            </div>
          )}
          
          {/* Pin control */}
          {isSidebarVisible && (
            <button 
              tabIndex={0}
              onClick={() => setAndPersistSidebarBehavior(sidebarBehavior === 'pinned' ? 'hover' : 'pinned')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', WebkitAppRegion: "no-drag", padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', outline: 'none' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              title={sidebarBehavior === 'pinned' ? 'Unpin sidebar (Cmd+\\)' : 'Pin sidebar (Cmd+\\)'}
              aria-label={sidebarBehavior === 'pinned' ? 'Unpin sidebar' : 'Pin sidebar'}
            >
              {sidebarBehavior === 'pinned' ? <PinOff size={17} /> : <Pin size={17} />}
            </button>
          )}
        </div>
        
        <div style={{ flex: 1, padding: isSlim ? '8px' : '12px', overflowY: 'auto' }}>
          {!isSlim && <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px', marginTop: '8px', fontWeight: '600', letterSpacing: '1px', paddingLeft: '4px' }}>Views</div>}
          
          <NavItem isSlim={isSlim} icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab("dashboard")} />
          <NavItem isSlim={isSlim} icon={CheckSquare} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab("tasks")} />
          <NavItem isSlim={isSlim} icon={BookOpen} label="Canvas LMS" active={activeTab === 'canvas'} onClick={() => setActiveTab("canvas")} />
          <NavItem isSlim={isSlim} icon={FileText} label="Notes" active={activeTab === 'notes' || activeTab.startsWith('note-')} onClick={() => setActiveTab("notes")} />
          <NavItem isSlim={isSlim} icon={Search} label="Search" active={false} onClick={() => setIsOmnibarOpen(true)} shortcut="Cmd+K" />

          {!isSlim && <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '32px', marginBottom: '12px', fontWeight: '600', letterSpacing: '1px', paddingLeft: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Folders
            <button onClick={() => alert('Folder creation coming soon!')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', WebkitAppRegion: "no-drag" }}><Plus size={14}/></button>
          </div>}
          
          <NavItem isSlim={isSlim} icon={Folder} label="Empty Workspace" active={false} onClick={() => alert('Click the + button to create a folder. Feature coming soon!')} />
          <div style={{ marginTop: "16px" }}>
            <NavItem isSlim={isSlim} icon={Plus} label="New Note" active={false} onClick={async () => { 
              const n = await createNote({title: "Untitled", content: ""}, token); 
              setActiveTab("note-" + n.id); 
            }} />
          </div>
        </div>

        <div style={{ padding: isSlim ? '12px 8px' : '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <NavItem isSlim={isSlim} icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab("settings")} />
          <div style={{marginTop: "8px"}}><NavItem isSlim={isSlim} icon={LogOut} label="Logout" active={false} onClick={onLogout} /></div>
        </div>
        
        {/* Resize Handle */}
        {sidebarBehavior === 'pinned' && (
          <div 
            onMouseDown={handleMouseDown}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '4px',
              cursor: 'col-resize',
              backgroundColor: isDragging ? 'var(--accent)' : 'transparent',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            onMouseLeave={e => { if(!isDragging) e.currentTarget.style.backgroundColor = 'transparent'; }}
          />
        )}
      </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Tabs Bar */}
        <div style={{ display: 'flex', alignItems: 'center', height: '60px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface)', padding: '0 16px' , WebkitAppRegion: "drag" }} onMouseDown={(e) => { if (e.target === e.currentTarget) appWindow.startDragging(); }}>
          
          {/* Restore control when the sidebar is fully hidden in Settings. */}
          {sidebarBehavior === 'hidden' && (
            <button 
              tabIndex={0}
              onClick={() => setAndPersistSidebarBehavior('hover')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', WebkitAppRegion: "no-drag", padding: '8px', marginRight: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none', borderRadius: '4px' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Show sidebar"
              aria-label="Show sidebar"
            >
              <PanelLeft size={18} />
            </button>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <div style={{ padding: '0 16px', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--accent)', color: 'var(--text-h)', fontSize: '13px', fontWeight: '500' }}>
              {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'tasks' ? 'Tasks' : activeTab === 'settings' ? 'Settings' : activeTab === 'canvas' ? 'Canvas LMS' : activeTab === 'notes' ? 'Notes' : 'Note Editor'}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeTab === 'dashboard' && <Dashboard token={token} user={user} onNavigate={setActiveTab} />}
          {activeTab === 'tasks' && <TaskView token={token} user={user} />}
          {activeTab === 'settings' && <SettingsView token={token} user={user} />}
          {activeTab === 'canvas' && <CanvasView token={token} />}
          {activeTab === 'notes' && <NotesView token={token} />}
          {activeTab.startsWith('note-') && <MarkdownEditor key={activeTab} noteId={activeTab.split('-')[1]} token={token} />}
        </div>
      </div>

      {isOmnibarOpen && <Omnibar onClose={() => setIsOmnibarOpen(false)} token={token} onNavigate={(type, item) => {
        if (type === 'note') {
          setActiveTab('note-' + item.id);
        }
        setIsOmnibarOpen(false);
      }} />}
    </div>
  );
}
