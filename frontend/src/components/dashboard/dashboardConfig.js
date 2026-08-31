export const DASHBOARD_MODULES = [
  { id: "tasks", label: "Tasks" },
  { id: "schedule", label: "Schedule" },
  { id: "canvas", label: "Canvas" },
  { id: "notes", label: "Notes" },
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
  tasks: { columns: 3, rows: 3 },
  schedule: { columns: 1, rows: 1 },
  canvas: { columns: 1, rows: 1 },
  notes: { columns: 1, rows: 1 },
};

export const DEFAULT_DASHBOARD_TRACKS = {
  columns: [1, 1, 1, 1],
  rows: [150, 150, 150],
};

export const DASHBOARD_FONT_FAMILIES = [
  { id: "sans", label: "System" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

export const DEFAULT_DASHBOARD_TYPOGRAPHY = {
  family: "sans",
  size: 11,
};

export const DEFAULT_DASHBOARD_CONFIG = {
  order: DASHBOARD_MODULES.map((module) => module.id),
  hidden: [],
  sizes: DEFAULT_DASHBOARD_SIZES,
  tracks: DEFAULT_DASHBOARD_TRACKS,
  typography: DEFAULT_DASHBOARD_TYPOGRAPHY,
};

export function readDashboardLayout() {
  const stored = localStorage.getItem("canvenient-dashboard-layout");
  return ["focus", "bento", "custom"].includes(stored) ? stored : "focus";
}

export function saveDashboardLayout(layout) {
  localStorage.setItem("canvenient-dashboard-layout", layout);
  window.dispatchEvent(new Event("dashboard-settings-updated"));
}

export function readDashboardConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem("canvenient-dashboard-config") || "{}");
    const validIds = DASHBOARD_MODULES.map((module) => module.id);
    const storedOrder = Array.isArray(stored.order) ? stored.order.filter((id) => validIds.includes(id)) : [];
    const sizes = Object.fromEntries(validIds.map((id) => [
      id,
      normalizeDashboardSize(stored.sizes?.[id], DEFAULT_DASHBOARD_SIZES[id]),
    ]));
    return {
      order: [...storedOrder, ...validIds.filter((id) => !storedOrder.includes(id))],
      hidden: Array.isArray(stored.hidden) ? stored.hidden.filter((id) => validIds.includes(id)) : [],
      sizes,
      tracks: normalizeDashboardTracks(stored.tracks),
      typography: normalizeDashboardTypography(stored.typography),
    };
  } catch {
    return DEFAULT_DASHBOARD_CONFIG;
  }
}

export function normalizeDashboardTypography(typography) {
  const validFamilies = DASHBOARD_FONT_FAMILIES.map(({ id }) => id);
  const family = validFamilies.includes(typography?.family)
    ? typography.family
    : DEFAULT_DASHBOARD_TYPOGRAPHY.family;
  const requestedSize = Number(typography?.size);
  const size = Number.isFinite(requestedSize)
    ? Math.min(16, Math.max(9, Math.round(requestedSize * 2) / 2))
    : DEFAULT_DASHBOARD_TYPOGRAPHY.size;
  return { family, size };
}

export function normalizeDashboardTracks(tracks) {
  const columns = Array.isArray(tracks?.columns)
    ? tracks.columns.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const rows = Array.isArray(tracks?.rows)
    ? tracks.rows.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return {
    columns: columns.length === 4 ? columns : [...DEFAULT_DASHBOARD_TRACKS.columns],
    rows: rows.length > 0 ? rows : [...DEFAULT_DASHBOARD_TRACKS.rows],
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
