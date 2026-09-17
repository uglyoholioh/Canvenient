// The Instrument — workspace shell for the redesign draft.
// Same native contracts as the previous shell (menu-action events, global
// shortcuts, view ids in localStorage, toolbar context), one governing idea:
// a glance states where you are; everything else is a keystroke away.

import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import TaskInputBar from "../components/TaskInputBar";
import GlobalTasksPanel from "../components/GlobalTasksPanel";
import OfflineBanner from "../components/OfflineBanner";
import AssistantPane from "../components/AssistantPane";
import CanvasDrawer from "../components/drawers/CanvasDrawer";
import StudyTimerModule from "../components/dashboard/StudyTimerModule";
import MarkdownEditor from "../components/MarkdownEditor";
import { runDueReminderCycle } from "../dueReminders";
import { WorkspaceToolbarContext } from "../components/WorkspaceToolbarContext";
import { QuickCaptureContext } from "../components/QuickCaptureContext";
import { AssistantContext } from "../components/AssistantContext";
import {
  PanelLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Sun,
  ListTodo,
  CalendarDays,
  MapPin,
  BookOpen,
  FileText,
  Dices,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { formatShortcut, matchesShortcut, readKeyboardShortcuts } from "../keyboardShortcuts";
import { getAcademicWeek } from "../components/scheduleUtils";
import CommandBar from "./CommandBar";
import CheatSheet from "./CheatSheet";
import OrientationSheet from "./OrientationSheet";
import TodayView from "./views/TodayView";
import "./instrument.css";

const TasksView = lazy(() => import("./views/TasksView"));
const ScheduleView = lazy(() => import("./views/ScheduleView"));
const CampusView = lazy(() => import("./views/CampusView"));
const ModulesView = lazy(() => import("./views/ModulesView"));
const NotesView = lazy(() => import("./views/NotesView"));
const DecideView = lazy(() => import("./views/DecideView"));
const GroupsView = lazy(() => import("./views/GroupsView"));
const SettingsView = lazy(() => import("./views/SettingsView"));

const ASSISTANT_VIEW_MAP = {
  dashboard: "dashboard",
  tasks: "tasks",
  schedule: "schedule",
  venues: "venues",
  modules: "canvas",
  canvas: "canvas",
  notes: "notes",
  groups: "groups",
  wheel: "wheel",
};

const VIEW_TITLES = {
  dashboard: "Today",
  tasks: "Tasks",
  schedule: "Schedule",
  venues: "Campus",
  canvas: "Modules",
  notes: "Notes",
  groups: "Groups",
  wheel: "Decide",
  settings: "Settings",
};

const SIDEBAR_PRIMARY = [
  { id: "dashboard", label: "Today", icon: Sun },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "venues", label: "Campus", icon: MapPin },
  { id: "canvas", label: "Modules", icon: BookOpen },
  { id: "notes", label: "Notes", icon: FileText },
];

const SIDEBAR_UTILITIES = [
  { id: "wheel", label: "Decide", icon: Dices },
  { id: "groups", label: "Groups", icon: Users },
];

const getSidebarBehavior = () => {
  const stored = localStorage.getItem("canvenient-sidebar-mode");
  return ["hover", "pinned", "hidden"].includes(stored) ? stored : "pinned";
};

const getInitialView = () => {
  const stored = localStorage.getItem("canvenient-active-view") || "dashboard";
  return Object.keys(VIEW_TITLES).includes(stored) || /^note-\d+$/.test(stored)
    ? stored
    : "dashboard";
};

function ViewLoader() {
  return (
    <div className="ins-empty" style={{ minHeight: "40vh" }}>
      <span className="ins-mono">···</span>
    </div>
  );
}

const NavItem = ({ icon: Icon, label, active, onClick, isSlim }) => (
  <button
    type="button"
    className={`ins-nav-row ${active ? "is-active" : ""} ${isSlim ? "is-slim" : ""}`}
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    title={isSlim ? label : undefined}
  >
    <Icon size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} />
    <span className="ins-nav-label">{label}</span>
  </button>
);

