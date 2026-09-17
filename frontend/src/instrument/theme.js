// Theme preference for the draft: instrument-dark, instrument-light, system.
// Stored in the existing canvenient-theme key; legacy values map onto the two
// instrument materials.

export const INSTRUMENT_THEMES = ["instrument-dark", "instrument-light"];

export function resolveTheme(preference) {
  if (preference === "instrument-light" || preference === "light") return "instrument-light";
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "instrument-dark"
      : "instrument-light";
  }
  return "instrument-dark";
}

export function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

export function setThemePreference(preference) {
  localStorage.setItem("canvenient-theme", preference);
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent("canvenient-theme-changed", { detail: { preference } }));
  window.dispatchEvent(new CustomEvent("settings-updated"));
}

export function getThemePreference() {
  return localStorage.getItem("canvenient-theme") || "instrument-dark";
}
