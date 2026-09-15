// Overdue selection for the My Day triage sheet.

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function dueDate(task) {
  const raw = task.effective_due_at || task.due_at_override || task.source_due_at;
  if (!raw) return null;
  const due = new Date(raw);
  return Number.isNaN(due.getTime()) ? null : due;
}

export function collectOverdue(tasks) {
  const todayStart = startOfToday();
  return (tasks || [])
    .filter((task) => task.status !== "done")
    .map((task) => ({ ...task, _due: dueDate(task) }))
    .filter((task) => task._due && task._due < todayStart)
    .sort((left, right) => left._due - right._due);
}
