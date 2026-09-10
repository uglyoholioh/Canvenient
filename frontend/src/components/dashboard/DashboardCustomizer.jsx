import { ArrowDown, ArrowUp, Columns3, Eye, EyeOff, Grid3X3, LayoutGrid } from "lucide-react";
import { DASHBOARD_MODULES } from "./dashboardConfig";

export default function DashboardCustomizer({ layout, config, onLayoutChange, onConfigChange, compact = false }) {
  const updateVisibility = (moduleId) => {
    const hidden = config.hidden.includes(moduleId)
      ? config.hidden.filter((id) => id !== moduleId)
      : [...config.hidden, moduleId];
    onConfigChange({ ...config, hidden });
  };

  const move = (moduleId, direction) => {
    const index = config.order.indexOf(moduleId);
    const target = index + direction;
    if (target < 0 || target >= config.order.length) return;
    const order = [...config.order];
    [order[index], order[target]] = [order[target], order[index]];
    onConfigChange({ ...config, order });
  };


  return (
    <div className={`dashboard-customizer ${compact ? "is-compact" : ""}`}>
      <div className="dashboard-layout-options">
        <button type="button" className={layout === "focus" ? "is-active" : ""} onClick={() => onLayoutChange("focus")}>
          <Columns3 size={15} /><span>Focus + Sidebar</span>
        </button>
        <button type="button" className={layout === "bento" ? "is-active" : ""} onClick={() => onLayoutChange("bento")}>
          <LayoutGrid size={15} /><span>Bento Grid</span>
        </button>
        <button type="button" className={layout === "custom" ? "is-active" : ""} onClick={() => onLayoutChange("custom")}>
          <Grid3X3 size={15} /><span>Custom Grid</span>
        </button>
      </div>
      <p className="dashboard-customizer-hint">Choose Edit to move cards or resize them from any edge. Shared edges adjust neighboring cards live.</p>

      <div className="dashboard-module-settings">
        {config.order.map((moduleId, index) => {
          const module = DASHBOARD_MODULES.find((item) => item.id === moduleId);
          const visible = !config.hidden.includes(moduleId);
          return (
            <div className="dashboard-module-setting" key={moduleId}>
              <button type="button" className="module-visibility" onClick={() => updateVisibility(moduleId)} aria-label={`${visible ? "Hide" : "Show"} ${module.label}`}>
                {visible ? <Eye size={14} /> : <EyeOff size={14} />}<span>{module.label}</span>
              </button>
              <div>
                <button type="button" onClick={() => move(moduleId, -1)} disabled={index === 0} aria-label={`Move ${module.label} up`}><ArrowUp size={13} /></button>
                <button type="button" onClick={() => move(moduleId, 1)} disabled={index === config.order.length - 1} aria-label={`Move ${module.label} down`}><ArrowDown size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
