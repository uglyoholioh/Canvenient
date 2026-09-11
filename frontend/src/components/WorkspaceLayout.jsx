// React is required by the test JSX transform.
 
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import TaskView from "./TaskView";
import TaskInputBar from "./TaskInputBar";
import GlobalTasksPanel from "./GlobalTasksPanel";
import Omnibar from "./Omnibar";
import OnboardingModal from "./OnboardingModal";
import Dashboard from "./Dashboard";
import CanvasDrawer from "./drawers/CanvasDrawer";
import StudyTimerModule from "./dashboard/StudyTimerModule";
import { runDueReminderCycle } from "../dueReminders";
import { WorkspaceToolbarContext } from "./WorkspaceToolbarContext";
import { QuickCaptureContext } from "./QuickCaptureContext";
import { Folder, Search, Settings, CheckSquare, PanelLeft, BookOpen, Plus, LogOut, LayoutDashboard, FileText, CalendarDays, DoorOpen, ChevronLeft, ChevronRight, Users, Dices, Loader2 } from "lucide-react";
import { createNote } from "../api";
import { formatShortcut, matchesShortcut, readKeyboardShortcuts } from "../keyboardShortcuts";

// Secondary views load on demand so the dashboard is interactive sooner.
const SettingsView = lazy(() => import("./SettingsView"));
const CanvasView = lazy(() => import("./CanvasView"));
const NotesView = lazy(() => import("./NotesView"));
const Schedule = lazy(() => import("./Schedule"));
const VenueFinder = lazy(() => import("./VenueFinder"));
const GroupsView = lazy(() => import("./GroupsView"));
const SpinWheelView = lazy(() => import("./wheel/SpinWheelView"));
const MarkdownEditor = lazy(() => import("./MarkdownEditor"));

function ViewLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "60vh", color: "var(--text-muted)", fontSize: "13px" }}>
      <Loader2 className="retro-icon-spin" size={18} />
      <span>Loading…</span>
    </div>
  );
}

const getSidebarBehavior = () => {
  const stored = localStorage.getItem('canvenient-sidebar-mode');
  return ['hover', 'pinned', 'hidden'].includes(stored) ? stored : 'hover';
};

const getInitialView = () => {
  const stored = localStorage.getItem("canvenient-active-view") || "dashboard";
  return ["dashboard", "tasks", "schedule", "venues", "settings", "canvas", "notes", "groups", "wheel"].includes(stored) || /^note-\d+$/.test(stored)
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
    <span className="mac-source-row-label">{label}</span>
    {!isSlim && shortcut && <kbd className="mac-source-row-shortcut">{shortcut}</kbd>}
  </button>
);

const viewTitle = (activeTab) => {
  if (activeTab === "dashboard") return "Dashboard";
  if (activeTab === "tasks") return "Tasks";
  if (activeTab === "schedule") return "Schedule";
  if (activeTab === "venues") return "Venue Finder";
  if (activeTab === "settings") return "Settings";
  if (activeTab === "canvas") return "Modules";
  if (activeTab === "notes") return "Notes";
  if (activeTab === "groups") return "Groups";
  if (activeTab === "wheel") return "Spin the Wheel";
  return "Note";
};

