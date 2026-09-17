// Tasks — a dense table of record. Overdue at the top as facts, capture
// docked at the bottom, no triage ceremony.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAcademicModules, getTasks, updateTask, deleteTask } from "../../api";
import { getTaskModuleColor, taskDueDate } from "../../components/scheduleUtils";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import TaskInputBar from "../../components/TaskInputBar";
import "./tasks.css";

function timeHM(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dueCell(due, now) {
  if (!due) return "—";
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dueStart = new Date(due);
  dueStart.setHours(0, 0, 0, 0);
  const days = Math.round((dueStart - dayStart) / 86400000);
  const time = timeHM(due);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days === -1) return `yesterday ${time}`;
  const sameYear = due.getFullYear() === now.getFullYear();
  const date = due.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${date} ${time}`;
}

export default function TasksView({ token }) {
  const [tasks, setTasks] = useState([]);
  const [modules, setModules] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("open"); // open | done | all
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const [tasksRes, modulesRes] = await Promise.allSettled([
      getTasks(token),
      getAcademicModules(token),
    ]);
    setTasks(tasksRes.status === "fulfilled" ? tasksRes.value || [] : []);
    setModules(modulesRes.status === "fulfilled" ? modulesRes.value || [] : []);
    setLoaded(true);
  }, [token]);

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener("canvenient-tasks-changed", onChanged);
    window.addEventListener("canvenient-task-created", onChanged);
    return () => {
      window.removeEventListener("canvenient-tasks-changed", onChanged);
      window.removeEventListener("canvenient-task-created", onChanged);
    };
  }, [load]);

  const { openTasks, doneTasks, overdueCount } = useMemo(() => {
    const open = [];
    const done = [];
    let overdue = 0;
    for (const task of tasks) {
      const due = taskDueDate(task);
      if (task.status === "done" || task.status === "completed") done.push(task);
      else {
        open.push(task);
        if (due && due < now) overdue += 1;
      }
    }
    open.sort((a, b) => {
      const da = taskDueDate(a) || new Date(8640000000000000);
      const db = taskDueDate(b) || new Date(8640000000000000);
      return da - db;
    });
    done.sort((a, b) => taskDueDate(b) || 0 - (taskDueDate(a) || 0));
    return { openTasks: open, doneTasks: done, overdueCount: overdue };
  }, [tasks, now]);

  const visible = filter === "done" ? doneTasks : openTasks;

  const fact = useMemo(() => {
    if (!loaded) return "";
    const bits = [`${openTasks.length} open`];
    if (overdueCount) bits.push(`${overdueCount} overdue`);
    return bits.join(" · ");
  }, [loaded, openTasks.length, overdueCount]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const toggle = useCallback(
    async (task) => {
      const done = task.status === "done" || task.status === "completed";
      const nextStatus = done ? "pending" : "done";
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
      try {
        await updateTask(token, task.id, { status: nextStatus });
        window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
      } catch {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      }
    },
    [token],
  );

  const remove = useCallback(
    async (task) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      try {
        await deleteTask(token, task.id);
        window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
      } catch {
        load();
      }
    },
    [token, load],
  );

  const renderRow = (task, isDone) => {
    const due = taskDueDate(task);
    const color = getTaskModuleColor(task, modules);
    const isOverdue = !isDone && due && due < now;
    return (
      <tr key={task.id} className={isOverdue ? "is-overdue" : ""}>
        <td className="ins-tasks-check">
          <input
            type="checkbox"
            className="ins-check"
            checked={isDone}
            onChange={() => toggle(task)}
            aria-label={isDone ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          />
        </td>
        <td className="ins-tasks-title">
          <span className="ins-tick" style={{ "--tick-color": color || "var(--ins-ink-faint)" }} />
          <span className={isDone ? "is-done" : ""}>{task.title}</span>
        </td>
        <td className="ins-tasks-module ins-mono">{task.module_code || ""}</td>
        <td className={`ins-tasks-due ins-mono${isOverdue ? " is-overdue" : ""}`}>
          {dueCell(due, now)}
        </td>
        <td className="ins-tasks-actions">
          <button
            type="button"
            className="ins-iconbtn"
            onClick={() => remove(task)}
            aria-label={`Delete ${task.title}`}
            title="Delete"
          >
            ×
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="ins-tasks">
      <div className="ins-tasks-toolbar">
        <button
          type="button"
          className="ins-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("canvenient-open-triage"))}
        >
          Triage
        </button>
        <div className="ins-seg">
          {[
            ["open", `Open ${openTasks.length}`],
            ["done", `Done ${doneTasks.length}`],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "is-active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ins-tasks-tablewrap">
        {loaded && visible.length === 0 ? (
          <div className="ins-empty">
            {filter === "open" ? (
              <span>
                No open tasks — captured ones land here. <kbd className="ins-kbd">⌘N</kbd>
              </span>
            ) : (
              <span>Nothing completed yet</span>
            )}
          </div>
        ) : (
          <table className="ins-table ins-tasks-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Task</th>
                <th style={{ width: 90 }}>Module</th>
                <th style={{ width: 130 }}>Due</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>{visible.map((task) => renderRow(task, filter === "done"))}</tbody>
          </table>
        )}
      </div>

      <div className="ins-tasks-composer">
        <TaskInputBar
          token={token}
          variant="inline"
          isOpen={true}
          initialMode="task"
          allowedModes={["task", "note"]}
          showCancel={false}
          onTaskCreated={() => window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"))}
        />
      </div>
    </div>
  );
}
