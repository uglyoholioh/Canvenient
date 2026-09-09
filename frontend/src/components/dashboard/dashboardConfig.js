export const DASHBOARD_MODULES = [
  { id: "tasks", label: "Tasks" },
  { id: "schedule", label: "Schedule" },
  { id: "isb", label: "NUS ISB" },
  { id: "canvas", label: "Canvas" },
  { id: "notes", label: "Notes" },
  { id: "aibrief", label: "AI Brief" },
  { id: "studytimer", label: "Study Timer" },
  { id: "wheel", label: "Wheel" },
];

const LEGACY_DASHBOARD_SIZES = {
  small: { columns: 1, rows: 1 },
  medium: { columns: 2, rows: 1 },
  wide: { columns: 3, rows: 1 },
  tall: { columns: 1, rows: 2 },
  large: { columns: 2, rows: 2 },
  hero: { columns: 3, rows: 3 },
  full: { columns: 4, rows: 1 },
};

export const DEFAULT_DASHBOARD_SIZES = {
  tasks: { columns: 2, rows: 2 },
  schedule: { columns: 1, rows: 1 },
  isb: { columns: 1, rows: 1 },
  canvas: { columns: 1, rows: 2 },
  notes: { columns: 1, rows: 1 },
  aibrief: { columns: 2, rows: 1 },
  studytimer: { columns: 1, rows: 1 },
  wheel: { columns: 1, rows: 1 },
};

export const DEFAULT_DASHBOARD_TRACKS = {
  columns: [0.25, 0.25, 0.25, 0.25],
  rows: [220, 520],
};

export const DEFAULT_DASHBOARD_CONFIG = {
  order: ["tasks", "schedule", "canvas", "isb"],
  hidden: ["notes", "aibrief", "studytimer", "wheel"],
  sizes: DEFAULT_DASHBOARD_SIZES,
  tracks: DEFAULT_DASHBOARD_TRACKS,
};

export function threeColumnDashboardConfig(config = DEFAULT_DASHBOARD_CONFIG) {
  const hidden = (config.hidden || []).filter((id) => !["tasks", "schedule", "canvas", "isb"].includes(id));
  if (!hidden.includes("notes")) {
    hidden.push("notes");
  }
  return {
    ...config,
    order: ["tasks", "schedule", "canvas", "isb"],
    hidden,
    sizes: { ...config.sizes, ...DEFAULT_DASHBOARD_SIZES },
    tracks: { ...DEFAULT_DASHBOARD_TRACKS },
  };
}


export function readDashboardLayout() {
  const stored = localStorage.getItem("canvenient-dashboard-layout");
  return ["focus", "bento", "custom"].includes(stored) ? stored : "focus";
}

export function saveDashboardLayout(layout) {
  localStorage.setItem("canvenient-dashboard-layout", layout);
  window.dispatchEvent(new Event("dashboard-settings-updated"));
}

export function readDashboardConfig() {
  const raw = localStorage.getItem("canvenient-dashboard-config");
  if (!raw) return DEFAULT_DASHBOARD_CONFIG;
  try {
    const stored = JSON.parse(raw);
    const validIds = DASHBOARD_MODULES.map((module) => module.id);
    const storedOrder = Array.isArray(stored.order) ? stored.order.filter((id) => validIds.includes(id)) : [];
    const storedHidden = Array.isArray(stored.hidden) ? stored.hidden.filter((id) => validIds.includes(id)) : [];
    
    const missing = validIds.filter((id) => !storedOrder.includes(id) && !storedHidden.includes(id));
    const missingOrder = missing.filter((id) => DEFAULT_DASHBOARD_CONFIG.order.includes(id));
    const missingHidden = missing.filter((id) => DEFAULT_DASHBOARD_CONFIG.hidden.includes(id));

    const sizes = Object.fromEntries(validIds.map((id) => [
      id,
      normalizeDashboardSize(stored.sizes?.[id], DEFAULT_DASHBOARD_SIZES[id]),
    ]));
    return {
      order: [...storedOrder, ...missingOrder],
      hidden: [...storedHidden, ...missingHidden],
      sizes,
      tracks: normalizeDashboardTracks(stored.tracks),
    };
  } catch {
    return DEFAULT_DASHBOARD_CONFIG;
  }
}

export function normalizeDashboardTracks(tracks) {
  const rawColumns = Array.isArray(tracks?.columns)
    ? tracks.columns.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const rawRows = Array.isArray(tracks?.rows)
    ? tracks.rows.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];

  let columns = (rawColumns.length === 3 || rawColumns.length === 4) ? rawColumns : [...DEFAULT_DASHBOARD_TRACKS.columns];
  const rows = rawRows.length > 0 ? rawRows : [...DEFAULT_DASHBOARD_TRACKS.rows];

  const snapToFraction = 12;
  const colTotal = columns.reduce((s, v) => s + v, 0);
  const snappedColumns = columns.map((value) => Math.round((value / colTotal) * snapToFraction) / snapToFraction);
  const sum = snappedColumns.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) {
    const diff = Math.round((1 - sum) * snapToFraction);
    const maxIdx = snappedColumns.indexOf(Math.max(...snappedColumns));
    snappedColumns[maxIdx] += (diff / snapToFraction);
  }

  return {
    columns: snappedColumns,
    rows: rows,
  };
}


export function normalizeDashboardSize(size, fallback = { columns: 1, rows: 1 }) {
  const candidate = typeof size === "string" ? LEGACY_DASHBOARD_SIZES[size] : size;
  if (!candidate || typeof candidate !== "object") return { ...fallback };
  const columns = Number(candidate.columns);
  const rows = Number(candidate.rows);
  if (!Number.isFinite(columns) || !Number.isFinite(rows)) return { ...fallback };
  return {
    columns: Math.min(4, Math.max(1, Math.round(columns))),
    rows: Math.min(4, Math.max(1, Math.round(rows))),
  };
}

export function saveDashboardConfig(config) {
  localStorage.setItem("canvenient-dashboard-config", JSON.stringify(config));
  window.dispatchEvent(new Event("dashboard-settings-updated"));
}