export default function WorkspaceLayout({ token, user, onLogout, onUpdateUser }) {
  const [history, setHistory] = useState([getInitialView()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const activeTab = history[historyIndex];

  const setActiveTab = useCallback((tab) => {
    if (typeof tab === 'function') tab = tab(activeTab);
    if (tab === activeTab) return;
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(tab);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [activeTab, historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex(prev => prev - 1);
  }, [historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) setHistoryIndex(prev => prev + 1);
  }, [historyIndex, history.length]);

  const [isOmnibarOpen, setIsOmnibarOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [toolbar, setToolbar] = useState(null);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [shortcuts, setShortcuts] = useState(readKeyboardShortcuts);
  const [globalCanvasItem, setGlobalCanvasItem] = useState(null);
  const [tasksPanel, setTasksPanel] = useState({ isOpen: false, focusComposer: false });
  const [quickCapture, setQuickCapture] = useState({ isOpen: false });
  const tasksPanelReturnFocus = useRef(null);
  const quickCaptureReturnFocus = useRef(null);
  
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    if (!user) return false;
    const completed = user.id ? localStorage.getItem(`canvenient_onboarding_completed_${user.id}`) === "true" : false;
    return !user.name || !completed;
  });

  // Open onboarding when the signed-in user has no name yet (adjust-during-render
  // pattern; avoids a cascading setState effect).
  const [onboardingUserKey, setOnboardingUserKey] = useState(null);
  if (user?.id && !user?.name && onboardingUserKey !== user.id) {
    setOnboardingUserKey(user.id);
    setIsOnboardingOpen(true);
  }

  // Due-date reminders: check shortly after launch and every 15 minutes.
  useEffect(() => {
    if (!token) return undefined;
    const cycle = () => { runDueReminderCycle(token).catch(() => {}); };
    const initialTimer = window.setTimeout(cycle, 4000);
    const interval = window.setInterval(cycle, 15 * 60 * 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [token]);

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
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("canvenient-focus-task-input", { detail: { scope: "global-tasks" } })));
    }
  }, [tasksPanel.isOpen]);

  const toggleTasksPanel = useCallback(() => {
    if (tasksPanel.isOpen) closeTasksPanel();
    else openTasksPanel({ focusComposer: true });
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
  }, [token, setActiveTab]);

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
      }
      if (matchesShortcut(e, shortcuts.tasksPanel)) {
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
      // Mirrors the native View menu accelerators (main.rs).
      const viewShortcuts = { "1": "dashboard", "2": "tasks", "3": "schedule", "4": "venues", "5": "canvas", "6": "notes", "7": "groups", "8": "wheel" };
      if (viewShortcuts[e.key]) { e.preventDefault(); setActiveTab(viewShortcuts[e.key]); }
      if (key === "o") {
        e.preventDefault(); setActiveTab("schedule");
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("canvenient-open-schedule-import")), 0);
      }
      if (key === ",") { e.preventDefault(); setActiveTab("settings"); }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [closeTasksPanel, openQuickCapture, setActiveTab, shortcuts, tasksPanel.isOpen, toggleTasksPanel]);

  useEffect(() => {
    let disposed = false;
    const cleanups = [];

    const runMenuAction = async (action) => {
      const views = {
        "view-dashboard": "dashboard",
        "view-tasks": "tasks",
        "view-schedule": "schedule",
        "view-venues": "venues",
        "view-canvas": "canvas",
        "view-notes": "notes",
        "view-groups": "groups",
        "view-wheel": "wheel",
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
  }, [openQuickCapture, setActiveTab]);

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
  const currentSidebarWidth = !isSidebarVisible ? 0 : (isSidebarExpanded ? sidebarWidth : 48);
  const layoutSidebarWidth = !isSidebarVisible ? 0 : (sidebarBehavior === 'pinned' ? sidebarWidth : 48);
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
      <header className="mac-workspace-toolbar" data-tauri-drag-region>
        <div className="mac-toolbar-leading" data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div data-tauri-drag-region style={{ width: 80, height: 10, flexShrink: 0 }} />
          <button
            type="button"
            className="mac-toolbar-button"
            onClick={() => setAndPersistSidebarBehavior(sidebarBehavior === 'hidden' ? 'hover' : 'hidden')}
            title={sidebarBehavior === 'hidden' ? 'Show sidebar' : 'Hide sidebar'}
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
          <button type="button" className="mac-toolbar-button" disabled={historyIndex === 0} onClick={goBack} title="Go back">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="mac-toolbar-button" disabled={historyIndex === history.length - 1} onClick={goForward} title="Go forward">
            <ChevronRight size={16} />
          </button>
          <div className="mac-toolbar-heading" data-tauri-drag-region>
            {toolbarTitle && <h1>{toolbarTitle}</h1>}
            {toolbar?.subtitle && <span>{toolbar.subtitle}</span>}
          </div>
        </div>
        {!toolbar?.hideSearch && (
          <button type="button" className="mac-toolbar-search mac-toolbar-search-primary" onClick={() => setIsOmnibarOpen(true)}>
            <Search size={14} />
            <span>Search for anything…</span>
            <kbd>{formatShortcut(shortcuts.search)}</kbd>
          </button>
        )}
        {toolbar?.hideSearch && <div aria-hidden="true" />}
        <div className="mac-toolbar-actions">
          <StudyTimerModule token={token} />
          {toolbar?.actions}
        </div>
      </header>

      <div className="mac-workspace-body">
        <div className="mac-sidebar-rail" style={{ width: layoutSidebarWidth }}>
          <aside
            className={`mac-sidebar ${isSlim ? "is-slim" : "is-expanded"} ${sidebarBehavior === "hover" ? "is-hover-mode" : ""}`}
            onMouseEnter={() => { if (sidebarBehavior === 'hover') setIsSidebarHovered(true); }}
            onMouseLeave={() => { if (sidebarBehavior === 'hover' && !isDragging) setIsSidebarHovered(false); }}
            onKeyDown={handleSidebarKeyDown}
            style={{ width: currentSidebarWidth, borderInlineEnd: isSidebarVisible ? undefined : 0 }}
          >
            <header className="mac-sidebar-header" style={{ paddingInline: isSlim ? 0 : '12px', justifyContent: isSlim ? 'center' : 'flex-start' }}>
              <div className="mac-sidebar-brand" aria-hidden={isSlim}>
                <span className="mac-sidebar-brand-mark" aria-hidden="true">C</span>
                <strong>Canvenient</strong>
              </div>
            </header>

            <div className={`mac-sidebar-scroll ${isSlim ? "is-slim" : ""}`}>
              {!isSlim && <div className="mac-source-label">Library</div>}
              <nav className="mac-source-list" aria-label="Workspace views">
                <NavItem isSlim={isSlim} icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab("dashboard")} />
                <NavItem isSlim={isSlim} icon={CheckSquare} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab("tasks")} />
                <NavItem isSlim={isSlim} icon={CalendarDays} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab("schedule")} />
                <NavItem isSlim={isSlim} icon={DoorOpen} label="Venue Finder" active={activeTab === 'venues'} onClick={() => setActiveTab("venues")} />
                <NavItem isSlim={isSlim} icon={BookOpen} label="Modules" active={activeTab === 'canvas'} onClick={() => setActiveTab("canvas")} />
                <NavItem isSlim={isSlim} icon={Users} label="Groups" active={activeTab === 'groups'} onClick={() => setActiveTab("groups")} />
                <NavItem isSlim={isSlim} icon={FileText} label="Notes" active={activeTab === 'notes' || activeTab.startsWith('note-')} onClick={() => setActiveTab("notes")} />
                <NavItem isSlim={isSlim} icon={Dices} label="Spin the Wheel" active={activeTab === 'wheel'} onClick={() => setActiveTab("wheel")} />
                <NavItem isSlim={isSlim} icon={Search} label="Search" active={false} onClick={() => setIsOmnibarOpen(true)} />
              </nav>

              {!isSlim && (
                <div className="mac-source-label mac-folder-label">
                  <span>Folders</span>
                  <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('canvenient-toast', { detail: { message: 'Folder creation coming soon!' } }))} aria-label="Create folder"><Plus size={13} /></button>
                </div>
              )}
              <div className="mac-source-list">
                <NavItem isSlim={isSlim} icon={Folder} label="Empty Workspace" active={false} onClick={() => window.dispatchEvent(new CustomEvent('canvenient-toast', { detail: { message: 'Click the + button to create a folder. Feature coming soon!' } }))} />
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
          <div className="mac-workspace-content">
            <Suspense fallback={<ViewLoader />}>
              {activeTab === 'dashboard' && <Dashboard token={token} user={user} onNavigate={setActiveTab} onOpenSearch={() => setIsOmnibarOpen(true)} searchShortcutLabel={formatShortcut(shortcuts.search)} />}
              {activeTab === 'tasks' && <TaskView token={token} user={user} />}
              {activeTab === 'schedule' && <Schedule token={token} />}
              {activeTab === 'venues' && <VenueFinder token={token} />}
              {activeTab === 'settings' && (
                <SettingsView
                  token={token}
                  user={user}
                  onUpdateUser={onUpdateUser}
                  onReplayOnboarding={() => setIsOnboardingOpen(true)}
                />
              )}
              {activeTab === 'canvas' && <CanvasView token={token} />}
              {activeTab === 'groups' && <GroupsView token={token} currentUser={user} />}
              {activeTab === 'notes' && <NotesView token={token} />}
              {activeTab === 'wheel' && <SpinWheelView token={token} onNavigate={setActiveTab} />}
              {activeTab.startsWith('note-') && <MarkdownEditor key={activeTab} noteId={activeTab.split('-')[1]} token={token} />}
            </Suspense>
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
      </div>

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
        } else if (type === 'view') {
          setActiveTab(item.view || item.id);
        } else if (type === 'task') {
          setActiveTab('tasks');
        } else if (type === 'canvas_resource') {
          setGlobalCanvasItem(item);
        }
        setIsOmnibarOpen(false);
      }} />}
      
      {globalCanvasItem && <CanvasDrawer item={globalCanvasItem} token={token} onClose={() => setGlobalCanvasItem(null)} />}
      
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
              <div><dt>Switch views</dt><dd>⌘1–8</dd></div>
              <div><dt>Toggle sidebar</dt><dd>⌘\\</dd></div>
            </dl>
          </section>
        </div>
      )}

      <OnboardingModal
        token={token}
        user={user}
        isOpen={isOnboardingOpen}
        canDismiss={Boolean(user?.name?.trim())}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={(updatedUser) => {
          onUpdateUser?.(updatedUser);
          setIsOnboardingOpen(false);
        }}
      />
    </div>
    </WorkspaceToolbarContext.Provider>
    </QuickCaptureContext.Provider>
  );
}
