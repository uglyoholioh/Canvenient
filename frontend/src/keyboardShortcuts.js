export const KEYBOARD_SHORTCUTS_STORAGE_KEY = "canvenient-keyboard-shortcuts";

export const DEFAULT_KEYBOARD_SHORTCUTS = {
  quickTask: "Meta+N",
  quickNote: "Meta+Shift+N",
  search: "Meta+K",
  tasksPanel: "Shift+Tab",
  assistant: "Meta+I",
};

const MODIFIER_ORDER = ["Meta", "Control", "Alt", "Shift"];

function normalizeKey(key) {
  if (!key) return "";
  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function shortcutFromKeyboardEvent(event) {
  const key = normalizeKey(event.key);
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return "";
  const modifiers = [];
  if (event.metaKey) modifiers.push("Meta");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return [...modifiers, key].filter(Boolean).join("+");
}

export function normalizeShortcut(value, fallback = "") {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = normalizeKey(parts.find((part) => !MODIFIER_ORDER.includes(part)) || "");
  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier));
  return key ? [...modifiers, key].join("+") : fallback;
}

export function readKeyboardShortcuts() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY) || "{}");
    return {
      quickTask: normalizeShortcut(stored.quickTask, DEFAULT_KEYBOARD_SHORTCUTS.quickTask),
      quickNote: normalizeShortcut(stored.quickNote, DEFAULT_KEYBOARD_SHORTCUTS.quickNote),
      search: normalizeShortcut(stored.search, DEFAULT_KEYBOARD_SHORTCUTS.search),
      tasksPanel: normalizeShortcut(
        stored.tasksPanel || stored.browseCapture,
        DEFAULT_KEYBOARD_SHORTCUTS.tasksPanel,
      ),
      assistant: normalizeShortcut(stored.assistant, DEFAULT_KEYBOARD_SHORTCUTS.assistant),
    };
  } catch {
    return { ...DEFAULT_KEYBOARD_SHORTCUTS };
  }
}

export function saveKeyboardShortcuts(shortcuts) {
  const next = {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    ...shortcuts,
  };
  localStorage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("keyboard-shortcuts-updated", { detail: next }));
  return next;
}

export function matchesShortcut(event, shortcut) {
  return Boolean(shortcut) && shortcutFromKeyboardEvent(event) === normalizeShortcut(shortcut);
}

export function formatShortcut(shortcut) {
  const values = normalizeShortcut(shortcut).split("+").filter(Boolean);
  return values
    .map(
      (value) =>
        ({
          Meta: "⌘",
          Control: "⌃",
          Alt: "⌥",
          Shift: "⇧",
          Space: "Space",
          Escape: "Esc",
        })[value] || value,
    )
    .join("");
}

export function isEditableShortcutTarget(target) {
  return Boolean(
    target?.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}
