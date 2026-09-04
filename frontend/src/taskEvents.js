export function notifyTasksChanged() {
  window.dispatchEvent(new Event("canvenient-tasks-changed"));
}
