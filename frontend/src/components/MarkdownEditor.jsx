import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getNotes, updateNote } from '../api';
import { Save, Eye, Edit3 } from 'lucide-react';
import './markdown.css';

export default function MarkdownEditor({ noteId, token }) {
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState('split'); // edit, preview, split
  const [saveState, setSaveState] = useState('saved'); // saved, saving, unsaved

  const debounceTimer = useRef(null);
  
  useEffect(() => {
    // Initial fetch
    const fetchNote = async () => {
      try {
        const notes = await getNotes(token);
        const target = notes.find(n => n.id === parseInt(noteId));
        if (target) {
          setNote(target);
          setTitle(target.title || 'Untitled');
          setContent(target.content || '');
          setSaveState('saved');
        }
      } catch (err) {
        console.error('Failed to load note', err);
      }
    };
    fetchNote();
  }, [noteId, token]);

  const handleSave = async (newTitle, newContent) => {
    setSaveState('saving');
    try {
      await updateNote(noteId, { title: newTitle, content: newContent }, token);
      setSaveState('saved');
    } catch (err) {
      console.error('Save failed', err);
      setSaveState('unsaved');
    }
  };

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    setSaveState('unsaved');
    
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      handleSave(title, val);
    }, 1000);
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    setSaveState('unsaved');
    
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      handleSave(val, content);
    }, 1000);
  };

  if (!note) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface)' }}>
        <input 
          type="text" 
          value={title} 
          onChange={handleTitleChange}
          style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-h)', background: 'transparent', border: 'none', outline: 'none', width: '50%', fontFamily: 'var(--font-sans)' }}
          placeholder="Untitled Note"
        />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? <><Save size={12} /> Saved</> : 'Unsaved changes'}
          </span>
          
          <div style={{ display: 'flex', backgroundColor: 'var(--surface-muted)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-strong)' }}>
            <button 
              onClick={() => setViewMode('edit')} 
              style={{ padding: '6px 10px', background: viewMode === 'edit' ? 'var(--surface-warm)' : 'transparent', border: 'none', color: viewMode === 'edit' ? 'var(--text-h)' : 'var(--text-muted)', cursor: 'pointer' }}
              title="Edit"
            ><Edit3 size={14} /></button>
            <button 
              onClick={() => setViewMode('preview')} 
              style={{ padding: '6px 10px', background: viewMode === 'preview' ? 'var(--surface-warm)' : 'transparent', border: 'none', color: viewMode === 'preview' ? 'var(--text-h)' : 'var(--text-muted)', cursor: 'pointer' }}
              title="Preview"
            ><Eye size={14} /></button>
            <button 
              onClick={() => setViewMode('split')} 
              style={{ padding: '6px 10px', background: viewMode === 'split' ? 'var(--surface-warm)' : 'transparent', border: 'none', color: viewMode === 'split' ? 'var(--text-h)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
              title="Split View"
            >| |</button>
          </div>
        </div>
      </div>

      {/* Editor Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {(viewMode === 'edit' || viewMode === 'split') && (
          <textarea
            value={content}
            onChange={handleContentChange}
            placeholder="Start typing..."
            style={{
              flex: 1,
              padding: '24px',
              border: 'none',
              resize: 'none',
              background: 'transparent',
              color: 'var(--text-h)',
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              lineHeight: '1.6',
              outline: 'none',
              borderRight: viewMode === 'split' ? '1px solid var(--border-subtle)' : 'none'
            }}
          />
        )}
        
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="markdown-preview" style={{ flex: 1, padding: '24px', overflowY: 'auto', color: 'var(--text)' }}>
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nothing to preview</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
