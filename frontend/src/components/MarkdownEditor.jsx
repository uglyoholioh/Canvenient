import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { getNotes, updateNote, getCachedCanvasFiles } from '../api';
import { Save, Trash2, Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Code, Download } from 'lucide-react';
import createSuggestionOptions from './editor/suggestions';
import TurndownService from 'turndown';
import './markdown.css';

const MenuBar = ({ editor, onExportPDF, onExportMD }) => {
  if (!editor) return null;

  const btnStyle = (isActive) => ({
    padding: '6px',
    background: isActive ? 'var(--surface-warm)' : 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: isActive ? 'var(--text-h)' : 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface-muted)' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => editor.chain().focus().toggleBold().run()} style={btnStyle(editor.isActive('bold'))} title="Bold">
          <Bold size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} style={btnStyle(editor.isActive('italic'))} title="Italic">
          <Italic size={16} />
        </button>
        <div style={{ width: '1px', background: 'var(--border-subtle)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} style={btnStyle(editor.isActive('heading', { level: 1 }))} title="Heading 1">
          <Heading1 size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={btnStyle(editor.isActive('heading', { level: 2 }))} title="Heading 2">
          <Heading2 size={16} />
        </button>
        <div style={{ width: '1px', background: 'var(--border-subtle)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} style={btnStyle(editor.isActive('bulletList'))} title="Bullet List">
          <List size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btnStyle(editor.isActive('orderedList'))} title="Ordered List">
          <ListOrdered size={16} />
        </button>
        <div style={{ width: '1px', background: 'var(--border-subtle)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} style={btnStyle(editor.isActive('blockquote'))} title="Quote">
          <Quote size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} style={btnStyle(editor.isActive('codeBlock'))} title="Code Block">
          <Code size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onExportMD} style={{ ...btnStyle(false), fontSize: '12px', padding: '4px 8px', fontWeight: '500' }} title="Export as Markdown">
          <Download size={14} style={{ marginRight: '4px' }} /> .md
        </button>
        <button onClick={onExportPDF} style={{ ...btnStyle(false), fontSize: '12px', padding: '4px 8px', fontWeight: '500' }} title="Export as PDF">
          <Download size={14} style={{ marginRight: '4px' }} /> PDF
        </button>
      </div>
    </div>
  );
};

// We define customized mentions for different triggers
const TagMention = Mention.extend({
  name: 'tagMention',
});
const LinkMention = Mention.extend({
  name: 'linkMention',
});
const CanvasMention = Mention.extend({
  name: 'canvasMention',
  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      { ...HTMLAttributes, href: node.attrs.id, target: '_blank', class: 'canvas-mention-link' },
      `📄 ${node.attrs.label}`,
    ];
  },
});

export default function MarkdownEditor({ noteId, token, onDelete }) {
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [cachedData, setCachedData] = useState({ notes: [], files: [] });

  const debounceTimer = useRef(null);

  useEffect(() => {
    // Pre-fetch for mentions
    Promise.all([
      getNotes(token).catch(() => []),
      getCachedCanvasFiles(token).catch(() => ({ files: [] }))
    ]).then(([notes, canvasData]) => {
      setCachedData({ notes, files: canvasData?.files || [] });
    });
  }, [token]);
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing... Type [[ to link notes, / for Canvas, # for tags' }),
      TagMention.configure({
        HTMLAttributes: { class: 'tag-mention' },
        suggestion: {
          char: '#',
          ...createSuggestionOptions((query) => {
            const defaultTags = ['midterms', 'finals', 'important', 'review', 'todo'].filter(t => t.includes(query.toLowerCase()));
            return defaultTags.map(id => ({ id, label: `#${id}` })).slice(0, 5);
          }),
        }
      }),
      LinkMention.configure({
        HTMLAttributes: { class: 'link-mention' },
        suggestion: {
          char: '[[',
          ...createSuggestionOptions((query) => {
             const allNotes = cachedData.notes || [];
             const lowerQ = query.toLowerCase();
             return allNotes
               .filter(n => (n.title || 'Untitled').toLowerCase().includes(lowerQ))
               .map(n => ({ id: `note:${n.id}`, label: n.title || 'Untitled', sublabel: n.class_summary }))
               .slice(0, 10);
          })
        }
      }),
      CanvasMention.configure({
        HTMLAttributes: { class: 'canvas-mention' },
        suggestion: {
          char: '/',
          ...createSuggestionOptions((query) => {
             const allFiles = cachedData.files || [];
             const lowerQ = query.toLowerCase();
             return allFiles
               .filter(f => (f.filename || f.display_name || '').toLowerCase().includes(lowerQ))
               .map(f => ({ id: f.url || f.external_url || '#', label: f.filename || f.display_name, sublabel: 'Canvas File' }))
               .slice(0, 10);
          })
        }
      })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setSaveState('unsaved');
      const html = editor.getHTML();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        handleSave(title, html);
      }, 1000);
    },
  }, [cachedData]); // re-init if cache changes significantly, but actually we use a ref or just keep it simple

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const notes = await getNotes(token);
        const target = notes.find(n => n.id === parseInt(noteId));
        if (target) {
          setNote(target);
          setTitle(target.title || 'Untitled');
          if (editor && !editor.isDestroyed) {
             let content = target.content || '';
             editor.commands.setContent(content);
          }
          setSaveState('saved');
        }
      } catch (err) {}
    };
    fetchNote();
  }, [noteId, token, editor]);

  const handleSave = async (newTitle, newContent) => {
    setSaveState('saving');
    try {
      await updateNote(noteId, { title: newTitle, content: newContent }, token);
      setSaveState('saved');
    } catch (err) {
      setSaveState('unsaved');
    }
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    setSaveState('unsaved');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => handleSave(val, editor.getHTML()), 1000);
  };

  const exportMarkdown = () => {
    const turndownService = new TurndownService();
    const markdown = `# ${title}\n\n${turndownService.turndown(editor.getHTML())}`;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'Note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    // A quick hack for print scoped to editor:
    // Native print dialog uses CSS print media queries.
    window.print();
  };

  if (!note) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div className="printable-editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg)' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-editor-container, .printable-editor-container * { visibility: visible; }
          .printable-editor-container { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', backgroundColor: 'var(--surface)' }}>
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
          {onDelete && (
            <button 
              onClick={onDelete}
              style={{ padding: '6px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Delete Note"
            ><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      <div className="no-print"><MenuBar editor={editor} onExportMD={exportMarkdown} onExportPDF={exportPDF} /></div>

      <div className="tiptap-editor-container" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <h1 className="only-print" style={{ display: 'none' }}>{title}</h1>
        <style>{`@media print { .only-print { display: block !important; margin-bottom: 24px; color: black; } }`}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
