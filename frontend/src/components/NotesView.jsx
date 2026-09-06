import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, FileText, Search, Folder, ChevronDown, ChevronRight, Trash2, Pin, Tag as TagIcon, Plus, Columns2, PanelRightClose, X, PanelLeft } from "lucide-react";
import { createNote, getNotes, deleteNote, getFolders, createFolder, updateNote } from "../api";
import MarkdownEditor from "./MarkdownEditor";
import NotesGraph from "./NotesGraph";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";


export default function NotesView({ token, initialNoteId = null }) {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [viewMode, setViewMode] = useState("list");
  const [hoveredNoteId, setHoveredNoteId] = useState(null);
  
  // New state for selected tag filter
  const [selectedTag, setSelectedTag] = useState(null);

  // Sidebar collapse state
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("canvenient_notes_sidebar_open") !== "false";
    } catch {
      return true;
    }
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem("canvenient_notes_sidebar_open", String(next));
      } catch {}
      return next;
    });
  }, []);

  // Tabbed split screen state
  const [openTabs, setOpenTabs] = useState({ 0: initialNoteId ? [initialNoteId] : [], 1: [] });
  const [activeNoteIds, setActiveNoteIds] = useState({ 0: initialNoteId || null, 1: null });
  const [isSplit, setIsSplit] = useState(false);
  const [activePane, setActivePane] = useState(0);

  const loadNotesAndFolders = useCallback(async () => {
    setLoading(true);
    try {
      const [notesData, foldersData] = await Promise.all([
        getNotes(token).catch(() => []),
        getFolders(token).catch(() => [])
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      if (notesData.length > 0) {
        setOpenTabs(prev => {
          if (prev[0].length === 0) {
            const defaultId = initialNoteId || notesData[0].id;
            return { ...prev, 0: [defaultId] };
          }
          return prev;
        });
        setActiveNoteIds(prev => {
          if (!prev[0]) {
            const defaultId = initialNoteId || notesData[0].id;
            return { ...prev, 0: defaultId };
          }
          return prev;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [token, initialNoteId]);

  useEffect(() => {
    loadNotesAndFolders();
  }, [loadNotesAndFolders]);

  // Open note if initialNoteId changes externally
  useEffect(() => {
    if (initialNoteId) {
      setOpenTabs(prev => {
        const p0 = prev[0] || [];
        return p0.includes(initialNoteId) ? prev : { ...prev, 0: [...p0, initialNoteId] };
      });
      setActiveNoteIds(prev => ({ ...prev, 0: initialNoteId }));
      setActivePane(0);
    }
  }, [initialNoteId]);

  const openNote = useCallback((noteId, pane = activePane) => {
    setOpenTabs(prev => {
      const currentTabs = prev[pane] || [];
      if (currentTabs.includes(noteId)) return prev;
      return { ...prev, [pane]: [...currentTabs, noteId] };
    });
    setActiveNoteIds(prev => ({ ...prev, [pane]: noteId }));
    setActivePane(pane);
  }, [activePane]);

  const openNoteInSplit = useCallback((noteId) => {
    setIsSplit(true);
    setOpenTabs(prev => {
      const pane1Tabs = prev[1] || [];
      if (pane1Tabs.includes(noteId)) return prev;
      return { ...prev, 1: [...pane1Tabs, noteId] };
    });
    setActiveNoteIds(prev => ({ ...prev, 1: noteId }));
    setActivePane(1);
  }, []);

  const closeTab = useCallback((pane, noteId, e) => {
    if (e) e.stopPropagation();
    setOpenTabs(prev => {
      const curTabs = prev[pane] || [];
      const newTabs = curTabs.filter(id => id !== noteId);

      setActiveNoteIds(activePrev => {
        if (activePrev[pane] === noteId) {
          const closedIdx = curTabs.indexOf(noteId);
          let nextActive = null;
          if (newTabs.length > 0) {
            const nextIdx = closedIdx > 0 ? closedIdx - 1 : 0;
            nextActive = newTabs[nextIdx] || newTabs[0];
          }
          return { ...activePrev, [pane]: nextActive };
        }
        return activePrev;
      });

      if (pane === 1 && newTabs.length === 0) {
        setIsSplit(false);
        setActivePane(0);
      }

      return { ...prev, [pane]: newTabs };
    });
  }, []);

  const toggleSplit = useCallback(() => {
    if (isSplit) {
      setIsSplit(false);
      setActivePane(0);
    } else {
      setIsSplit(true);
      setActivePane(1);
      setActiveNoteIds(prev => {
        const currentLeft = prev[0];
        const existingPane1Active = prev[1];
        if (existingPane1Active && openTabs[1]?.includes(existingPane1Active)) {
          return prev;
        }
        const otherTab = openTabs[0]?.find(id => id !== currentLeft);
        const chosenId = otherTab || currentLeft;
        if (chosenId) {
          setOpenTabs(tabsPrev => ({
            ...tabsPrev,
            1: tabsPrev[1]?.includes(chosenId) ? tabsPrev[1] : [...(tabsPrev[1] || []), chosenId]
          }));
          return { ...prev, 1: chosenId };
        }
        return prev;
      });
    }
  }, [isSplit, openTabs]);

  const splitTabToOtherPane = useCallback((noteId, fromPane) => {
    const toPane = fromPane === 0 ? 1 : 0;
    setIsSplit(true);

    setOpenTabs(prev => {
      const toTabs = prev[toPane] || [];
      const newTo = toTabs.includes(noteId) ? toTabs : [...toTabs, noteId];
      return { ...prev, [toPane]: newTo };
    });

    setActiveNoteIds(prev => ({
      ...prev,
      [toPane]: noteId
    }));

    setActivePane(toPane);
  }, []);

  const add = useCallback(async (targetPane = activePane) => {
    const note = await createNote({ title: "Untitled", content: "" }, token);
    setNotes((current) => [note, ...current]);
    setOpenTabs(prev => ({
      ...prev,
      [targetPane]: prev[targetPane].includes(note.id) ? prev[targetPane] : [...prev[targetPane], note.id]
    }));
    setActiveNoteIds(prev => ({ ...prev, [targetPane]: note.id }));
    setActivePane(targetPane);
  }, [token, activePane]);
  
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
      const { confirm: tauriConfirm } = await import("@tauri-apps/api/dialog");
      confirmed = await tauriConfirm("Are you sure you want to delete this note?", { title: 'Canvenient', type: 'warning' });
    } catch (e) {
      confirmed = window.confirm("Are you sure you want to delete this note?");
    }
    if (confirmed) {
      await deleteNote(id, token);
      setNotes(current => current.filter(n => n.id !== id));
      setOpenTabs(prev => {
        const new0 = prev[0].filter(tid => tid !== id);
        const new1 = prev[1].filter(tid => tid !== id);
        if (new1.length === 0 && isSplit) {
          setIsSplit(false);
          setActivePane(0);
        }
        return { 0: new0, 1: new1 };
      });
      setActiveNoteIds(prev => {
        const next0 = prev[0] === id ? null : prev[0];
        const next1 = prev[1] === id ? null : prev[1];
        return { 0: next0, 1: next1 };
      });
    }
  }, [token, isSplit]);

  const handleUpdateNote = useCallback((updatedNote) => {
    setNotes(curr => curr.map(n => n.id === updatedNote.id ? { ...n, ...updatedNote } : n));
  }, []);

  const handleNoteTitleChange = useCallback((id, newTitle) => {
    setNotes(curr => curr.map(n => n.id === id ? { ...n, title: newTitle } : n));
  }, []);

  // Quick capture note created listener
  useEffect(() => {
    const handleCreated = (e) => {
      const newNote = e.detail;
      if (newNote && newNote.id) {
        setNotes(curr => curr.some(n => n.id === newNote.id) ? curr : [newNote, ...curr]);
        openNote(newNote.id, activePane);
      }
    };
    window.addEventListener("canvenient-note-created", handleCreated);
    return () => window.removeEventListener("canvenient-note-created", handleCreated);
  }, [activePane, openNote]);

  const toolbarConfig = useMemo(() => ({
    title: "Notes",
    subtitle: notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}${isSplit ? " • Split view" : ""}` : "No notes yet",
    actions: null,
  }), [notes.length, isSplit]);
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

  const renderNoteItem = (note) => {
    const isSelectedInActive = activeNoteIds[activePane] === note.id;
    const isSelectedInOther = isSplit && activeNoteIds[activePane === 0 ? 1 : 0] === note.id;

    return (
      <div 
        key={note.id} 
        onMouseEnter={() => setHoveredNoteId(note.id)}
        onMouseLeave={() => setHoveredNoteId(null)}
        style={{ display: 'flex', alignItems: 'center', padding: '0 8px', position: 'relative' }}
      >
        <button 
          type="button" 
          className={`notes-page-item ${isSelectedInActive ? "is-active" : ""}`} 
          onClick={() => openNote(note.id, activePane)}
          style={{ 
            flex: 1, display: 'flex', alignItems: 'center', padding: '8px', 
            borderRadius: '6px', border: 'none', 
            background: isSelectedInActive ? 'var(--surface-active)' : 'transparent',
            cursor: 'pointer', textAlign: 'left', color: 'var(--text)'
          }}
        >
          <FileText size={14} style={{ marginRight: '8px', color: note.is_pinned ? 'var(--blue)' : 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ overflow: 'hidden', flex: 1, paddingRight: hoveredNoteId === note.id ? '52px' : '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: isSelectedInActive ? '600' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {note.title || "Untitled"}
              </span>
              {isSelectedInOther && (
                <span 
                  title="Open in other split pane" 
                  style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', flexShrink: 0 }}
                >
                  split
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {note.updated_at ? new Date(note.updated_at).toLocaleDateString() : ""}
            </div>
          </div>
        </button>
        
        {hoveredNoteId === note.id && (
          <div style={{ position: 'absolute', right: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openNoteInSplit(note.id);
              }}
              style={{
                background: 'var(--surface-active)', 
                border: '1px solid var(--border-subtle)', borderRadius: '4px',
                padding: '4px', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              title={isSplit ? "Open in Right Pane" : "Open in Split View"}
              aria-label="Open in Split View"
            >
              <Columns2 size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(note.id);
              }}
              style={{
                background: 'var(--surface-active)', 
                border: '1px solid var(--border-subtle)', borderRadius: '4px',
                padding: '4px', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              title="Delete Note"
              aria-label="Delete Note"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPaneTabBar = (paneIndex) => {
    const paneTabs = openTabs[paneIndex] || [];
    const currentActiveId = activeNoteIds[paneIndex];

    return (
      <div 
        className="notes-tab-bar"
        role="tablist"
        aria-label={`Notes pane ${paneIndex + 1} tabs`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--surface-muted)',
          borderBottom: '1px solid var(--border-subtle)',
          minHeight: '36px',
          maxHeight: '36px',
          padding: '0 8px 0 0',
          userSelect: 'none',
          boxSizing: 'border-box'
        }}
        onClick={() => setActivePane(paneIndex)}
      >
        {/* Scrollable Tab List */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'stretch', 
            height: '100%', 
            overflowX: 'auto', 
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            flex: 1,
            minWidth: 0
          }}
        >
          {paneTabs.map(noteId => {
            const noteObj = notes.find(n => n.id === noteId);
            const title = noteObj?.title?.trim() || "Untitled";
            const isActive = currentActiveId === noteId;

            return (
              <div
                key={noteId}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={`notes-tab ${isActive ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveNoteIds(prev => ({ ...prev, [paneIndex]: noteId }));
                  setActivePane(paneIndex);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveNoteIds(prev => ({ ...prev, [paneIndex]: noteId }));
                    setActivePane(paneIndex);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 10px',
                  height: '100%',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--text-h)' : 'var(--text-muted)',
                  backgroundColor: isActive ? 'var(--bg)' : 'transparent',
                  borderRight: '1px solid var(--border-subtle)',
                  borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  maxWidth: '180px',
                  minWidth: '80px',
                  position: 'relative',
                  transition: 'background-color 150ms ease, color 150ms ease',
                  flexShrink: 0,
                  outline: 'none'
                }}
                title={title}
              >
                <FileText size={12} style={{ flexShrink: 0, color: noteObj?.is_pinned ? 'var(--blue)' : 'var(--text-muted)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {title}
                </span>
                
                {/* Move to other pane / split button */}
                <button
                  type="button"
                  aria-label={isSplit ? `Open tab in ${paneIndex === 0 ? "right" : "left"} pane` : "Open tab alongside (split right)"}
                  title={isSplit ? `Open tab in ${paneIndex === 0 ? "right" : "left"} pane` : "Open tab alongside (split right)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    splitTabToOtherPane(noteId, paneIndex);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-muted)',
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  <Columns2 size={11} />
                </button>

                {/* Close Tab Button */}
                <button
                  type="button"
                  aria-label={`Close tab ${title}`}
                  title="Close tab"
                  onClick={(e) => closeTab(paneIndex, noteId, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-muted)',
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {/* Plus / New tab button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              add(paneIndex);
            }}
            aria-label={`New Note in pane ${paneIndex + 1}`}
            title="New Note in this pane"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Pane Toolbar Controls (Right side of Tab Bar) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
          {paneIndex === 0 ? (
            <button
              type="button"
              className="notes-pane-ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleSplit();
              }}
              title={isSplit ? "Close Split View" : "Split Editor Right"}
              aria-label={isSplit ? "Close Split View" : "Split Editor Right"}
              style={{
                background: isSplit ? 'var(--surface-active)' : 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '3px 7px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: isSplit ? 'var(--text-h)' : 'var(--text-muted)',
              }}
            >
              <Columns2 size={13} />
              <span>{isSplit ? "Split: On" : "Split"}</span>
            </button>
          ) : (
            <button
              type="button"
              className="notes-pane-ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsSplit(false);
                setActivePane(0);
              }}
              title="Close Split Pane"
              aria-label="Close Split Pane"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '3px 7px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              <PanelRightClose size={13} />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderPaneEditor = (paneIndex) => {
    const currentActiveId = activeNoteIds[paneIndex];
    return (
      <div 
        className={`notes-pane-container ${activePane === paneIndex ? 'is-focused' : ''}`}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}
        onClick={() => setActivePane(paneIndex)}
      >
        {renderPaneTabBar(paneIndex)}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {currentActiveId ? (
            <MarkdownEditor 
              key={`${paneIndex}-${currentActiveId}`} 
              noteId={currentActiveId} 
              token={token} 
              onDelete={() => handleDelete(currentActiveId)}
              onUpdate={handleUpdateNote}
              onTitleChange={handleNoteTitleChange}
              initialNote={notes.find(n => n.id === currentActiveId)}
              folders={folders}
            />
          ) : (
            <div className="module-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No note open in this pane</div>
              <button
                type="button"
                className="mac-toolbar-action"
                onClick={() => add(paneIndex)}
                style={{ fontSize: '12px' }}
              >
                <FilePlus2 size={13} /> Create Note
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="notes-page" style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {/* Top Toolbar / View Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="mac-toolbar-action"
            onClick={toggleSidebar}
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 8px',
              color: isSidebarOpen ? 'var(--text-h)' : 'var(--text-muted)',
              background: !isSidebarOpen ? 'var(--surface-active)' : undefined
            }}
          >
            <PanelLeft size={15} />
          </button>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            type="button" 
            className="mac-toolbar-action" 
            onClick={toggleSplit}
            title={isSplit ? "Close Split View" : "Split Screen"}
            aria-label={isSplit ? "Close Split View" : "Split Screen"}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isSplit ? 'var(--surface-warm)' : undefined }}
          >
            <Columns2 size={14} />
            <span>{isSplit ? "Close Split" : "Split Screen"}</span>
          </button>
          <button type="button" className="mac-toolbar-action" onClick={() => add(activePane)}>
            <FilePlus2 size={14} />New Note
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {viewMode === "list" ? (
          <>
            {isSidebarOpen && (
              <aside className="notes-page-sidebar" style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface-muted)' }}>
                
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
            )}
            <main className="notes-page-editor" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {renderPaneEditor(0)}
              </div>
              {isSplit && (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border-subtle)' }}>
                  {renderPaneEditor(1)}
                </div>
              )}
            </main>
          </>
        ) : (
          <NotesGraph notes={notes} onNodeClick={(id) => { openNote(id, 0); setViewMode("list"); }} />
        )}
      </div>
    </div>
  );
}
