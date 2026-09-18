// Persisted Home customisation — one key, one event. Views read through
// useDashboardConfig and re-render when anything changes anywhere.

export const DASHBOARD_KEY = "canvenient.instrument.dashboard";
export const DASHBOARD_EVENT = "canvenient-dashboard-changed";

export const DASHBOARD_DEFAULTS = {
  clock: "24h", // "24h" | "12h"
  seconds: true,
  font: "rounded", // "rounded" | "standard" | "serif"
  layout: "ledger", // "ledger" | "columns" | "focus"
  dayView: "timeline", // "timeline" | "rail" | "none"
  brief: true,
  dues: true,
  exams: true,
  busCard: "board", // variant id — see busCards.jsx
  horizon: { view: "columns", range: 14, label: "" }, // label "" = no caption
};

const CHOICES = {
  clock: ["24h", "12h"],
  font: ["rounded", "standard", "serif"],
  layout: ["ledger", "columns", "focus"],
  dayView: ["timeline", "rail", "none"],
  busCard: ["board", "hero", "ribbon", "chips", "line"],
  "horizon.view": ["columns", "strip", "list"],
  "horizon.range": [7, 14],
};

function sanitize(raw) {
  const out = {};
  for (const key of Object.keys(DASHBOARD_DEFAULTS)) {
    const value = raw?.[key];
    if (key === "horizon") {
      if (value === undefined) continue;
      out.horizon = { ...DASHBOARD_DEFAULTS.horizon };
      if (CHOICES["horizon.view"].includes(value?.view)) out.horizon.view = value.view;
      if (CHOICES["horizon.range"].includes(value?.range)) out.horizon.range = value.range;
      if (typeof value?.label === "string") out.horizon.label = value.label.slice(0, 24);
      continue;
    }
    if (CHOICES[key]?.includes(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function readDashboardConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(DASHBOARD_KEY) || "null");
    return { ...DASHBOARD_DEFAULTS, ...sanitize(raw) };
  } catch {
    return { ...DASHBOARD_DEFAULTS };
  }
}

// An invalid patch value never overwrites what is already stored — the patch
// is sanitized alone and only its valid keys land.
export function writeDashboardConfig(patch) {
  const next = { ...readDashboardConfig(), ...sanitize(patch) };
  localStorage.setItem(DASHBOARD_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(DASHBOARD_EVENT, { detail: next }));
  return next;
}
