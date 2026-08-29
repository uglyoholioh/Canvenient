import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Calendar, CheckCircle, Flag } from "lucide-react";
import { getTasks, updateTask } from "../api";
import TaskInputBar from "./TaskInputBar";

function normalizeDate(value) {
  if (!value) return null;
  const normalized = typeof value === "string" && !value.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDueDate(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function priorityColor(priority) {
  if (priority === "urgent") return "var(--danger)";
  if (priority === "high") return "var(--warning)";
  if (priority === "medium") return "var(--accent)";
  return "var(--text-muted)";
}

export default function TaskView({ token }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [checkboxStyle, setCheckboxStyle] = useState(() => localStorage.getItem("canvenient-checkbox-style") || "brackets");
  const itemRefs = useRef({});
  const editRef = useRef(null);

  const loadTasks = useCallback(async () => {
    try {
      const data = await getTasks(token);
      setTasks((data || []).filter((task) => task?.status !== "done").sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => {
    const updateSettings = () => setCheckboxStyle(localStorage.getItem("canvenient-checkbox-style") || "brackets");
    window.addEventListener("settings-updated", updateSettings);
    return () => window.removeEventListener("settings-updated", updateSettings);
  }, []);
  useEffect(() => { itemRefs.current[selectedIndex]?.focus(); }, [selectedIndex]);
  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);

  const completeTask = useCallback(async (task) => {
    await updateTask(token, task.id, { status: "done" });
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSelectedIndex(null);
  }, [token]);

  const saveEdit = async (task) => {
    if (!editValue.trim()) return;
    const updated = await updateTask(token, task.id, { title: editValue.trim() });
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, title: updated.title } : item));
    setEditingId(null);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (editingId !== null || selectedIndex === null) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => index < tasks.length - 1 ? index + 1 : null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        completeTask(tasks[selectedIndex]);
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setEditingId(tasks[selectedIndex].id);
        setEditValue(`${tasks[selectedIndex].title}${event.key}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [completeTask, editingId, selectedIndex, tasks]);

  return (
    <div className="task-view">
      <div className="task-feed">
        {loading ? <div className="empty-state">Loading tasks...</div> : tasks.length === 0 ? (
          <div className="empty-state"><strong>No tasks pending</strong><span>Type below to add a task, note, or command.</span></div>
        ) : tasks.map((task, index) => {
          const selected = selectedIndex === index;
          const editing = editingId === task.id;
          return (
            <div key={task.id} ref={(element) => { itemRefs.current[index] = element; }} tabIndex="-1" className={`task-row ${selected ? "is-selected" : ""}`} onClick={() => setSelectedIndex(index)}>
              <button type="button" tabIndex="-1" className="task-check" onClick={(event) => { event.stopPropagation(); completeTask(task); }}>
                {checkboxStyle === "icon" ? <CheckCircle size={16} /> : checkboxStyle === "circle" ? "( )" : "[ ]"}
              </button>
              {editing ? (
                <textarea ref={editRef} value={editValue} onChange={(event) => setEditValue(event.target.value)} onBlur={() => saveEdit(task)} onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveEdit(task); }
                  if (event.key === "Escape") { event.preventDefault(); setEditingId(null); }
                }} />
              ) : (
                <div className="task-row-content">
                  <span>{task.title}</span>
                  {(task.priority_manual !== "medium" || task.due_at_override || task.module_code) && (
                    <div className="task-meta">
                      {task.priority_manual !== "medium" && <span style={{ color: priorityColor(task.priority_manual) }}><Flag size={10} />{task.priority_manual.toUpperCase()}</span>}
                      {task.due_at_override && <span><Calendar size={10} />{formatDueDate(task.due_at_override)}</span>}
                      {task.module_code && <span><BookOpen size={10} />{task.module_code}</span>}
                    </div>
                  )}
                </div>
              )}
              {selected && !editing && <small>Enter to complete · Type to edit</small>}
            </div>
          );
        })}
      </div>
      <TaskInputBar token={token} onTaskCreated={(task) => setTasks((current) => [...current, task])} />
    </div>
  );
}
