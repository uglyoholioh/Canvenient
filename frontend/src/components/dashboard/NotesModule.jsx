import { useEffect, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { createNote, getNotes } from "../../api";

export default function NotesModule({ token, onOpenNote, refreshKey = 0 }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotes(token).then((data) => setNotes(data || [])).finally(() => setLoading(false));
  }, [token, refreshKey]);

  const addNote = async () => {
    const note = await createNote({ title: "Untitled", content: "" }, token);
    setNotes((current) => [note, ...current]);
    onOpenNote(note);
  };

  return (
    <div className="notes-module">
      <button type="button" className="module-primary-action" onClick={addNote}><FilePlus2 size={14} />New Note</button>
      {loading ? <div className="module-empty">Loading notes...</div> : notes.length === 0 ? <div className="module-empty">Your recent notes will appear here.</div> : (
        <div className="module-list">
          {notes.slice(0, 6).map((note) => (
            <button type="button" className="module-list-item module-item-main" key={note.id} onClick={() => onOpenNote(note)}>
              <span className="note-glyph">#</span>
              <span className="module-item-copy"><strong>{note.title || "Untitled"}</strong><small>{note.updated_at ? `Edited ${new Date(note.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}` : "Ready to edit"}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
