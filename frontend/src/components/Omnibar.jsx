import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { getNotes, getTasks } from "../api";

// The omnibar searches the whole notes+tasks corpus client-side, so refetch
// both on every keystroke would hammer the backend. Cache the corpus for a
// short window and invalidate when tasks change elsewhere in the app.
const CORPUS_TTL_MS = 30_000;
let corpusCache = null;

export function invalidateOmnibarCorpus() {
  corpusCache = null;
}

async function loadCorpus(token) {
  if (corpusCache && corpusCache.token === token && Date.now() - corpusCache.fetchedAt < CORPUS_TTL_MS) {
    return corpusCache;
  }
  const [notes, tasks] = await Promise.all([getNotes(token), getTasks(token)]);
  corpusCache = { token, notes, tasks, fetchedAt: Date.now() };
  return corpusCache;
}

export default function Omnibar({ onClose, token, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const corpusRef = useRef({ notes: [], tasks: [] });

  useEffect(() => {
    inputRef.current?.focus();

    // Warm the cache as the omnibar opens, and drop it when tasks change.
    loadCorpus(token)
      .then((corpus) => { corpusRef.current = corpus; })
      .catch(() => {});
    const invalidate = () => {
      invalidateOmnibarCorpus();
    };
    window.addEventListener("canvenient-tasks-changed", invalidate);
    const handleGlobalKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => {
      window.removeEventListener("canvenient-tasks-changed", invalidate);
      window.removeEventListener('keydown', handleGlobalKey);
    };
  }, [onClose, token]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      try {
        const { notes, tasks } = await loadCorpus(token);
        corpusRef.current = { notes, tasks };
        const q = query.toLowerCase();
        const views = [
          { type: 'view', id: 'wheel', view: 'wheel', title: 'Spin the Wheel (NUS Food, Modules & Custom)', keywords: ['wheel', 'spin', 'eat', 'food', 'decide', 'module'] },
          { type: 'view', id: 'dashboard', view: 'dashboard', title: 'Dashboard', keywords: ['dashboard', 'home'] },
          { type: 'view', id: 'tasks', view: 'tasks', title: 'Tasks', keywords: ['tasks', 'todo'] },
          { type: 'view', id: 'schedule', view: 'schedule', title: 'Schedule', keywords: ['schedule', 'calendar', 'timetable'] },
          { type: 'view', id: 'venues', view: 'venues', title: 'Venue Finder', keywords: ['venue', 'room', 'map'] },
          { type: 'view', id: 'canvas', view: 'canvas', title: 'Modules', keywords: ['modules', 'canvas', 'courses'] },
          { type: 'view', id: 'notes', view: 'notes', title: 'Notes', keywords: ['notes'] },
        ];
        const matchedViews = views.filter(v => v.title.toLowerCase().includes(q) || v.keywords.some(k => k.includes(q)));
        const filteredNotes = notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)).map(n => ({ ...n, type: 'note' }));
        const filteredTasks = tasks.filter(t => t.title.toLowerCase().includes(q)).map(t => ({ ...t, type: 'task' }));
        setResults([...matchedViews, ...filteredNotes, ...filteredTasks]);
        setSelectedIndex(0);
      } catch (err) {
        console.error(err);
      }
    };
    
    const debounce = setTimeout(fetchResults, 200);
    return () => clearTimeout(debounce);
  }, [query, token]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      onNavigate(results[selectedIndex].type, results[selectedIndex]);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '15vh', zIndex: 1000 }} onClick={onClose}>
      <div 
        style={{ width: '100%', maxWidth: '600px', backgroundColor: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.4)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={20} color="var(--text-muted)" style={{ marginRight: '12px' }} />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Type a command or search notes..." 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-h)', fontSize: '16px', outline: 'none', fontFamily: 'var(--font-sans)' }}
          />
        </div>
        
        {results.length > 0 && (
          <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '8px 0' }}>
            {results.map((item, idx) => (
              <div 
                key={idx} 
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', backgroundColor: idx === selectedIndex ? 'var(--surface-hover)' : 'transparent' }}
                onClick={() => onNavigate(item.type, item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)', marginRight: '12px', textTransform: 'uppercase' }}>
                  {item.type}
                </div>
                <div style={{ color: idx === selectedIndex ? 'var(--text-h)' : 'var(--text)' }}>
                  {item.title}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
