import { useId, useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { getNotes, updateNote, getCachedCanvasFiles, createTask } from "../api";
import {
  Save,
  Trash2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Quote,
  Code,
  Download,
  CheckSquare,
  Pin,
  Sparkles,
} from "lucide-react";
import { useAssistant } from "./AssistantContext";
import createSuggestionOptions from "./editor/suggestions";
import TurndownService from "turndown";
import "./markdown.css";

const MenuBar = ({ editor, onExportPDF, onExportMD, onCreateTask }) => {
  if (!editor) return null;

  const btnStyle = (isActive) => ({
    padding: "6px",
    background: isActive ? "var(--surface-warm)" : "transparent",
    border: "none",
    borderRadius: "4px",
    color: isActive ? "var(--text-h)" : "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        backgroundColor: "var(--surface-muted)",
        flexWrap: "wrap",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", gap: "4px" }}>
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={btnStyle(editor.isActive("bold"))}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={btnStyle(editor.isActive("italic"))}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <div style={{ width: "1px", background: "var(--border-subtle)", margin: "0 4px" }} />
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          style={btnStyle(editor.isActive("heading", { level: 1 }))}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          style={btnStyle(editor.isActive("heading", { level: 2 }))}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>
        <div style={{ width: "1px", background: "var(--border-subtle)", margin: "0 4px" }} />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          style={btnStyle(editor.isActive("bulletList"))}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          style={btnStyle(editor.isActive("orderedList"))}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </button>
        <div style={{ width: "1px", background: "var(--border-subtle)", margin: "0 4px" }} />
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          style={btnStyle(editor.isActive("blockquote"))}
          title="Quote"
        >
          <Quote size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          style={btnStyle(editor.isActive("codeBlock"))}
          title="Code Block"
        >
          <Code size={16} />
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => {
            const { from, to } = editor.state.selection;
            if (from === to) {
              alert("Please select some text to create a task.");
              return;
            }
            const text = editor.state.doc.textBetween(from, to, " ");
            onCreateTask(text);
          }}
          style={{
            ...btnStyle(false),
            fontSize: "12px",
            padding: "4px 8px",
            fontWeight: "500",
            color: "var(--blue)",
          }}
          title="Create Task from selection"
        >
          <CheckSquare size={14} style={{ marginRight: "4px" }} /> Create Task
        </button>
        <button
          onClick={onExportMD}
          style={{ ...btnStyle(false), fontSize: "12px", padding: "4px 8px", fontWeight: "500" }}
          title="Export as Markdown"
        >
          <Download size={14} style={{ marginRight: "4px" }} /> .md
        </button>
        <button
          onClick={onExportPDF}
          style={{ ...btnStyle(false), fontSize: "12px", padding: "4px 8px", fontWeight: "500" }}
          title="Export as PDF"
        >
          <Download size={14} style={{ marginRight: "4px" }} /> PDF
        </button>
      </div>
    </div>
  );
};

// We define customized mentions for different triggers
const TagMention = Mention.extend({
  name: "tagMention",
});
const LinkMention = Mention.extend({
  name: "linkMention",
});
const CanvasMention = Mention.extend({
  name: "canvasMention",
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      { ...HTMLAttributes, href: node.attrs.id, target: "_blank", class: "canvas-mention-link" },
      `📄 ${node.attrs.label}`,
    ];
  },
});

