// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import TaskView from "./TaskView";
import TaskInputBar from "./TaskInputBar";
import GlobalTasksPanel from "./GlobalTasksPanel";
import Omnibar from "./Omnibar";
import SettingsView from "./SettingsView";
import CanvasView from "./CanvasView";
import Dashboard from "./Dashboard";
import NotesView from "./NotesView";
import Schedule from "./Schedule";
import MarkdownEditor from "./MarkdownEditor";
import { WorkspaceToolbarContext } from "./WorkspaceToolbarContext";
import { QuickCaptureContext } from "./QuickCaptureContext";
import { Folder, Search, Settings, CheckSquare, PanelLeft, PanelLeftClose, PanelLeftOpen, BookOpen, Plus, LogOut, LayoutDashboard, FileText, CalendarDays } from "lucide-react";
import { createNote } from "../api";
import { formatShortcut, matchesShortcut, readKeyboardShortcuts } from "../keyboardShortcuts";

const getSidebarBehavior = () => {
  const stored = localStorage.getItem('canvenient-sidebar-mode');
  return ['hover', 'pinned', 'hidden'].includes(stored) ? stored : 'hover';
};

const getInitialView = () => {
  const stored = localStorage.getItem("canvenient-active-view") || "dashboard";
  return ["dashboard", "tasks", "schedule", "settings", "canvas", "notes"].includes(stored) || /^note-\d+$/.test(stored)
    ? stored
    : "dashboard";
};

const NavItem = ({ icon: Icon, label, active, onClick, shortcut, isSlim }) => (
  <button
    type="button"
    className={`mac-source-row ${active ? "is-active" : ""} ${isSlim ? "is-slim" : ""}`}
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    title={isSlim ? label : undefined}
  >
    <Icon size={16} style={{ flexShrink: 0 }} />
    {!isSlim && <span>{label}</span>}
    {!isSlim && shortcut && <kbd>{shortcut}</kbd>}
  </button>
);

const viewTitle = (activeTab) => {
  if (activeTab === "dashboard") return "Dashboard";
  if (activeTab === "tasks") return "Tasks";
  if (activeTab === "schedule") return "Schedule";
  if (activeTab === "settings") return "Settings";
  if (activeTab === "canvas") return "Canvas";
  if (activeTab === "notes") return "Notes";
  return "Note";
};

