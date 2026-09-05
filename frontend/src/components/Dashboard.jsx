import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Search, SlidersHorizontal, X } from "lucide-react";
import CanvasDrawer from "./drawers/CanvasDrawer";
import CanvasModule from "./dashboard/CanvasModule";
import ModuleCard from "./dashboard/ModuleCard";
import ScheduleModule from "./dashboard/ScheduleModule";
import CampusBusModule from "./dashboard/CampusBusModule";
import TasksModule from "./dashboard/TasksModule";
import DashboardCustomizer from "./dashboard/DashboardCustomizer";
import { readDashboardConfig, readDashboardLayout, saveDashboardConfig, saveDashboardLayout, threeColumnDashboardConfig } from "./dashboard/dashboardConfig";
import { useQuickCapture } from "./QuickCaptureContext";
import { WorkspaceToolbarContext } from "./WorkspaceToolbarContext";
import { useContext } from "react";



export default function Dashboard({ token, user, onNavigate, onOpenSearch, searchShortcutLabel }) {
  const { openQuickCapture } = useQuickCapture();
  const setToolbar = useContext(WorkspaceToolbarContext);
  const [activeCanvasItem, setActiveCanvasItem] = useState(null);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [layout, setLayout] = useState(readDashboardLayout);
  const [config, setConfig] = useState(readDashboardConfig);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [draggedModule, setDraggedModule] = useState(null);
  const [previewTracks, setPreviewTracks] = useState(null);
  const [activeModuleId, setActiveModuleId] = useState("tasks");
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const moduleRefs = useRef(new Map());

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);

  useEffect(() => {
    const layoutKey = "canvenient-dashboard-three-column-layout";
    if (localStorage.getItem(layoutKey) === "9") return;
    Promise.resolve().then(() => {
      const nextConfig = threeColumnDashboardConfig(readDashboardConfig());
      saveDashboardConfig(nextConfig);
      saveDashboardLayout("focus");
      setConfig(nextConfig);
      setLayout("focus");
      localStorage.setItem(layoutKey, "9");
    });
  }, []);

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
    window.addEventListener("canvenient-task-created", refreshTasks);
    window.addEventListener("canvenient-task-restored", refreshTasks);
    return () => {
      window.removeEventListener("canvenient-tasks-changed", refreshTasks);
      window.removeEventListener("canvenient-task-created", refreshTasks);
      window.removeEventListener("canvenient-task-restored", refreshTasks);
    };
  }, [token]);

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
      title: "Tasks",
      onViewFull: () => onNavigate("tasks"),
      body: <TasksModule token={token} refreshKey={taskRefreshKey} />,
    },
    schedule: {
      title: "Schedule",
      onViewFull: () => onNavigate("schedule"),
      body: <ScheduleModule token={token} onNavigate={onNavigate} />,
    },
    isb: {
      title: "NUS ISB",
      body: <CampusBusModule token={token} />,
    },
    canvas: {
      title: "Canvas",
      onViewFull: () => onNavigate("canvas"),
      body: <CanvasModule token={token} enabled={Boolean(user?.canvas_token)} onOpenItem={setActiveCanvasItem} />,
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

  const renderModule = (moduleId) => {
    const module = modules[moduleId];
    return (
      <ModuleCard
        key={moduleId}
        moduleId={moduleId}
        title={module.title}
        cardRef={(element) => {
          if (element) moduleRefs.current.set(moduleId, element);
          else moduleRefs.current.delete(moduleId);
        }}
        browseActive={effectiveActiveModuleId === moduleId}
        onBrowseFocus={() => setActiveModuleId(moduleId)}
        onBrowseMove={(key) => moveBrowseFocus(moduleId, key)}
        onQuickCapture={() => openQuickCapture({ mode: "task" })}
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

  const today = new Date();
  const dayLabel = today.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  
  useEffect(() => {
    if (!setToolbar) return;
    setToolbar({
      title: dayLabel,
      hideSearch: false,
      actions: (
        <>
            <button
              type="button"
              className={`dashboard-edit-button ${isEditingLayout ? "is-active" : ""}`}
              onClick={() => isEditingLayout ? setIsEditingLayout(false) : beginLayoutEdit()}
              aria-label={isEditingLayout ? "Finish editing dashboard layout" : "Edit dashboard layout"}
              title={isEditingLayout ? "Done" : "Edit layout"}
            >
              {isEditingLayout ? <Check size={15} /> : <Pencil size={15} />}
            </button>
            <button type="button" className={`dashboard-customize-button ${isCustomizing ? "is-active" : ""}`} onClick={() => setIsCustomizing((open) => !open)} aria-label="Customize dashboard" title="Customize dashboard"><SlidersHorizontal size={15} /></button>
            {isCustomizing && <div className="dashboard-customizer-popover is-in-toolbar"><header><strong>Customize dashboard</strong><button type="button" onClick={() => setIsCustomizing(false)} aria-label="Close dashboard customizer"><X size={14} /></button></header><DashboardCustomizer compact layout={layout} config={config} onLayoutChange={selectLayout} onConfigChange={changeConfig} /></div>}
        </>
      )
    });
    return () => setToolbar(null);
  }, [setToolbar, dayLabel, isEditingLayout, beginLayoutEdit, isCustomizing, layout, config, selectLayout, changeConfig]);

  const rawGridTracks = previewTracks || config.tracks;
  const gridTracks = useMemo(() => {
    if (!rawGridTracks || !rawGridTracks.columns) return rawGridTracks;
    const columns = rawGridTracks.columns;
    const snapToFraction = 12;
    const colTotal = columns.reduce((s, v) => s + v, 0);
    const snapped = columns.map((value) => Math.round((value / colTotal) * snapToFraction) / snapToFraction);
    const sum = snapped.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      const diff = Math.round((1 - sum) * snapToFraction);
      const maxIdx = snapped.indexOf(Math.max(...snapped));
      snapped[maxIdx] += (diff / snapToFraction);
    }
    return { ...rawGridTracks, columns: snapped };
  }, [rawGridTracks]);

  const totalRequestedRowHeight = gridTracks.rows.reduce((sum, value) => sum + value, 0) || 1;
  const availableGridHeight = Math.max(gridTracks.rows.length * 96, Math.min(gridTracks.rows.length * 400, viewportHeight - 120));
  const rowScale = availableGridHeight / totalRequestedRowHeight;

  return (
    <div className="dashboard-page">
      <div className="dashboard-scroll">
        <div
          className={`dashboard-grid is-${layout} ${isEditingLayout ? "is-layout-editing" : ""}`}
          style={{
            "--dashboard-column-tracks": gridTracks.columns.map((value) => `${value}fr`).join(" "),
            "--dashboard-row-tracks": gridTracks.rows.map((value) => `${Math.max(72, Math.round(value * rowScale))}px`).join(" "),
          }}
        >
          {visibleModules.map(renderModule)}
          {visibleModules.length === 0 && <div className="dashboard-no-modules">No modules are visible. Use the customize button to add one.</div>}
        </div>
      </div>
      <CanvasDrawer key={activeCanvasItem ? `${activeCanvasItem.itemType}-${activeCanvasItem.course_id}-${activeCanvasItem.id}` : "empty"} item={activeCanvasItem} token={token} onClose={() => setActiveCanvasItem(null)} />
    </div>
  );
}
