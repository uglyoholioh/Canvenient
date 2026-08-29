import { ChevronDown, Maximize2 } from "lucide-react";

export default function ModuleCard({ icon: Icon, title, collapsed, onToggle, onViewFull, children, className = "" }) {
  return (
    <section className={`dashboard-module ${collapsed ? "is-collapsed" : ""} ${className}`}>
      <header className="dashboard-module-header">
        <button type="button" className="module-collapse-button" onClick={onToggle} aria-expanded={!collapsed}>
          <Icon size={16} /><span>{title}</span><ChevronDown size={14} className="module-chevron" />
        </button>
        {onViewFull && <button type="button" className="module-view-full" onClick={onViewFull} aria-label={`Open full ${title}`} title={`Open full ${title}`}><Maximize2 size={13} /></button>}
      </header>
      {!collapsed && <div className="dashboard-module-body">{children}</div>}
    </section>
  );
}
