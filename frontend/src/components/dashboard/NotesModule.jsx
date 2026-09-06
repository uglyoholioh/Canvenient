import { useEffect, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { createNote, getNotes } from "../../api";

export default function NotesModule({ token, onOpenNote, refreshKey = 0 }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotes(token)
      .then((data) => setNotes(data || []))
      .finally(() => setLoading(false));
  }, [token, refreshKey]);

  const addNote = async () => {
    const note = await createNote({ title: "Untitled", content: "" }, token);
    setNotes((current) => [note, ...current]);
    onOpenNote(note);
  };

  return (
    <div className="notes-module notes-widget">
      <div className="notes-widget-header">
        <span className="notes-widget-count">
          {loading ? "—" : notes.length} note{notes.length !== 1 ? "s" : ""}
        </span>
        <button type="button" className="notes-widget-new-btn" onClick={addNote} aria-label="New note">
          <FilePlus2 size={13} />
          New
        </button>
      </div>
      {loading ? (
        <div className="notes-widget-empty">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="notes-widget-empty">No notes yet.</div>
      ) : (
        <div className="notes-widget-list">
          {notes.slice(0, 4).map((note) => (
            <button
              type="button"
              className="notes-widget-item"
              key={note.id}
              onClick={() => onOpenNote(note)}
            >
              <span className="notes-widget-glyph" aria-hidden="true">#</span>
              <span className="notes-widget-title">{note.title || "Untitled"}</span>
              {note.updated_at && (
                <span className="notes-widget-date">
                  {new Date(note.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