export default function InstrumentWorkspace({ token, user, onLogout, onUpdateUser }) {
  const [history, setHistory] = useState([getInitialView()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const activeTab = history[historyIndex];

  const setActiveTab = useCallback(
    (tab) => {
      if (typeof tab === "function") tab = tab(activeTab);
      if (tab === activeTab) return;
      setHistory((prev) => prev.slice(0, historyIndex + 1).concat(tab));
      setHistoryIndex((prev) => prev + 1);
    },
    [activeTab, historyIndex],
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex((prev) => prev - 1);
  }, [historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) setHistoryIndex((prev) => prev + 1);
  }, [historyIndex, history.length]);

  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);
  const [toolbar, setToolbar] = useState(null);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [shortcuts, setShortcuts] = useState(readKeyboardShortcuts);
  const [globalCanvasItem, setGlobalCanvasItem] = useState(null);
  const [tasksPanel, setTasksPanel] = useState({ isOpen: false, focusComposer: false });
  const [quickCapture, setQuickCapture] = useState({ isOpen: false });
  const [assistant, setAssistant] = useState({
    isOpen: false,
    query: "",
    attachment: null,
    initialSend: false,
  });
  const tasksPanelReturnFocus = useRef(null);
  const quickCaptureReturnFocus = useRef(null);

  // One quiet orientation per user; name capture only if the account lacks one.
  const hasSeenIntro = (u) =>
    Boolean(u?.id) && localStorage.getItem(`canvenient_intro_completed_${u.id}`) === "true";
  const [isIntroOpen, setIsIntroOpen] = useState(() => Boolean(user) && !hasSeenIntro(user));

  useEffect(() => {
    localStorage.setItem("canvenient-active-view", activeTab);
  }, [activeTab]);

  // Due-date reminders state facts shortly after launch and every 15 minutes.
  useEffect(() => {
    if (!token) return undefined;
    const cycle = () => {
      runDueReminderCycle(token).catch(() => {});
    };
    const initialTimer = window.setTimeout(cycle, 4000);
    const interval = window.setInterval(cycle, 15 * 60 * 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [token]);

  const [sidebarWidth, setSidebarWidth] = useState(() =>
    parseInt(localStorage.getItem("canvenient-sidebar-width") || "216", 10),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarBehavior, setSidebarBehavior] = useState(getSidebarBehavior);

  const closeTasksPanel = useCallback((restoreFocus = true) => {
    setTasksPanel({ isOpen: false, focusComposer: false });
    if (restoreFocus) requestAnimationFrame(() => tasksPanelReturnFocus.current?.focus?.());
  }, []);

  const openTasksPanel = useCallback(
    (options = {}) => {
      if (!tasksPanel.isOpen) {
        tasksPanelReturnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      setTasksPanel({ isOpen: true, focusComposer: Boolean(options.focusComposer) });
      if (options.focusComposer) {
        requestAnimationFrame(() =>
          window.dispatchEvent(
            new CustomEvent("canvenient-focus-task-input", { detail: { scope: "global-tasks" } }),
          ),
        );
      }
    },
    [tasksPanel.isOpen],
  );

  const toggleTasksPanel = useCallback(() => {
    if (tasksPanel.isOpen) closeTasksPanel();
    else openTasksPanel({ focusComposer: true });
  }, [closeTasksPanel, openTasksPanel, tasksPanel.isOpen]);

  const openQuickCapture = useCallback(
    (options = {}) => {
      if (options.mode !== "note") {
        openTasksPanel({ focusComposer: true });
        return;
      }
      quickCaptureReturnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuickCapture({ isOpen: true });
    },
    [openTasksPanel],
  );

  const closeQuickCapture = useCallback(() => {
    setQuickCapture({ isOpen: false });
    requestAnimationFrame(() => quickCaptureReturnFocus.current?.focus?.());
  }, []);

  const quickCaptureValue = useMemo(
    () => ({
      isOpen: quickCapture.isOpen,
      openQuickCapture,
      closeQuickCapture,
    }),
    [closeQuickCapture, openQuickCapture, quickCapture.isOpen],
  );

  const toggleAssistant = useCallback(() => {
    setAssistant((prev) =>
      prev.isOpen
        ? { ...prev, isOpen: false }
        : { isOpen: true, query: "", attachment: null, initialSend: false },
    );
  }, []);

  const openAssistant = useCallback((options = {}) => {
    setAssistant({
      isOpen: true,
      query: options.query || "",
      attachment: options.attachment || null,
      initialSend: Boolean(options.query),
    });
  }, []);

  const closeAssistant = useCallback(
    () => setAssistant((prev) => ({ ...prev, isOpen: false })),
    [],
  );

  const assistantValue = useMemo(
    () => ({ openAssistant, closeAssistant }),
    [closeAssistant, openAssistant],
  );

  const openAssistantResource = useCallback(
    (resource) => {
      if (!resource) return;
      if (resource.type === "note") {
        setActiveTab(`note-${resource.id}`);
      } else if (resource.type === "view") {
        setActiveTab(ASSISTANT_VIEW_MAP[String(resource.label || "").toLowerCase()] || "dashboard");
      } else if (resource.type === "assignment") {
        setGlobalCanvasItem({
          type: "canvas_resource",
          itemType: "assignment",
          id: resource.id,
          title: resource.label,
        });
      } else {
        setActiveTab("canvas");
      }
    },
    [setActiveTab],
  );

  useEffect(() => {
    const handleStorage = () => {
      setSidebarBehavior(getSidebarBehavior());
      setSidebarWidth(parseInt(localStorage.getItem("canvenient-sidebar-width") || "216", 10));
      setShortcuts(readKeyboardShortcuts());
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("settings-updated", handleStorage);
    window.addEventListener("keyboard-shortcuts-updated", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("settings-updated", handleStorage);
      window.removeEventListener("keyboard-shortcuts-updated", handleStorage);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.key === "Escape") {
        setIsCheatSheetOpen(false);
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
        setIsCommandBarOpen(true);
        return;
      }
      if (matchesShortcut(e, shortcuts.assistant)) {
        e.preventDefault();
        toggleAssistant();
        return;
      }
      if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCheatSheetOpen((open) => !open);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "\\") {
        e.preventDefault();
        setSidebarBehavior((current) => {
          const next = current === "pinned" ? "hover" : "pinned";
          localStorage.setItem("canvenient-sidebar-mode", next);
          return next;
        });
      }
      if (window.__TAURI_IPC__) return;
      // Mirrors the native View menu accelerators (main.rs).
      const viewShortcuts = {
        1: "dashboard",
        2: "tasks",
        3: "schedule",
        4: "venues",
        5: "canvas",
        6: "notes",
        7: "groups",
        8: "wheel",
      };
      if (viewShortcuts[e.key]) {
        e.preventDefault();
        setActiveTab(viewShortcuts[e.key]);
      }
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        setActiveTab("schedule");
        window.setTimeout(
          () => window.dispatchEvent(new CustomEvent("canvenient-open-schedule-import")),
          0,
        );
      }
      if (e.key === ",") {
        e.preventDefault();
        setActiveTab("settings");
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [
    openQuickCapture,
    setActiveTab,
    shortcuts,
    tasksPanel.isOpen,
    toggleAssistant,
    toggleTasksPanel,
  ]);

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
      if (action === "search") setIsCommandBarOpen(true);
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
        window.setTimeout(
          () => window.dispatchEvent(new CustomEvent("canvenient-open-schedule-import")),
          0,
        );
      }
      if (action === "keyboard-shortcuts") setIsCheatSheetOpen(true);
    };

    if (window.__TAURI_IPC__) {
      Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/tauri")])
        .then(async ([eventApi, tauriApi]) => {
          if (disposed) return;
          cleanups.push(
            await eventApi.listen("menu-action", ({ payload }) => runMenuAction(payload)),
          );
          cleanups.push(
            await eventApi.listen("calendar-files-ready", async () => {
              const queued = await tauriApi.invoke("take_pending_calendar_files");
              if (queued?.length) {
                setActiveTab("schedule");
                window.setTimeout(
                  () =>
                    window.dispatchEvent(
                      new CustomEvent("canvenient-import-ics-paths", { detail: queued }),
                    ),
                  0,
                );
              }
            }),
          );
          const pending = await tauriApi.invoke("take_pending_calendar_files");
          if (pending?.length) {
            setActiveTab("schedule");
            window.setTimeout(
              () =>
                window.dispatchEvent(
                  new CustomEvent("canvenient-import-ics-paths", { detail: pending }),
                ),
              0,
            );
          }
        })
        .catch((error) => console.error("Could not attach native app events", error));
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
      localStorage.setItem("canvenient-sidebar-width", sidebarWidth.toString());
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, sidebarWidth]);

  const isSidebarVisible = sidebarBehavior !== "hidden";
  const isSidebarExpanded =
    sidebarBehavior === "pinned" || (sidebarBehavior === "hover" && isSidebarHovered) || isDragging;
  const currentSidebarWidth = !isSidebarVisible ? 0 : isSidebarExpanded ? sidebarWidth : 48;
  const layoutSidebarWidth = !isSidebarVisible
    ? 0
    : sidebarBehavior === "pinned"
      ? sidebarWidth
      : 48;
  const isSlim = isSidebarVisible && !isSidebarExpanded;

  const handleSidebarKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = Array.from(event.currentTarget.querySelectorAll(".ins-nav-row:not(:disabled)"));
    if (!rows.length) return;
    event.preventDefault();
    const currentIndex = rows.indexOf(document.activeElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1 + rows.length) % rows.length
            : (currentIndex - 1 + rows.length) % rows.length;
    rows[nextIndex].focus();
  };

  // Fallback fact: the academic position. Views replace it with richer facts.
  const weekFact = useMemo(() => {
    const week = getAcademicWeek(new Date());
    return week?.formatted || "";
  }, []);

  const toolbarTitle = toolbar?.title || VIEW_TITLES[activeTab] || "Note";
  const toolbarFact = toolbar?.fact ?? weekFact;

  const handleNoteCreated = useCallback((note) => {
    window.dispatchEvent(new CustomEvent("canvenient-note-created", { detail: note }));
  }, []);

  return (
    <QuickCaptureContext.Provider value={quickCaptureValue}>
      <AssistantContext.Provider value={assistantValue}>
        <WorkspaceToolbarContext.Provider value={setToolbar}>
          <div className="ins-root">
            <OfflineBanner />
            <header className="ins-toolbar" data-tauri-drag-region>
              <div className="ins-toolbar-side is-left" data-tauri-drag-region>
                <div className="ins-traffic-space" data-tauri-drag-region />
                <button
                  type="button"
                  className="ins-iconbtn"
                  onClick={() =>
                    setSidebarBehavior((current) => {
                      const next = current === "hidden" ? "hover" : "hidden";
                      localStorage.setItem("canvenient-sidebar-mode", next);
                      return next;
                    })
                  }
                  title="Hide or show the sidebar (⌘\)"
                  aria-label="Toggle sidebar"
                >
                  <PanelLeft size={15} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className="ins-iconbtn"
                  disabled={historyIndex === 0}
                  onClick={goBack}
                  title="Back"
                >
                  <ChevronLeft size={15} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className="ins-iconbtn"
                  disabled={historyIndex === history.length - 1}
                  onClick={goForward}
                  title="Forward"
                >
                  <ChevronRight size={15} strokeWidth={1.8} />
                </button>
                <h1 className="ins-toolbar-title">{toolbarTitle}</h1>
              </div>

              <div className="ins-toolbar-fact ins-mono" data-tauri-drag-region>
                {toolbarFact}
              </div>

              <div className="ins-toolbar-side is-right">
                <button
                  type="button"
                  className="ins-iconbtn"
                  onClick={() => openQuickCapture({ mode: "task" })}
                  title={`Capture (${formatShortcut(shortcuts.quickTask)})`}
                  aria-label="Capture"
                >
                  <Plus size={16} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className={`ins-iconbtn ${assistant.isOpen ? "is-on" : ""}`}
                  onClick={toggleAssistant}
                  title={`Assistant (${formatShortcut(shortcuts.assistant)})`}
                  aria-label="Assistant"
                  aria-pressed={assistant.isOpen}
                >
                  <Sparkles size={15} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className="ins-iconbtn"
                  onClick={() => setIsCommandBarOpen(true)}
                  title={`Search (${formatShortcut(shortcuts.search)})`}
                  aria-label="Search"
                >
                  <Search size={15} strokeWidth={1.8} />
                </button>
                <StudyTimerModule token={token} />
                {toolbar?.actions}
              </div>
            </header>

            <div className="ins-body">
              <div className="ins-sidebar-rail" style={{ width: layoutSidebarWidth }}>
                <aside
                  className={`ins-sidebar ${isSlim ? "is-slim" : "is-expanded"} ${sidebarBehavior === "hover" ? "is-hover-mode" : ""}`}
                  onMouseEnter={() => {
                    if (sidebarBehavior === "hover") setIsSidebarHovered(true);
                  }}
                  onMouseLeave={() => {
                    if (sidebarBehavior === "hover" && !isDragging) setIsSidebarHovered(false);
                  }}
                  onKeyDown={handleSidebarKeyDown}
                  style={{ width: currentSidebarWidth }}
                >
                  <div className={`ins-sidebar-scroll ${isSlim ? "is-slim" : ""}`}>
                    <nav className="ins-nav" aria-label="Views">
                      {SIDEBAR_PRIMARY.map((item) => (
                        <NavItem
                          key={item.id}
                          isSlim={isSlim}
                          icon={item.icon}
                          label={item.label}
                          active={
                            activeTab === item.id ||
                            (item.id === "notes" && activeTab.startsWith("note-"))
                          }
                          onClick={() => setActiveTab(item.id)}
                        />
                      ))}
                    </nav>
                    <div className="ins-nav-caption">{!isSlim && "Utilities"}</div>
                    <nav className="ins-nav" aria-label="Utilities">
                      {SIDEBAR_UTILITIES.map((item) => (
                        <NavItem
                          key={item.id}
                          isSlim={isSlim}
                          icon={item.icon}
                          label={item.label}
                          active={activeTab === item.id}
                          onClick={() => setActiveTab(item.id)}
                        />
                      ))}
                    </nav>
                  </div>

                  <footer className={`ins-sidebar-footer ${isSlim ? "is-slim" : ""}`}>
                    <NavItem
                      isSlim={isSlim}
                      icon={Settings}
                      label="Settings"
                      active={activeTab === "settings"}
                      onClick={() => setActiveTab("settings")}
                    />
                    <NavItem
                      isSlim={isSlim}
                      icon={LogOut}
                      label={user?.name || "Log Out"}
                      active={false}
                      onClick={onLogout}
                    />
                  </footer>

                  {sidebarBehavior === "pinned" && (
                    <div
                      className={`ins-sidebar-resizer ${isDragging ? "is-dragging" : ""}`}
                      onMouseDown={handleMouseDown}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize sidebar"
                    />
                  )}
                </aside>
              </div>

              <main className="ins-main">
                <div className="ins-content">
                  <Suspense fallback={<ViewLoader />}>
                    {activeTab === "dashboard" && (
                      <TodayView
                        token={token}
                        user={user}
                        onNavigate={setActiveTab}
                        onOpenSearch={() => setIsCommandBarOpen(true)}
                      />
                    )}
                    {activeTab === "tasks" && <TasksView token={token} user={user} />}
                    {activeTab === "schedule" && <ScheduleView token={token} />}
                    {activeTab === "venues" && <CampusView token={token} />}
                    {activeTab === "canvas" && <ModulesView token={token} />}
                    {activeTab === "notes" && <NotesView token={token} />}
                    {activeTab === "wheel" && <DecideView token={token} />}
                    {activeTab === "groups" && <GroupsView token={token} currentUser={user} />}
                    {activeTab === "settings" && (
                      <SettingsView
                        token={token}
                        user={user}
                        onUpdateUser={onUpdateUser}
                        onReplayOrientation={() => setIsIntroOpen(true)}
                      />
                    )}
                    {activeTab.startsWith("note-") && (
                      <MarkdownEditor
                        key={activeTab}
                        noteId={activeTab.split("-")[1]}
                        token={token}
                      />
                    )}
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

            {isCommandBarOpen && (
              <CommandBar
                onClose={() => setIsCommandBarOpen(false)}
                token={token}
                onCommand={(command) => {
                  setIsCommandBarOpen(false);
                  if (command === "quick-task") openQuickCapture({ mode: "task" });
                  if (command === "quick-note") openQuickCapture({ mode: "note" });
                  if (command === "cheat-sheet") setIsCheatSheetOpen(true);
                }}
                onNavigate={(type, item) => {
                  if (type === "note") {
                    setActiveTab("note-" + item.id);
                  } else if (type === "view") {
                    setActiveTab(item.view || item.id);
                  } else if (type === "task") {
                    setActiveTab("tasks");
                  } else if (type === "canvas_resource") {
                    setGlobalCanvasItem(item);
                  } else if (type === "ai") {
                    openAssistant({ query: item.title });
                  }
                  setIsCommandBarOpen(false);
                }}
              />
            )}

            {assistant.isOpen && (
              <AssistantPane
                token={token}
                initialQuery={assistant.query}
                attachment={assistant.attachment}
                initialSend={assistant.initialSend}
                onClose={closeAssistant}
                onOpenResource={openAssistantResource}
              />
            )}

            {globalCanvasItem && (
              <CanvasDrawer
                item={globalCanvasItem}
                token={token}
                onClose={() => setGlobalCanvasItem(null)}
              />
            )}

            {isCheatSheetOpen && (
              <CheatSheet shortcuts={shortcuts} onClose={() => setIsCheatSheetOpen(false)} />
            )}

            {isIntroOpen && (
              <OrientationSheet
                token={token}
                user={user}
                onUpdateUser={onUpdateUser}
                onDone={() => setIsIntroOpen(false)}
              />
            )}
          </div>
        </WorkspaceToolbarContext.Provider>
      </AssistantContext.Provider>
    </QuickCaptureContext.Provider>
  );
}
