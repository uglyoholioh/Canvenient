import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, FileText, Search, Folder, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { createNote, getNotes, deleteNote, getFolders, createFolder, updateNote } from "../api";
import { Pin, Tag as TagIcon, Plus } from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";
import NotesGraph from "./NotesGraph";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";
import { confirm as tauriConfirm } from "@tauri-apps/api/dialog";


export default function NotesView({ token, initialNoteId = null }) {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedId, setSelectedId] = useState(initialNoteId);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [viewMode, setViewMode] = useState("list");
  const [hoveredNoteId, setHoveredNoteId] = useState(null);
  
  // New state for selected tag filter
  const [selectedTag, setSelectedTag] = useState(null);

  useEffect(() => {
    loadNotesAndFolders();
  }, [token]);

  const loadNotesAndFolders = useCallback(async () => {
    setLoading(true);
    try {
      const [notesData, foldersData] = await Promise.all([
        getNotes(token).catch(() => []),
        getFolders(token).catch(() => [])
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      if (!selectedId && notesData.length > 0) {
        setSelectedId(notesData[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  const add = useCallback(async () => {
    const note = await createNote({ title: "Untitled", content: "" }, token);
    setNotes((current) => [note, ...current]);
    setSelectedId(note.id);
  }, [token]);
  
  const handleCreateFolder = async () => {
    const name = window.prompt("Folder name:");
    if (!name) return;
    try {
      const folder = await createFolder({ name }, token);
      setFolders(curr => [...curr, folder].sort((a,b) => a.name.localeCompare(b.name)));
    } catch (e) {
      alert("Failed to create folder");
    }
  };

  const handleDelete = useCallback(async (id) => {
    let confirmed = false;
    try {
      confirmed = await tauriConfirm("Are you sure you want to delete this note?", { title: 'Canvenient', type: 'warning' });
    } catch (e) {
      confirmed = window.confirm("Are you sure you want to delete this note?");
    }
    if (confirmed) {
      await deleteNote(id, token);
      setNotes(current => current.filter(n => n.id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  }, [token, selectedId]);

  const handleUpdateNote = (updatedNote) => {
    setNotes(curr => curr.map(n => n.id === updatedNote.id ? { ...n, ...updatedNote } : n));
  };

  const toolbarConfig = useMemo(() => ({
    title: "Notes",
    subtitle: notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}` : "No notes yet",
    actions: null,
  }), [notes.length]);
  useWorkspaceToolbar(toolbarConfig);
  
  // Extract all tags
  const allTags = useMemo(() => {
    const tags = new Set();
    notes.forEach(note => {
      if (!note.content) return;
      const tagRegex = /data-type="tagMention"[^>]*data-id="([^"]+)"/g;
      let match;
      while ((match = tagRegex.exec(note.content)) !== null) {
        tags.add(match[1]);
      }
    });
    return Array.from(tags).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(n => 
        (n.title && n.title.toLowerCase().includes(lowerQ)) || 
        (n.content && n.content.toLowerCase().includes(lowerQ)) ||
        (n.class_summary && n.class_summary.toLowerCase().includes(lowerQ))
      );
    }
    if (selectedTag) {
      result = result.filter(n => {
        if (!n.content) return false;
        return n.content.includes(`data-type="tagMention" data-id="${selectedTag}"`);
      });
    }
    return result;
  }, [notes, searchQuery, selectedTag]);
  
  const pinnedNotes = useMemo(() => filteredNotes.filter(n => n.is_pinned), [filteredNotes]);
  const unpinnedNotes = useMemo(() => filteredNotes.filter(n => !n.is_pinned), [filteredNotes]);

  // Group unpinned notes by class_summary
  const groupedByClass = useMemo(() => {
    const groups = {};
    unpinnedNotes.forEach(note => {
      if (note.class_summary) {
        if (!groups[note.class_summary]) groups[note.class_summary] = [];
        groups[note.class_summary].push(note);
      }
    });
    return groups;
  }, [unpinnedNotes]);
  
  // Group unpinned notes by folder
  const groupedByFolder = useMemo(() => {
    const groups = {};
    folders.forEach(f => {
      groups[f.id] = unpinnedNotes.filter(n => n.folder_id === f.id);
    });
    return groups;
  }, [unpinnedNotes, folders]);
  
  const uncategorizedNotes = useMemo(() => {
    return unpinnedNotes.filter(n => !n.class_summary && !n.folder_id);
  }, [unpinnedNotes]);

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: prev[groupName] === undefined ? false : !prev[groupName] }));
  };

  const renderNoteItem = (note) => (
    <div 
      key={note.id} 
      onMouseEnter={() => setHoveredNoteId(note.id)}
      onMouseLeave={() => setHoveredNoteId(null)}
      style={{ display: 'flex', alignItems: 'center', padding: '0 8px', position: 'relative' }}
    >
      <button 
        type="button" 
        className={`notes-page-item ${selectedId === note.id ? "is-active" : ""}`} 
        onClick={() => setSelectedId(note.id)}
        style={{ 
          flex: 1, display: 'flex', alignItems: 'center', padding: '8px', 
          borderRadius: '6px', border: 'none', background: selectedId === note.id ? 'var(--surface-active)' : 'transparent',
          cursor: 'pointer', textAlign: 'left', color: 'var(--text)'
        }}
      >
        <FileText size={14} style={{ marginRight: '8px', color: note.is_pinned ? 'var(--blue)' : 'var(--text-muted)', flexShrink: 0 }} />
        <div style={{ overflow: 'hidden', flex: 1, paddingRight: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: selectedId === note.id ? '600' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {note.title || "Untitled"}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {note.updated_at ? new Date(note.updated_at).toLocaleDateString() : ""}
          </div>
        </div>
      </button>
      
      {hoveredNoteId === note.id && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(note.id);
          }}
          style={{
            position: 'absolute', right: '16px', background: 'var(--surface-active)', 
            border: '1px solid var(--border-subtle)', borderRadius: '4px',
            padding: '4px', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          title="Delete Note"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );

  return (
    <div className="notes-page" style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {/* Top Toolbar / View Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Notes</h2>
          <div style={{ display: 'flex', backgroundColor: 'var(--surface-muted)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-strong)' }}>
            <button 
              onClick={() => setViewMode("list")} 
              style={{ 
                padding: '4px 12px', fontSize: '13px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                background: viewMode === "list" ? 'var(--surface-warm)' : 'transparent',
                color: viewMode === "list" ? 'var(--text-h)' : 'var(--text-muted)',
                fontWeight: viewMode === "list" ? '600' : '400',
              }}
            >List</button>
            <button 
              onClick={() => setViewMode("graph")} 
              style={{ 
                padding: '4px 12px', fontSize: '13px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                background: viewMode === "graph" ? 'var(--surface-warm)' : 'transparent',
                color: viewMode === "graph" ? 'var(--text-h)' : 'var(--text-muted)',
                fontWeight: viewMode === "graph" ? '600' : '400',
              }}
            >Graph</button>
          </div>
        </div>
        <button type="button" className="mac-toolbar-action" onClick={add}><FilePlus2 size={14} />New Note</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {viewMode === "list" ? (
          <>
            <aside className="notes-page-sidebar" style={{ width: '280px', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface-muted)' }}>
              
              <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px' }}>
                  <Search size={14} color="var(--text-muted)" />
                  <input 
                    type="text" 
                    placeholder="Search notes..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '8px', fontSize: '13px', width: '100%', color: 'var(--text)' }}
                  />
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {loading ? (
                  <div className="module-empty">Loading...</div>
                ) : filteredNotes.length === 0 ? (
                  <div className="module-empty">No notes found.</div>
                ) : (
                  <>
                    {/* Tags Filter */}
                    {allTags.length > 0 && (
                      <div style={{ marginBottom: '16px', padding: '0 12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Tags</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {allTags.map(tag => (
                            <button
                              key={tag}
                              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                              style={{
                                padding: '2px 8px', fontSize: '11px', borderRadius: '12px', border: '1px solid var(--border-strong)',
                                background: selectedTag === tag ? 'var(--blue)' : 'var(--surface)',
                                color: selectedTag === tag ? '#fff' : 'var(--text)', cursor: 'pointer'
                              }}
                            >#{tag}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Pinned Notes */}
                    {pinnedNotes.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0 12px', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                          <Pin size={10} style={{ marginRight: '4px' }}/> Pinned
                        </div>
                        {pinnedNotes.map(renderNoteItem)}
                      </div>
                    )}
                    
                    {/* Folders */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', marginBottom: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Folders</div>
                        <button onClick={handleCreateFolder} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Plus size={12} /></button>
                      </div>
                      {folders.map(folder => {
                        const folderNotes = groupedByFolder[folder.id] || [];
                        const isExpanded = expandedGroups[`folder_${folder.id}`] !== false;
                        return (
                          <div key={folder.id} style={{ marginBottom: '4px' }}>
                            <button 
                              onClick={() => toggleGroup(`folder_${folder.id}`)}
                              style={{ 
                                display: 'flex', alignItems: 'center', width: '100%', padding: '4px 12px', 
                                background: 'transparent', border: 'none', color: 'var(--text-muted)', 
                                fontSize: '12px', fontWeight: '600', cursor: 'pointer', textAlign: 'left'
                              }}
                            >
                              {isExpanded ? <ChevronDown size={14} style={{ marginRight: '4px' }}/> : <ChevronRight size={14} style={{ marginRight: '4px' }}/>}
                              <Folder size={12} style={{ marginRight: '6px' }}/>
                              {folder.name} ({folderNotes.length})
                            </button>
                            {isExpanded && (
                              <div style={{ marginTop: '2px' }}>
                                {folderNotes.map(renderNoteItem)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Classes */}
                    {Object.keys(groupedByClass).length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0 12px', marginBottom: '4px' }}>Classes</div>
                        {Object.keys(groupedByClass).sort().map(groupName => {
                          const isExpanded = expandedGroups[`class_${groupName}`] !== false;
                          const classNotes = groupedByClass[groupName];
                          return (
                            <div key={groupName} style={{ marginBottom: '4px' }}>
                              <button 
                                onClick={() => toggleGroup(`class_${groupName}`)}
                                style={{ 
                                  display: 'flex', alignItems: 'center', width: '100%', padding: '4px 12px', 
                                  background: 'transparent', border: 'none', color: 'var(--text-muted)', 
                                  fontSize: '12px', fontWeight: '600', cursor: 'pointer', textAlign: 'left'
                                }}
                              >
                                {isExpanded ? <ChevronDown size={14} style={{ marginRight: '4px' }}/> : <ChevronRight size={14} style={{ marginRight: '4px' }}/>}
                                <Folder size={12} style={{ marginRight: '6px' }}/>
                                {groupName} ({classNotes.length})
                              </button>
                              {isExpanded && (
                                <div style={{ marginTop: '2px' }}>
                                  {classNotes.map(renderNoteItem)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Uncategorized */}
                    {uncategorizedNotes.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0 12px', marginBottom: '4px' }}>Uncategorized</div>
                        {uncategorizedNotes.map(renderNoteItem)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
            <main className="notes-page-editor" style={{ flex: 1, overflow: 'hidden' }}>
              {selectedId ? (
                <MarkdownEditor 
                  key={selectedId} 
                  noteId={selectedId} 
                  token={token} 
                  onDelete={() => handleDelete(selectedId)}
                  onUpdate={handleUpdateNote}
                  folders={folders}
                />
              ) : (
                <div className="module-empty">Select or create a note to begin.</div>
              )}
            </main>
          </>
        ) : (
          <NotesGraph notes={notes} onNodeClick={(id) => { setSelectedId(id); setViewMode("list"); }} />
        )}
      </div>
    </div>
  );
}
