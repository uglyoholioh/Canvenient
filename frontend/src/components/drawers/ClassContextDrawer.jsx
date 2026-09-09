// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, CalendarClock, CheckCircle2, Download, FileText, Paperclip, Plus, Repeat, Upload, X } from "lucide-react";
import { createNote, createTask, downloadClassFile, getClassContext, uploadClassFile } from "../../api";

const RELATIONS = [
  { value: "due_before", label: "Due before class" },
  { value: "bring_to", label: "Bring to class" },
  { value: "follow_up_after", label: "Follow up after class" },
];

function relationshipLabel(value) {
  return RELATIONS.find((relation) => relation.value === value)?.label || "Linked to class";
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClassContextDrawer({ item, token, onClose, onContextChanged }) {
  const [context, setContext] = useState(null);
  const [mode, setMode] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [attendanceScope, setAttendanceScope] = useState("instance");
  const [taskTitle, setTaskTitle] = useState("");
  const [relation, setRelation] = useState("due_before");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  const loadContext = useCallback(async () => {
    if (!item.classId || !item.occurrenceDate) return;
    setError("");
    try {
      setContext(await getClassContext(token, item.classId, item.occurrenceDate));
    } catch (loadError) {
      setError(loadError.message || "Could not load this class context.");
    }
  }, [item.classId, item.occurrenceDate, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadContext(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const refresh = async () => {
    await loadContext();
    onContextChanged?.();
  };

  const submitTask = async (event) => {
    event.preventDefault();
    if (!taskTitle.trim() || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        title: taskTitle.trim(),
        class_id: item.classId,
        class_occurrence_date: item.occurrenceDate,
        class_relation: relation,
        is_recurring: isRecurring,
        class_recurring: isRecurring,
      };
      if (relation === "due_before" && !isRecurring) {
        payload.due_at_override = item.start.toISOString();
      }
      await createTask(token, payload);
      setTaskTitle("");
      setMode(null);
      await refresh();
    } catch (saveError) {
      setError(saveError.message || "Could not add the task.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitNote = async (event) => {
    event.preventDefault();
    if (!noteTitle.trim() || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await createNote({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        class_id: item.classId,
        class_occurrence_date: item.occurrenceDate,
        is_recurring: isRecurring,
      }, token);
      setNoteTitle("");
      setNoteContent("");
      setMode(null);
      await refresh();
    } catch (saveError) {
      setError(saveError.message || "Could not add the note.");
    } finally {
      setIsSaving(false);
    }
  };

  const attachFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await uploadClassFile(token, item.classId, item.occurrenceDate, file, isRecurring);
      setMode(null);
      await refresh();
    } catch (uploadError) {
      setError(uploadError.message || "Could not attach the file.");
    } finally {
      setIsSaving(false);
    }
  };

  const downloadFile = async (file) => {
    setError("");
    try {
      const blob = await downloadClassFile(token, file.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Could not download the file.");
    }
  };

  const classDate = item.start.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const classDateShort = item.start.toLocaleDateString([], { month: "short", day: "numeric" });
  const times = `${item.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${item.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="class-context-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="class-context-drawer" role="dialog" aria-modal="true" aria-label={`${item.title} class context`}>
        <header className="class-context-header" style={{ "--class-color": item.color }}>
          <div style={{ flex: 1 }}>
            <strong>{item.title}</strong>
            <span>{item.subtitle}{item.classNo ? ` [${item.classNo}]` : ""}{item.weeksLabel ? ` · ${item.weeksLabel}` : ""} · {classDate}</span>
            <small>{times}{item.venue ? ` · ${item.venue}` : ""}</small>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', marginRight: '8px', fontSize: '0.8em' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={item.attendInPerson !== false} onChange={async (e) => {
                const checked = e.target.checked;
                try {
                  const { updateClass } = await import('../../api');
                  const payload = { attend_in_person: checked };
                  if (attendanceScope === "instance") {
                    payload.occurrence_date = item.occurrenceDate;
                  }
                  await updateClass(token, item.classId, payload);
                  await refresh();
                } catch (err) {
                  setError(err.message || "Failed to update attendance.");
                }
              }} />
              Attend in person
            </label>
            <select style={{ fontSize: '0.9em', padding: '0 2px' }} value={attendanceScope} onChange={(e) => setAttendanceScope(e.target.value)}>
              <option value="instance">This instance</option>
              <option value="all">Every instance</option>
            </select>
          </div>
          <button type="button" onClick={onClose} aria-label="Close class context"><X size={18} /></button>
        </header>

        <div className="class-context-actions" aria-label="Add to this class">
          <button type="button" className={mode === "task" ? "is-active" : ""} onClick={() => setMode(mode === "task" ? null : "task")}><Plus size={15} />Task</button>
          <button type="button" className={mode === "note" ? "is-active" : ""} onClick={() => setMode(mode === "note" ? null : "note")}><FileText size={15} />Note</button>
          <button type="button" className={mode === "file" ? "is-active" : ""} onClick={() => setMode(mode === "file" ? null : "file")}><Paperclip size={15} />File</button>
        </div>

        {mode === "task" && (
          <form className="class-context-form" onSubmit={submitTask}>
            <div className="class-context-scope-group">
              <span className="class-context-scope-label">Apply to</span>
              <div className="class-context-scope-toggle" role="radiogroup" aria-label="Class occurrence scope">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isRecurring}
                  className={`scope-option ${!isRecurring ? "is-active" : ""}`}
                  onClick={() => setIsRecurring(false)}
                >
                  <Calendar size={13} />
                  This class only ({classDateShort})
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isRecurring}
                  className={`scope-option ${isRecurring ? "is-active" : ""}`}
                  onClick={() => setIsRecurring(true)}
                >
                  <Repeat size={13} />
                  All recurring classes
                </button>
              </div>
            </div>
            <label>Task title<input autoFocus value={taskTitle} maxLength={160} onChange={(event) => setTaskTitle(event.target.value)} placeholder="e.g. Submit Lab 4" /></label>
            <label>How it relates<select value={relation} onChange={(event) => setRelation(event.target.value)}>{RELATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {!isRecurring && relation === "due_before" && <p><CalendarClock size={14} />Due at class start: {times.split(" – ")[0]}</p>}
            <div><button type="submit" disabled={!taskTitle.trim() || isSaving}>{isSaving ? "Adding…" : "Add task"}</button><button type="button" onClick={() => setMode(null)}>Cancel</button></div>
          </form>
        )}

        {mode === "note" && (
          <form className="class-context-form" onSubmit={submitNote}>
            <div className="class-context-scope-group">
              <span className="class-context-scope-label">Apply to</span>
              <div className="class-context-scope-toggle" role="radiogroup" aria-label="Class occurrence scope">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isRecurring}
                  className={`scope-option ${!isRecurring ? "is-active" : ""}`}
                  onClick={() => setIsRecurring(false)}
                >
                  <Calendar size={13} />
                  This class only ({classDateShort})
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isRecurring}
                  className={`scope-option ${isRecurring ? "is-active" : ""}`}
                  onClick={() => setIsRecurring(true)}
                >
                  <Repeat size={13} />
                  All recurring classes
                </button>
              </div>
            </div>
            <label>Note title<input autoFocus value={noteTitle} maxLength={160} onChange={(event) => setNoteTitle(event.target.value)} placeholder="e.g. Lab 4 discussion" /></label>
            <label>Details<textarea value={noteContent} rows={3} onChange={(event) => setNoteContent(event.target.value)} placeholder="Optional — you can continue editing this in Notes." /></label>
            <div><button type="submit" disabled={!noteTitle.trim() || isSaving}>{isSaving ? "Adding…" : "Add note"}</button><button type="button" onClick={() => setMode(null)}>Cancel</button></div>
          </form>
        )}

        {mode === "file" && (
          <div className="class-context-form">
            <div className="class-context-scope-group">
              <span className="class-context-scope-label">Apply to</span>
              <div className="class-context-scope-toggle" role="radiogroup" aria-label="Class occurrence scope">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isRecurring}
                  className={`scope-option ${!isRecurring ? "is-active" : ""}`}
                  onClick={() => setIsRecurring(false)}
                >
                  <Calendar size={13} />
                  This class only ({classDateShort})
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isRecurring}
                  className={`scope-option ${isRecurring ? "is-active" : ""}`}
                  onClick={() => setIsRecurring(true)}
                >
                  <Repeat size={13} />
                  All recurring classes
                </button>
              </div>
            </div>
            <input ref={fileInputRef} className="class-context-file-input" type="file" onChange={attachFile} />
            <div>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
                <Upload size={14} />
                {isSaving ? "Attaching…" : "Choose file to attach"}
              </button>
              <button type="button" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        {error && <div className="class-context-error" role="alert">{error}</div>}

        {!context ? <div className="class-context-loading">Loading linked items…</div> : (
          <div className="class-context-list">
            <section>
              <h2>Tasks <span>{context.tasks.length}</span></h2>
              {context.tasks.length ? context.tasks.map((task) => (
                <div className="class-context-item" key={task.id}>
                  <CheckCircle2 size={15} />
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {relationshipLabel(task.relation)}
                      <span className={`class-scope-tag ${task.is_recurring ? "is-recurring" : "is-instance"}`}>
                        {task.is_recurring ? "All classes" : "This instance"}
                      </span>
                    </small>
                  </span>
                  {task.status === "done" && <em>Done</em>}
                </div>
              )) : <p>No tasks linked to this class.</p>}
            </section>
            <section>
              <h2>Notes <span>{context.notes.length}</span></h2>
              {context.notes.length ? context.notes.map((note) => (
                <div className="class-context-item" key={note.id}>
                  <FileText size={15} />
                  <span>
                    <strong>{note.title || "Untitled"}</strong>
                    <small>
                      Updated {new Date(note.updated_at).toLocaleDateString()}
                      <span className={`class-scope-tag ${note.is_recurring ? "is-recurring" : "is-instance"}`}>
                        {note.is_recurring ? "All classes" : "This instance"}
                      </span>
                    </small>
                  </span>
                </div>
              )) : <p>No notes linked to this class.</p>}
            </section>
            <section>
              <h2>Files <span>{context.files.length}</span></h2>
              {context.files.length ? context.files.map((file) => (
                <div className="class-context-item" key={file.id}>
                  <Paperclip size={15} />
                  <span>
                    <strong>{file.filename}</strong>
                    <small>
                      {formatFileSize(file.byte_size)}
                      <span className={`class-scope-tag ${file.is_recurring ? "is-recurring" : "is-instance"}`}>
                        {file.is_recurring ? "All classes" : "This instance"}
                      </span>
                    </small>
                  </span>
                  <button type="button" onClick={() => downloadFile(file)} aria-label={`Download ${file.filename}`}><Download size={15} /></button>
                </div>
              )) : <p>No files linked to this class.</p>}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
