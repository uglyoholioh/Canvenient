import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, Check, CheckSquare, Columns3, FileText, Grid3X3, LayoutGrid, Pencil, SlidersHorizontal, X } from "lucide-react";
import CanvasDrawer from "./drawers/CanvasDrawer";
import NoteDrawer from "./drawers/NoteDrawer";
import CanvasModule from "./dashboard/CanvasModule";
import ModuleCard from "./dashboard/ModuleCard";
import NotesModule from "./dashboard/NotesModule";
import ScheduleModule from "./dashboard/ScheduleModule";
import TasksModule from "./dashboard/TasksModule";
import DashboardCustomizer from "./dashboard/DashboardCustomizer";
import { readDashboardConfig, readDashboardLayout, saveDashboardConfig, saveDashboardLayout } from "./dashboard/dashboardConfig";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";
import { useQuickCapture } from "./QuickCaptureContext";

const DASHBOARD_FONT_VALUES = {
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
  serif: "'New York', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  mono: "'SF Mono', SFMono-Regular, Menlo, Monaco, monospace",
};

function initialCollapsedState() {
  try { return JSON.parse(localStorage.getItem("canvenient-dashboard-collapsed") || "{}"); }
  catch { return {}; }
}

export default function Dashboard({ token, user, onNavigate }) {
  const { openQuickCapture } = useQuickCapture();
  const [collapsed, setCollapsed] = useState(initialCollapsedState);
  const [activeNote, setActiveNote] = useState(null);
  const [activeCanvasItem, setActiveCanvasItem] = useState(null);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [noteRefreshKey, setNoteRefreshKey] = useState(0);
  const [layout, setLayout] = useState(readDashboardLayout);
  const [config, setConfig] = useState(readDashboardConfig);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [draggedModule, setDraggedModule] = useState(null);
  const [previewTracks, setPreviewTracks] = useState(null);
  const [activeModuleId, setActiveModuleId] = useState("tasks");
  const moduleRefs = useRef(new Map());

  useEffect(() => {
    const syncSettings = () => { setLayout(readDashboardLayout()); setConfig(readDashboardConfig()); };
    window.addEventListener("storage", syncSettings);
    window.addEventListener("dashboard-settings-updated", syncSettings);
    return () => {
      window.removeEventListener("storage", syncSettings);
      window.removeEventListener("dashboard-settings-updated", syncSettings);
    };
  }, []);

  useEffect(() => {
    const refreshTasks = () => setTaskRefreshKey((key) => key + 1);
    const refreshNotes = () => setNoteRefreshKey((key) => key + 1);
    window.addEventListener("canvenient-task-created", refreshTasks);
    window.addEventListener("canvenient-note-created", refreshNotes);
    return () => {
      window.removeEventListener("canvenient-task-created", refreshTasks);
      window.removeEventListener("canvenient-note-created", refreshNotes);
    };
  }, []);

  const toggle = (module) => {
    setCollapsed((current) => {
      const next = { ...current, [module]: !current[module] };
      localStorage.setItem("canvenient-dashboard-collapsed", JSON.stringify(next));
      return next;
    });
  };

  const changeLayout = useCallback((nextLayout) => {
    setLayout(nextLayout);
    saveDashboardLayout(nextLayout);
  }, []);

  const selectLayout = useCallback((nextLayout) => {
    setIsEditingLayout(false);
    setDraggedModule(null);
    changeLayout(nextLayout);
  }, [changeLayout]);

  const changeConfig = useCallback((nextConfig) => {
    setConfig(nextConfig);
    saveDashboardConfig(nextConfig);
  }, []);

  const modules = {
    tasks: {
      icon: CheckSquare,
      title: "Tasks",
      onViewFull: () => onNavigate("tasks"),
      body: <TasksModule token={token} refreshKey={taskRefreshKey} onAddTask={() => openQuickCapture({ mode: "task" })} />,
    },
    schedule: {
      icon: CalendarDays,
      title: "Schedule",
      onViewFull: () => onNavigate("schedule"),
      body: <ScheduleModule token={token} onNavigate={onNavigate} />,
    },
    canvas: {
      icon: BookOpen,
      title: "Canvas",
      onViewFull: () => onNavigate("canvas"),
      body: <CanvasModule token={token} enabled={Boolean(user?.canvas_token)} onOpenItem={setActiveCanvasItem} />,
    },
    notes: {
      icon: FileText,
      title: "Notes",
      onViewFull: () => onNavigate("notes"),
      body: <NotesModule token={token} refreshKey={noteRefreshKey} onOpenNote={setActiveNote} />,
    },
  };

  const visibleModules = useMemo(
    () => config.order.filter((moduleId) => !config.hidden.includes(moduleId)),
    [config.hidden, config.order],
  );

  const effectiveActiveModuleId = visibleModules.includes(activeModuleId)
    ? activeModuleId
    : visibleModules[0] || null;

  const moveBrowseFocus = useCallback((moduleId, key) => {
    if (key === "Home" || key === "End") {
      const targetId = key === "Home" ? visibleModules[0] : visibleModules[visibleModules.length - 1];
      if (targetId) moduleRefs.current.get(targetId)?.focus();
      return;
    }
    const current = moduleRefs.current.get(moduleId);
    const currentRect = current?.getBoundingClientRect();
    if (!currentRect) return;
    const currentCenter = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
    const candidates = visibleModules.flatMap((candidateId) => {
      if (candidateId === moduleId) return [];
      const element = moduleRefs.current.get(candidateId);
      const rect = element?.getBoundingClientRect();
      if (!rect) return [];
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const inDirection = key === "ArrowRight" ? dx > 1
        : key === "ArrowLeft" ? dx < -1
          : key === "ArrowDown" ? dy > 1
            : dy < -1;
      if (!inDirection) return [];
      const primary = key === "ArrowRight" || key === "ArrowLeft" ? Math.abs(dx) : Math.abs(dy);
      const cross = key === "ArrowRight" || key === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
      return [{ id: candidateId, score: primary + cross * 0.35 }];
    }).sort((a, b) => a.score - b.score);
    if (candidates[0]) moduleRefs.current.get(candidates[0].id)?.focus();
  }, [visibleModules]);

  const moveModule = (moduleId, direction) => {
    const index = config.order.indexOf(moduleId);
    const target = index + direction;
    if (target < 0 || target >= config.order.length) return;
    const order = [...config.order];
    [order[index], order[target]] = [order[target], order[index]];
    changeConfig({ ...config, order });
  };

  const dropModule = (targetModule, sourceModule = draggedModule) => {
    if (!sourceModule || sourceModule === targetModule) return;
    const order = [...config.order];
    const fromIndex = order.indexOf(sourceModule);
    const targetIndex = order.indexOf(targetModule);
    if (fromIndex < 0 || targetIndex < 0) return;
    [order[fromIndex], order[targetIndex]] = [order[targetIndex], order[fromIndex]];
    changeConfig({ ...config, order });
    setDraggedModule(null);
  };

  const commitTrackResize = (tracks) => {
    setPreviewTracks(null);
    changeConfig({ ...config, tracks });
  };

  const beginLayoutEdit = () => {
    setIsCustomizing(false);
    setIsEditingLayout(true);
  };

  useEffect(() => {
    const closeTransientUi = (event) => {
      if (event.key !== "Escape") return;
      setIsCustomizing(false);
      setIsEditingLayout(false);
      setDraggedModule(null);
    };
    window.addEventListener("keydown", closeTransientUi);
    return () => window.removeEventListener("keydown", closeTransientUi);
  }, []);

  const toolbarConfig = useMemo(() => ({
    title: "Dashboard",
    actions: (
      <>
        <div className="dashboard-layout-switcher" aria-label="Dashboard layout">
          <button type="button" className={layout === "focus" ? "is-active" : ""} onClick={() => selectLayout("focus")} aria-label="Focus and sidebar layout" title="Focus + Sidebar"><Columns3 size={14} /></button>
          <button type="button" className={layout === "bento" ? "is-active" : ""} onClick={() => selectLayout("bento")} aria-label="Bento grid layout" title="Bento Grid"><LayoutGrid size={14} /></button>
          <button type="button" className={layout === "custom" ? "is-active" : ""} onClick={() => selectLayout("custom")} aria-label="Custom grid layout" title="Custom Grid"><Grid3X3 size={14} /></button>
        </div>
        <button
          type="button"
          className={`dashboard-edit-button ${isEditingLayout ? "is-active" : ""}`}
          onClick={() => isEditingLayout ? setIsEditingLayout(false) : beginLayoutEdit()}
          aria-label={isEditingLayout ? "Finish editing dashboard layout" : "Edit dashboard layout"}
          title={isEditingLayout ? "Done" : "Edit layout"}
        >
          {isEditingLayout ? <Check size={14} /> : <Pencil size={14} />}
        </button>
        <button type="button" className={`dashboard-customize-button ${isCustomizing ? "is-active" : ""}`} onClick={() => setIsCustomizing((open) => !open)} aria-label="Customize dashboard" title="Customize dashboard"><SlidersHorizontal size={14} /></button>
        {isCustomizing && <div className="dashboard-customizer-popover is-in-toolbar"><header><strong>Customize dashboard</strong><button type="button" onClick={() => setIsCustomizing(false)} aria-label="Close dashboard customizer"><X size={14} /></button></header><DashboardCustomizer compact layout={layout} config={config} onLayoutChange={selectLayout} onConfigChange={changeConfig} /></div>}
      </>
    ),
  }), [changeConfig, config, isCustomizing, isEditingLayout, layout, selectLayout]);
  useWorkspaceToolbar(toolbarConfig);

  const renderModule = (moduleId) => {
    const module = modules[moduleId];
    return (
      <ModuleCard
        key={moduleId}
        moduleId={moduleId}
        icon={module.icon}
        title={module.title}
        cardRef={(element) => {
          if (element) moduleRefs.current.set(moduleId, element);
          else moduleRefs.current.delete(moduleId);
        }}
        browseActive={effectiveActiveModuleId === moduleId}
        onBrowseFocus={() => setActiveModuleId(moduleId)}
        onBrowseMove={(key) => moveBrowseFocus(moduleId, key)}
        onQuickCapture={() => openQuickCapture({ mode: "task" })}
        collapsed={collapsed[moduleId]}
        onToggle={() => toggle(moduleId)}
        onViewFull={module.onViewFull}
        editing={isEditingLayout}
        dragging={draggedModule === moduleId}
        size={config.sizes[moduleId]}
        onMove={(direction) => moveModule(moduleId, direction)}
        onResizePreview={setPreviewTracks}
        onResizeCommit={commitTrackResize}
        onResizeCancel={() => setPreviewTracks(null)}
        onDragStart={() => setDraggedModule(moduleId)}
        onDragEnd={() => setDraggedModule(null)}
        onReorder={(targetModule) => dropModule(targetModule, moduleId)}
      >
        {module.body}
      </ModuleCard>
    );
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-scroll">
        <div
          className={`dashboard-grid is-${layout} ${isEditingLayout ? "is-layout-editing" : ""}`}
          style={{
            "--dashboard-column-tracks": (previewTracks || config.tracks).columns.map((value) => `${value}fr`).join(" "),
            "--dashboard-row-tracks": (previewTracks || config.tracks).rows.map((value) => `${value}px`).join(" "),
            "--dashboard-font-family": DASHBOARD_FONT_VALUES[config.typography?.family] || DASHBOARD_FONT_VALUES.sans,
            "--dashboard-font-size": `${config.typography?.size || 11}px`,
          }}
        >
          {visibleModules.map(renderModule)}
          {visibleModules.length === 0 && <div className="dashboard-no-modules">No modules are visible. Use the customize button to add one.</div>}
        </div>
      </div>
      <NoteDrawer note={activeNote} token={token} onClose={() => setActiveNote(null)} />
      <CanvasDrawer key={activeCanvasItem ? `${activeCanvasItem.itemType}-${activeCanvasItem.course_id}-${activeCanvasItem.id}` : "empty"} item={activeCanvasItem} token={token} onClose={() => setActiveCanvasItem(null)} />
    </div>
  );
}
