import { ArrowDown, ArrowUp, Columns3, Eye, EyeOff, Grid3X3, LayoutGrid, Type } from "lucide-react";
import { DASHBOARD_FONT_FAMILIES, DASHBOARD_MODULES, DEFAULT_DASHBOARD_TYPOGRAPHY } from "./dashboardConfig";

const FONT_PREVIEWS = {
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
  serif: "'New York', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  mono: "'SF Mono', SFMono-Regular, Menlo, Monaco, monospace",
};

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

  const typography = config.typography || DEFAULT_DASHBOARD_TYPOGRAPHY;
  const updateTypography = (change) => {
    onConfigChange({ ...config, typography: { ...typography, ...change } });
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
      <section className="dashboard-typography-settings" aria-labelledby="dashboard-typography-title">
        <header>
          <span id="dashboard-typography-title"><Type size={13} /> Typography</span>
          <output htmlFor="dashboard-font-size">{typography.size}px</output>
        </header>
        <div className="dashboard-font-options" role="group" aria-label="Dashboard font family">
          {DASHBOARD_FONT_FAMILIES.map((font) => (
            <button
              key={font.id}
              type="button"
              className={typography.family === font.id ? "is-active" : ""}
              onClick={() => updateTypography({ family: font.id })}
              style={{ fontFamily: FONT_PREVIEWS[font.id] }}
              aria-pressed={typography.family === font.id}
            >
              {font.label}
            </button>
          ))}
        </div>
        <label className="dashboard-font-size-control" htmlFor="dashboard-font-size">
          <span>Text size</span>
          <input
            id="dashboard-font-size"
            type="range"
            min="9"
            max="16"
            step="0.5"
            value={typography.size}
            onChange={(event) => updateTypography({ size: Number(event.target.value) })}
          />
        </label>
      </section>
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
