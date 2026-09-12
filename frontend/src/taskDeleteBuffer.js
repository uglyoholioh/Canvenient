import { deleteTask } from "./api";
import { notifyTasksChanged } from "./taskEvents";

const PENDING_DELETIONS = new Map();
const FLUSH_DELAY_MS = 5000;

export function queueTaskDeletion(token, task) {
  if (PENDING_DELETIONS.has(task.id)) return;

  const timeoutId = setTimeout(async () => {
    PENDING_DELETIONS.delete(task.id);
    try {
      await deleteTask(token, task.id);
      notifyTasksChanged();
    } catch (error) {
      console.error("Failed to flush task deletion:", error);
    }
  }, FLUSH_DELAY_MS);

  PENDING_DELETIONS.set(task.id, { task, timeoutId, token });

  // Show undo toast
  window.dispatchEvent(
    new CustomEvent("canvenient-toast", {
      detail: {
        message: `Deleted "${task.title}"`,
        actionLabel: "Undo",
        onAction: () => undoTaskDeletion(task.id),
        timeout: FLUSH_DELAY_MS,
      },
    }),
  );
}

export function undoTaskDeletion(taskId) {
  const pending = PENDING_DELETIONS.get(taskId);
  if (!pending) return;

  clearTimeout(pending.timeoutId);
  PENDING_DELETIONS.delete(taskId);

  window.dispatchEvent(
    new CustomEvent("canvenient-task-restored", {
      detail: pending.task,
    }),
  );
  notifyTasksChanged();
}

export function flushPendingDeletions() {
  for (const [taskId, pending] of PENDING_DELETIONS.entries()) {
    clearTimeout(pending.timeoutId);
    PENDING_DELETIONS.delete(taskId);
    deleteTask(pending.token, taskId).catch(console.error);
  }
}

window.addEventListener("beforeunload", flushPendingDeletions);