export default function WorkspaceLayout({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState(getInitialView);
  const [isOmnibarOpen, setIsOmnibarOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [toolbar, setToolbar] = useState(null);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [shortcuts, setShortcuts] = useState(readKeyboardShortcuts);
  const [tasksPanel, setTasksPanel] = useState({ isOpen: false, focusComposer: false });
  const [quickCapture, setQuickCapture] = useState({ isOpen: false });
  const tasksPanelReturnFocus = useRef(null);
  const quickCaptureReturnFocus = useRef(null);
  
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('canvenient-sidebar-width') || '250', 10));
  const [isDragging, setIsDragging] = useState(false);
  
  const [sidebarBehavior, setSidebarBehavior] = useState(getSidebarBehavior);

  const closeTasksPanel = useCallback((restoreFocus = true) => {
    setTasksPanel({ isOpen: false, focusComposer: false });
    if (restoreFocus) requestAnimationFrame(() => tasksPanelReturnFocus.current?.focus?.());
  }, []);

  const openTasksPanel = useCallback((options = {}) => {
    if (!tasksPanel.isOpen) {
      tasksPanelReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setTasksPanel({ isOpen: true, focusComposer: Boolean(options.focusComposer) });
    if (options.focusComposer) {
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("canvenient-focus-task-input")));
    }
  }, [tasksPanel.isOpen]);

  const toggleTasksPanel = useCallback(() => {
    if (tasksPanel.isOpen) closeTasksPanel();
    else openTasksPanel();
  }, [closeTasksPanel, openTasksPanel, tasksPanel.isOpen]);

  const openQuickCapture = useCallback((options = {}) => {
    if (options.mode !== "note") {
      openTasksPanel({ focusComposer: true });
      return;
    }
    quickCaptureReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuickCapture({ isOpen: true });
  }, [openTasksPanel]);

  const closeQuickCapture = useCallback(() => {
    setQuickCapture({ isOpen: false });
    requestAnimationFrame(() => quickCaptureReturnFocus.current?.focus?.());
  }, []);

  const quickCaptureValue = useMemo(() => ({
    isOpen: quickCapture.isOpen,
    openQuickCapture,
    closeQuickCapture,
  }), [closeQuickCapture, openQuickCapture, quickCapture.isOpen]);

  useEffect(() => {
    localStorage.setItem("canvenient-active-view", activeTab);
  }, [activeTab]);

  const createAndOpenNote = useCallback(async () => {
    const note = await createNote({ title: "Untitled", content: "" }, token);
    setActiveTab(`note-${note.id}`);
  }, [token]);

  useEffect(() => {
    const handleStorage = () => {
      setSidebarBehavior(getSidebarBehavior());
      setSidebarWidth(parseInt(localStorage.getItem('canvenient-sidebar-width') || '250', 10));
      setShortcuts(readKeyboardShortcuts());
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('settings-updated', handleStorage);
    window.addEventListener('keyboard-shortcuts-updated', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('settings-updated', handleStorage);
      window.removeEventListener('keyboard-shortcuts-updated', handleStorage);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.key === "Escape") {
        setIsShortcutHelpOpen(false);
        if (tasksPanel.isOpen) closeTasksPanel();
      }
      if (matchesShortcut(e, shortcuts.tasksPanel)) {
        if (tasksPanel.isOpen && e.target.closest?.(".global-tasks-panel")) return;
        e.preventDefault();
        toggleTasksPanel();
        return;
      }
      if (matchesShortcut(e, shortcuts.quickNote)) {
        e.preventDefault();
        openQuickCapture({ mode: "note" });
        return;
      }
      if (matchesShortcut(e, shortcuts.quickTask)) {
        e.preventDefault();
        openQuickCapture({ mode: "task" });
        return;
      }
      if (matchesShortcut(e, shortcuts.search)) {
        e.preventDefault();
        setIsOmnibarOpen(true);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (e.key === '\\') {
        e.preventDefault();
        setSidebarBehavior(current => {
          const next = current === 'pinned' ? 'hover' : 'pinned';
          localStorage.setItem('canvenient-sidebar-mode', next);
          return next;
        });
      }
      if (window.__TAURI_IPC__) return;
      const viewShortcuts = { "1": "dashboard", "2": "tasks", "3": "schedule", "4": "canvas", "5": "notes" };
      if (viewShortcuts[e.key]) { e.preventDefault(); setActiveTab(viewShortcuts[e.key]); }
      if (key === "o") {
        e.preventDefault(); setActiveTab("schedule");
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("canvenient-open-schedule-import")), 0);
      }
      if (key === ",") { e.preventDefault(); setActiveTab("settings"); }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [closeTasksPanel, openQuickCapture, shortcuts, tasksPanel.isOpen, toggleTasksPanel]);

  useEffect(() => {
    let disposed = false;
    const cleanups = [];

    const runMenuAction = async (action) => {
      const views = {
        "view-dashboard": "dashboard",
        "view-tasks": "tasks",
        "view-schedule": "schedule",
        "view-canvas": "canvas",
        "view-notes": "notes",
        settings: "settings",
      };
      if (views[action]) setActiveTab(views[action]);
      if (action === "search") setIsOmnibarOpen(true);
      if (action === "toggle-sidebar") {
        setSidebarBehavior((current) => {
          const next = current === "hidden" ? "hover" : "hidden";
          localStorage.setItem("canvenient-sidebar-mode", next);
          return next;
        });
      }
      if (action === "new-note") openQuickCapture({ mode: "note" });
      if (action === "new-task") openQuickCapture({ mode: "task" });
      if (action === "import-timetable") {
        setActiveTab("schedule");
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("canvenient-open-schedule-import")), 0);
      }
      if (action === "keyboard-shortcuts") setIsShortcutHelpOpen(true);
    };

    if (window.__TAURI_IPC__) {
      Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/tauri")]).then(async ([eventApi, tauriApi]) => {
        if (disposed) return;
        cleanups.push(await eventApi.listen("menu-action", ({ payload }) => runMenuAction(payload)));
        cleanups.push(await eventApi.listen("calendar-files-ready", async () => {
          const queued = await tauriApi.invoke("take_pending_calendar_files");
          if (queued?.length) {
            setActiveTab("schedule");
            window.setTimeout(() => window.dispatchEvent(new CustomEvent("canvenient-import-ics-paths", { detail: queued })), 0);
          }
        }));
        const pending = await tauriApi.invoke("take_pending_calendar_files");
        if (pending?.length) {
          setActiveTab("schedule");
          window.setTimeout(() => window.dispatchEvent(new CustomEvent("canvenient-import-ics-paths", { detail: pending })), 0);
        }
      }).catch((error) => console.error("Could not attach native app events", error));
    }

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [openQuickCapture]);

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

  const handleSidebarKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = Array.from(event.currentTarget.querySelectorAll(".mac-source-row:not(:disabled)"));
    if (!rows.length) return;
    event.preventDefault();
    const currentIndex = rows.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + rows.length) % rows.length
          : (currentIndex - 1 + rows.length) % rows.length;
    rows[nextIndex].focus();
  };

  const toolbarTitle = toolbar?.title || viewTitle(activeTab);

  const handleNoteCreated = useCallback((note) => {
    window.dispatchEvent(new CustomEvent("canvenient-note-created", { detail: note }));
  }, []);

  return (
    <QuickCaptureContext.Provider value={quickCaptureValue}>
    <WorkspaceToolbarContext.Provider value={setToolbar}>
    <div className="mac-workspace-shell">
      <div className="mac-sidebar-rail" style={{ width: layoutSidebarWidth }}>
        <aside
          className={`mac-sidebar ${isSlim ? "is-slim" : "is-expanded"} ${sidebarBehavior === "hover" ? "is-hover-mode" : ""}`}
          onMouseEnter={() => { if (sidebarBehavior === 'hover') setIsSidebarHovered(true); }}
          onMouseLeave={() => { if (sidebarBehavior === 'hover' && !isDragging) setIsSidebarHovered(false); }}
          onKeyDown={handleSidebarKeyDown}
          style={{ width: currentSidebarWidth, borderInlineEnd: isSidebarVisible ? undefined : 0 }}
        >
          <header className="mac-sidebar-header" data-tauri-drag-region>
            {!isSlim && (
              <div className="mac-sidebar-brand">
                <span className="mac-sidebar-brand-mark" aria-hidden="true">C</span>
                <strong>Canvenient</strong>
              </div>
            )}
            {isSidebarVisible && (
              <button
                type="button"
                className="mac-toolbar-button"
                onClick={() => setAndPersistSidebarBehavior(sidebarBehavior === 'pinned' ? 'hover' : 'pinned')}
                title={sidebarBehavior === 'pinned' ? 'Use hover sidebar (Command+\\)' : 'Keep sidebar open (Command+\\)'}
                aria-label={sidebarBehavior === 'pinned' ? 'Use hover sidebar' : 'Keep sidebar open'}
              >
                {sidebarBehavior === 'pinned' ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </button>
            )}
          </header>

          <div className={`mac-sidebar-scroll ${isSlim ? "is-slim" : ""}`}>
            {!isSlim && <div className="mac-source-label">Library</div>}
            <nav className="mac-source-list" aria-label="Workspace views">
              <NavItem isSlim={isSlim} icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab("dashboard")} />
              <NavItem isSlim={isSlim} icon={CheckSquare} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab("tasks")} />
              <NavItem isSlim={isSlim} icon={CalendarDays} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab("schedule")} />
              <NavItem isSlim={isSlim} icon={BookOpen} label="Canvas" active={activeTab === 'canvas'} onClick={() => setActiveTab("canvas")} />
              <NavItem isSlim={isSlim} icon={FileText} label="Notes" active={activeTab === 'notes' || activeTab.startsWith('note-')} onClick={() => setActiveTab("notes")} />
              <NavItem isSlim={isSlim} icon={Search} label="Search" active={false} onClick={() => setIsOmnibarOpen(true)} shortcut={formatShortcut(shortcuts.search)} />
            </nav>

            {!isSlim && (
              <div className="mac-source-label mac-folder-label">
                <span>Folders</span>
                <button type="button" onClick={() => alert('Folder creation coming soon!')} aria-label="Create folder"><Plus size={13} /></button>
              </div>
            )}
            <div className="mac-source-list">
              <NavItem isSlim={isSlim} icon={Folder} label="Empty Workspace" active={false} onClick={() => alert('Click the + button to create a folder. Feature coming soon!')} />
              <NavItem isSlim={isSlim} icon={Plus} label="New Note" active={false} onClick={createAndOpenNote} />
            </div>
          </div>

          <footer className={`mac-sidebar-footer ${isSlim ? "is-slim" : ""}`}>
            <NavItem isSlim={isSlim} icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab("settings")} />
            <NavItem isSlim={isSlim} icon={LogOut} label="Log Out" active={false} onClick={onLogout} />
          </footer>

          {sidebarBehavior === 'pinned' && (
            <div
              className={`mac-sidebar-resizer ${isDragging ? "is-dragging" : ""}`}
              onMouseDown={handleMouseDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
          )}
        </aside>
      </div>

      <main className="mac-workspace-main">
        <header className="mac-workspace-toolbar" data-tauri-drag-region>
          {sidebarBehavior === 'hidden' && (
            <button
              type="button"
              className="mac-toolbar-button"
              onClick={() => setAndPersistSidebarBehavior('hover')}
              title="Show sidebar"
              aria-label="Show sidebar"
            >
              <PanelLeft size={16} />
            </button>
          )}
          <div className="mac-toolbar-heading" data-tauri-drag-region>
            <h1>{toolbarTitle}</h1>
            {toolbar?.subtitle && <span>{toolbar.subtitle}</span>}
          </div>
          <div className="mac-toolbar-actions">
            {toolbar?.actions}
            {!toolbar?.hideSearch && (
              <button type="button" className="mac-toolbar-search" onClick={() => setIsOmnibarOpen(true)}>
                <Search size={14} />
                <span>Search</span>
                <kbd>{formatShortcut(shortcuts.search)}</kbd>
              </button>
            )}
          </div>
        </header>

        <div className="mac-workspace-content">
          {activeTab === 'dashboard' && <Dashboard token={token} user={user} onNavigate={setActiveTab} />}
          {activeTab === 'tasks' && <TaskView token={token} user={user} />}
          {activeTab === 'schedule' && <Schedule token={token} />}
          {activeTab === 'settings' && <SettingsView token={token} user={user} />}
          {activeTab === 'canvas' && <CanvasView token={token} />}
          {activeTab === 'notes' && <NotesView token={token} />}
          {activeTab.startsWith('note-') && <MarkdownEditor key={activeTab} noteId={activeTab.split('-')[1]} token={token} />}
        </div>
        <TaskInputBar
          token={token}
          variant="dock"
          isOpen={quickCapture.isOpen}
          initialMode="note"
          allowedModes={["note"]}
          onClose={closeQuickCapture}
          onNoteCreated={handleNoteCreated}
        />
      </main>

      <GlobalTasksPanel
        token={token}
        isOpen={tasksPanel.isOpen}
        focusComposer={tasksPanel.focusComposer}
        shortcutLabel={formatShortcut(shortcuts.tasksPanel)}
        onClose={closeTasksPanel}
        onOpenFull={() => {
          closeTasksPanel(false);
          setActiveTab("tasks");
        }}
      />

      {isOmnibarOpen && <Omnibar onClose={() => setIsOmnibarOpen(false)} token={token} onNavigate={(type, item) => {
        if (type === 'note') {
          setActiveTab('note-' + item.id);
        }
        setIsOmnibarOpen(false);
      }} />}
      {isShortcutHelpOpen && (
        <div className="mac-shortcut-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsShortcutHelpOpen(false); }}>
          <section className="mac-shortcut-sheet" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title">
            <header><h2 id="shortcut-help-title">Keyboard shortcuts</h2><button type="button" onClick={() => setIsShortcutHelpOpen(false)} aria-label="Close keyboard shortcuts">×</button></header>
            <dl>
              <div><dt>Search</dt><dd>{formatShortcut(shortcuts.search)}</dd></div>
              <div><dt>Tasks panel</dt><dd>{formatShortcut(shortcuts.tasksPanel)}</dd></div>
              <div><dt>New task</dt><dd>{formatShortcut(shortcuts.quickTask)}</dd></div>
              <div><dt>Quick note</dt><dd>{formatShortcut(shortcuts.quickNote)}</dd></div>
              <div><dt>Import timetable</dt><dd>⌘O</dd></div>
              <div><dt>Switch views</dt><dd>⌘1–5</dd></div>
              <div><dt>Toggle sidebar</dt><dd>⌘\\</dd></div>
            </dl>
          </section>
        </div>
      )}
    </div>
    </WorkspaceToolbarContext.Provider>
    </QuickCaptureContext.Provider>
  );
}
