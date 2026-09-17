// Notes — a calm list and a writing surface. The editor itself is the
// existing tiptap core; the chrome around it gets out of the way.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createNote, getNotes } from "../../api";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import MarkdownEditor from "../../components/MarkdownEditor";
import "./notes.css";

export default function NotesView({ token, onNavigate }) {
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await getNotes(token);
      setNotes(list || []);
    } catch {
      setNotes([]);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    load();
    const onCreated = () => load();
    window.addEventListener("canvenient-note-created", onCreated);
    return () => window.removeEventListener("canvenient-note-created", onCreated);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...notes].sort((a, b) => {
      if (Boolean(b.is_pinned) !== Boolean(a.is_pinned))
        return Boolean(b.is_pinned) - Boolean(a.is_pinned);
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
    if (!q) return list;
    return list.filter(
      (note) =>
        (note.title || "").toLowerCase().includes(q) ||
        (note.content || "").toLowerCase().includes(q),
    );
  }, [notes, query]);

  const openNote = useMemo(
    () => notes.find((note) => String(note.id) === String(openId)) || null,
    [notes, openId],
  );

  const fact = useMemo(() => {
    if (!loaded) return "";
    return `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  }, [loaded, notes.length]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const newNote = useCallback(async () => {
    try {
      const note = await createNote({ title: "Untitled", content: "" }, token);
      window.dispatchEvent(new CustomEvent("canvenient-note-created", { detail: note }));
      setNotes((prev) => [note, ...prev]);
      setOpenId(note.id);
    } catch {
      // The list refreshes when the note survives.
    }
  }, [token]);

  if (openNote) {
    return (
      <div className="ins-notes-editor">
        <button type="button" className="ins-btn is-ghost" onClick={() => setOpenId(null)}>
          ‹ All notes
        </button>
        <div className="ins-notes-editor-core">
          <MarkdownEditor
            key={openNote.id}
            noteId={openNote.id}
            token={token}
            onNoteSaved={() => load()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ins-notes">
      <div className="ins-notes-toolbar">
        <input
          className="ins-input ins-notes-search"
          placeholder="Filter notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="ins-btn is-primary" onClick={newNote}>
          New note
        </button>
      </div>

      {loaded && filtered.length === 0 && (
        <div className="ins-empty">
          {query ? (
            <span>No notes match “{query}”</span>
          ) : (
            <span>
              Notes live here — <kbd className="ins-kbd">⇧⌘N</kbd> starts one
            </span>
          )}
        </div>
      )}

      <div className="ins-notes-list">
        {filtered.map((note) => (
          <button
            key={note.id}
            type="button"
            className="ins-noterow"
            onClick={() => setOpenId(note.id)}
          >
            <span className="ins-noterow-title">
              {note.is_pinned ? "• " : ""}
              {note.title || "Untitled"}
            </span>
            <span className="ins-cap ins-noterow-date">
              {note.updated_at
                ? new Date(note.updated_at).toLocaleDateString([], {
                    day: "numeric",
                    month: "short",
                  })
                : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
