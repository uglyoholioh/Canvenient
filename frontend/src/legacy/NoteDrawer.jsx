import { X } from "lucide-react";
import MarkdownEditor from "../MarkdownEditor";

export default function NoteDrawer({ note, token, onClose }) {
  if (!note) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="app-drawer note-drawer" aria-label="Note editor">
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close note"><X size={18} /></button>
        <MarkdownEditor noteId={note.id} token={token} />
      </aside>
    </div>
  );
}