export default function MarkdownEditor({
  noteId,
  token,
  onDelete,
  onUpdate,
  onTitleChange,
  initialNote,
  folders = [],
}) {
  const { openAssistant } = useAssistant();
  const [note, setNote] = useState(initialNote || null);
  const [title, setTitle] = useState(initialNote?.title || "");
  const [saveState, setSaveState] = useState("saved");
  const [cachedData, setCachedData] = useState({ notes: [], files: [] });

  const instanceId = useId();
  const debounceTimer = useRef(null);
  const titleRef = useRef(title);
  const saveStateRef = useRef(saveState);
  const noteRef = useRef(note);

  // Mirror the latest values into refs inside an effect (no ref writes during render).
  useEffect(() => {
    titleRef.current = title;
    saveStateRef.current = saveState;
    noteRef.current = note;
  });

  useEffect(() => {
    // Pre-fetch for mentions
    Promise.all([
      getNotes(token).catch(() => []),
      getCachedCanvasFiles(token).catch(() => ({ files: [] })),
    ]).then(([notes, canvasData]) => {
      setCachedData({ notes, files: canvasData?.files || [] });
    });
  }, [token]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: "Start writing... Type [[ to link notes, / for Canvas, # for tags",
        }),
        TagMention.configure({
          HTMLAttributes: { class: "tag-mention" },
          suggestion: {
            char: "#",
            ...createSuggestionOptions((query) => {
              const defaultTags = ["midterms", "finals", "important", "review", "todo"].filter(
                (t) => t.includes(query.toLowerCase()),
              );
              return defaultTags.map((id) => ({ id, label: `#${id}` })).slice(0, 5);
            }),
          },
        }),
        LinkMention.configure({
          HTMLAttributes: { class: "link-mention" },
          suggestion: {
            char: "[[",
            ...createSuggestionOptions((query) => {
              const allNotes = cachedData.notes || [];
              const lowerQ = query.toLowerCase();
              return allNotes
                .filter((n) => (n.title || "Untitled").toLowerCase().includes(lowerQ))
                .map((n) => ({
                  id: `note:${n.id}`,
                  label: n.title || "Untitled",
                  sublabel: n.class_summary,
                }))
                .slice(0, 10);
            }),
          },
        }),
        CanvasMention.configure({
          HTMLAttributes: { class: "canvas-mention" },
          suggestion: {
            char: "/",
            ...createSuggestionOptions((query) => {
              const allFiles = cachedData.files || [];
              const lowerQ = query.toLowerCase();
              return allFiles
                .filter((f) => (f.filename || f.display_name || "").toLowerCase().includes(lowerQ))
                .map((f) => ({
                  id: f.url || f.external_url || "#",
                  label: f.filename || f.display_name,
                  sublabel: "Canvas File",
                }))
                .slice(0, 10);
            }),
          },
        }),
      ],
      content: initialNote?.content || "",
      onUpdate: ({ editor }) => {
        setSaveState("unsaved");
        saveStateRef.current = "unsaved";
        const html = editor.getHTML();
        window.dispatchEvent(
          new CustomEvent("canvenient-note-sync", {
            detail: {
              noteId: parseInt(noteId),
              sourceId: instanceId,
              type: "content",
              content: html,
            },
          }),
        );
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          handleSave(titleRef.current, html);
        }, 1000);
      },
    },
    [cachedData],
  );

  // Peer synchronization between multiple editor instances for the same note
  useEffect(() => {
    const handleSync = (e) => {
      const detail = e.detail;
      if (!detail) return;
      const {
        noteId: syncNoteId,
        sourceId,
        type,
        content: syncContent,
        title: syncTitle,
        note: syncNote,
        saveState: syncSaveState,
      } = detail;

      if (parseInt(syncNoteId) !== parseInt(noteId) || sourceId === instanceId) {
        return;
      }

      if (type === "content") {
        if (editor && !editor.isDestroyed) {
          const curHtml = editor.getHTML();
          if (curHtml !== syncContent) {
            editor.commands.setContent(syncContent, false);
          }
        }
        setSaveState("unsaved");
        saveStateRef.current = "unsaved";
      } else if (type === "title") {
        setTitle(syncTitle);
        titleRef.current = syncTitle;
        setSaveState("unsaved");
        saveStateRef.current = "unsaved";
      } else if (type === "saveState") {
        setSaveState(syncSaveState);
        saveStateRef.current = syncSaveState;
      } else if (type === "saved") {
        if (syncNote) {
          setNote((curr) => ({ ...curr, ...syncNote }));
          noteRef.current = { ...noteRef.current, ...syncNote };
        }
        setSaveState("saved");
        saveStateRef.current = "saved";
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
      } else if (type === "request-sync") {
        if (editor && !editor.isDestroyed) {
          window.dispatchEvent(
            new CustomEvent("canvenient-note-sync", {
              detail: {
                noteId: parseInt(noteId),
                sourceId: instanceId,
                type: "sync-response",
                content: editor.getHTML(),
                title: titleRef.current,
                saveState: saveStateRef.current,
                note: noteRef.current,
              },
            }),
          );
        }
      } else if (type === "sync-response") {
        if (syncContent !== undefined && editor && !editor.isDestroyed) {
          editor.commands.setContent(syncContent, false);
        }
        if (syncTitle !== undefined) {
          setTitle(syncTitle);
          titleRef.current = syncTitle;
        }
        if (syncNote) {
          setNote((curr) => ({ ...curr, ...syncNote }));
          noteRef.current = { ...noteRef.current, ...syncNote };
        }
        if (syncSaveState) {
          setSaveState(syncSaveState);
          saveStateRef.current = syncSaveState;
        }
      }
    };

    window.addEventListener("canvenient-note-sync", handleSync);
    return () => window.removeEventListener("canvenient-note-sync", handleSync);
  }, [instanceId, noteId, editor]);

  // On mount or editor ready, request active peer state if any
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      window.dispatchEvent(
        new CustomEvent("canvenient-note-sync", {
          detail: {
            noteId: parseInt(noteId),
            sourceId: instanceId,
            type: "request-sync",
          },
        }),
      );
    }
  }, [instanceId, noteId, editor]);

  useEffect(() => {
    let isMounted = true;
    const fetchNote = async () => {
      try {
        const notes = await getNotes(token);
        if (!isMounted) return;
        const target = notes.find((n) => n.id === parseInt(noteId));
        if (target) {
          setNote(target);
          noteRef.current = target;
          setTitle(target.title || "Untitled");
          titleRef.current = target.title || "Untitled";
          if (editor && !editor.isDestroyed) {
            let content = target.content || "";
            editor.commands.setContent(content, false);
          }
          setSaveState("saved");
          saveStateRef.current = "saved";
        }
      } catch {}
    };
    fetchNote();
    return () => {
      isMounted = false;
    };
  }, [noteId, token, editor]);

  const handleSave = async (newTitle, newContent, extras = {}) => {
    setSaveState("saving");
    saveStateRef.current = "saving";
    window.dispatchEvent(
      new CustomEvent("canvenient-note-sync", {
        detail: {
          noteId: parseInt(noteId),
          sourceId: instanceId,
          type: "saveState",
          saveState: "saving",
        },
      }),
    );
    try {
      const payload = { title: newTitle, content: newContent, ...extras };
      const updated = await updateNote(noteId, payload, token);
      setSaveState("saved");
      saveStateRef.current = "saved";
      if (onUpdate) onUpdate(updated);
      setNote((curr) => ({ ...curr, ...updated }));
      noteRef.current = { ...noteRef.current, ...updated };
      window.dispatchEvent(
        new CustomEvent("canvenient-note-sync", {
          detail: {
            noteId: parseInt(noteId),
            sourceId: instanceId,
            type: "saved",
            note: updated,
            saveState: "saved",
          },
        }),
      );
    } catch {
      setSaveState("unsaved");
      saveStateRef.current = "unsaved";
      window.dispatchEvent(
        new CustomEvent("canvenient-note-sync", {
          detail: {
            noteId: parseInt(noteId),
            sourceId: instanceId,
            type: "saveState",
            saveState: "unsaved",
          },
        }),
      );
    }
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    titleRef.current = val;
    setSaveState("unsaved");
    saveStateRef.current = "unsaved";
    if (onTitleChange) {
      onTitleChange(parseInt(noteId), val);
    }
    window.dispatchEvent(
      new CustomEvent("canvenient-note-sync", {
        detail: {
          noteId: parseInt(noteId),
          sourceId: instanceId,
          type: "title",
          title: val,
        },
      }),
    );
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const currentContent = editor && !editor.isDestroyed ? editor.getHTML() : "";
      handleSave(val, currentContent);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, []);

  const handleCreateTask = async (text) => {
    try {
      await createTask(token, { title: text, description: `Created from note: ${title}` });
      alert("Task created successfully!");
    } catch {
      alert("Failed to create task.");
    }
  };

  const exportMarkdown = () => {
    const turndownService = new TurndownService();
    const markdown = `# ${title}\n\n${turndownService.turndown(editor.getHTML())}`;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "Note"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    // A quick hack for print scoped to editor:
    // Native print dialog uses CSS print media queries.
    window.print();
  };

  if (!note) return <div style={{ padding: "24px", color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div
      className="printable-editor-container"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg)",
      }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-editor-container, .printable-editor-container * { visibility: visible; }
          .printable-editor-container { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          backgroundColor: "var(--surface)",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "var(--text-h)",
            background: "transparent",
            border: "none",
            outline: "none",
            flex: "1 1 180px",
            minWidth: 0,
            fontFamily: "var(--font-sans)",
          }}
          placeholder="Untitled Note"
        />

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {saveState === "saving" ? (
              "Saving..."
            ) : saveState === "saved" ? (
              <>
                <Save size={12} /> Saved
              </>
            ) : (
              "Unsaved changes"
            )}
          </span>

          <select
            value={note.folder_id || ""}
            onChange={(e) =>
              handleSave(title, editor.getHTML(), {
                folder_id: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "12px",
              color: "var(--text)",
              outline: "none",
            }}
          >
            <option value="">No Folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              openAssistant({
                attachment: { type: "note", id: Number(noteId), label: title || "Untitled" },
              })
            }
            style={{
              padding: "6px",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "4px",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
            title="Ask the assistant about this note"
          >
            <Sparkles size={14} />
          </button>
          <button
            onClick={() => handleSave(title, editor.getHTML(), { is_pinned: !note.is_pinned })}
            style={{
              padding: "6px",
              background: note.is_pinned ? "var(--surface-active)" : "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "4px",
              color: note.is_pinned ? "var(--blue)" : "var(--text-muted)",
              cursor: "pointer",
            }}
            title={note.is_pinned ? "Unpin Note" : "Pin Note"}
          >
            <Pin size={14} />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "6px",
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
              title="Delete Note"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="no-print">
        <MenuBar
          editor={editor}
          onExportMD={exportMarkdown}
          onExportPDF={exportPDF}
          onCreateTask={handleCreateTask}
        />
      </div>

      <div
        className="tiptap-editor-container"
        style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}
      >
        <h1 className="only-print" style={{ display: "none" }}>
          {title}
        </h1>
        <style>{`@media print { .only-print { display: block !important; margin-bottom: 24px; color: black; } }`}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
