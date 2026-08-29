import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { deleteTask, getTasks, updateTask } from "../../api";

function taskDueDate(task) {
  const raw = task.effective_due_at || task.due_at_override || task.source_due_at;
  if (!raw) return null;
  const normalized = typeof raw === "string" && !raw.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localInputValue(value) {
  const date = value ? new Date(value) : new Date();
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

export default function TasksModule({ token, refreshKey = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getTasks(token)
      .then((data) => { setTasks((data || []).filter((task) => task.status !== "done")); setError(""); })
      .catch((loadError) => setError(loadError.message || "Could not load tasks."));
  }, [token, refreshKey]);

  const visibleTasks = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    return tasks.filter((task) => {
      const due = taskDueDate(task);
      if (filter === "today") return due && due >= now && due <= todayEnd;
      if (filter === "overdue") return due && due < now;
      if (filter === "priority") return ["urgent", "high"].includes(task.priority_manual);
      return true;
    }).sort((a, b) => (taskDueDate(a)?.getTime() || Infinity) - (taskDueDate(b)?.getTime() || Infinity));
  }, [filter, tasks]);

  const openTask = (task) => {
    const opening = expandedId !== task.id;
    setExpandedId(opening ? task.id : null);
    if (opening) {
      setDraftTitle(task.title);
      setDraftDue(localInputValue(taskDueDate(task)));
    }
  };
  const complete = async (task) => {
    await updateTask(token, task.id, { status: "done" });
    setTasks((current) => current.filter((item) => item.id !== task.id));
  };
  const save = async (task) => {
    const updated = await updateTask(token, task.id, { title: draftTitle.trim(), due_at_override: draftDue ? new Date(draftDue).toISOString() : null });
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    setExpandedId(null);
  };
  const remove = async (task) => {
    await deleteTask(token, task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));
  };

  return (
    <div className="tasks-module">
      <div className="module-filter-tabs" role="tablist">
        {["all", "today", "overdue", "priority"].map((value) => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}
      </div>
      {error ? <div className="module-error">{error}</div> : visibleTasks.length === 0 ? <div className="module-empty">Nothing in this view.</div> : (
        <div className="module-list">
          {visibleTasks.slice(0, 10).map((task) => {
            const due = taskDueDate(task);
            return (
              <div className={`module-list-item task-module-item ${expandedId === task.id ? "is-expanded" : ""}`} key={task.id}>
                <button type="button" className="module-item-main" onClick={() => openTask(task)}>
                  <span className={`priority-dot is-${task.priority_manual}`} />
                  <span className="module-item-copy"><strong>{task.title}</strong><small>{task.module_code || "Personal"}{due ? ` · ${due.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</small></span>
                </button>
                {expandedId === task.id && (
                  <div className="task-inline-editor">
                    <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} aria-label="Task title" />
                    <input type="datetime-local" value={draftDue} onChange={(event) => setDraftDue(event.target.value)} aria-label="Due date" />
                    <div className="task-inline-actions">
                      <button type="button" onClick={() => complete(task)}><Check size={13} />Complete</button>
                      <button type="button" onClick={() => save(task)}><Pencil size={13} />Save</button>
                      <button type="button" onClick={() => setDraftDue(localInputValue(new Date(Date.now() + 86400000)))}><CalendarClock size={13} />Tomorrow</button>
                      <button type="button" className="is-danger" onClick={() => remove(task)}><Trash2 size={13} />Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tasks.length > 10 && <div className="module-footnote"><RotateCcw size={11} />Showing the next 10 tasks</div>}
    </div>
  );
}
