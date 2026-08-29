import { useEffect, useState } from "react";
import { FilePlus2, FileText } from "lucide-react";
import { createNote, getNotes } from "../api";
import MarkdownEditor from "./MarkdownEditor";

export default function NotesView({ token, initialNoteId = null }) {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(initialNoteId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotes(token).then((response) => {
      const data = response || [];
      setNotes(data);
      setSelectedId((current) => current || data[0]?.id || null);
    }).finally(() => setLoading(false));
  }, [token]);

  const add = async () => {
    const note = await createNote({ title: "Untitled", content: "" }, token);
    setNotes((current) => [note, ...current]);
    setSelectedId(note.id);
  };

  return (
    <div className="notes-page">
      <aside className="notes-page-sidebar">
        <div className="notes-page-heading"><strong>Notes</strong><button type="button" onClick={add} title="New note"><FilePlus2 size={15} /></button></div>
        {loading ? <div className="module-empty">Loading...</div> : notes.length === 0 ? <div className="module-empty">No notes yet.</div> : notes.map((note) => (
          <button type="button" key={note.id} className={`notes-page-item ${selectedId === note.id ? "is-active" : ""}`} onClick={() => setSelectedId(note.id)}>
            <FileText size={14} /><span><strong>{note.title || "Untitled"}</strong><small>{note.updated_at ? new Date(note.updated_at).toLocaleDateString() : ""}</small></span>
          </button>
        ))}
      </aside>
      <main className="notes-page-editor">{selectedId ? <MarkdownEditor key={selectedId} noteId={selectedId} token={token} /> : <div className="module-empty">Create a note to begin.</div>}</main>
    </div>
  );
}
