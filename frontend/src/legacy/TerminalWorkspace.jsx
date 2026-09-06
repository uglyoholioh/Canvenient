import React, { useState, useEffect, useRef } from "react";
import { getTasks, createTask, getNotes, createNote } from "../api";
import { format } from "date-fns";

function TerminalWorkspace({ token, user }) {
  const [items, setItems] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const fetchData = async () => {
    try {
      const [fetchedTasks, fetchedNotes] = await Promise.all([
        getTasks(token),
        getNotes(token),
      ]);
      
      const combined = [
        ...fetchedTasks.map(t => ({ ...t, type: 'task' })),
        ...fetchedNotes.map(n => ({ ...n, type: 'note' }))
      ].sort((a, b) => new Date(a.created_at || a.due_at_override || 0) - new Date(b.created_at || b.due_at_override || 0));

      setItems(combined);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    // Scroll to bottom when items change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  useEffect(() => {
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // Global keyboard shortcut to focus input
    const handleKeyDown = (e) => {
      // If not already focused and user presses any printable character
      if (
        document.activeElement !== inputRef.current && 
        e.key.length === 1 && 
        !e.ctrlKey && 
        !e.metaKey
      ) {
        inputRef.current.focus();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    const text = inputValue.trim();
    setInputValue("");
    
    try {
      if (text.startsWith("/note ")) {
        const content = text.slice(6).trim();
        await createNote(token, { content });
      } else {
        await createTask(token, { title: text, priority_manual: "medium" });
      }
      await fetchData();
    } catch (error) {
      console.error("Error creating item", error);
    }
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header" data-tauri-drag-region>
        <span className="text-muted">Welcome to Canvenient, {user?.name || "User"}.</span>
        <span className="text-xs text-muted font-mono">{format(new Date(), "yyyy-MM-dd HH:mm")}</span>
      </div>
      
      <div className="terminal-feed" ref={scrollRef}>
        {isLoading ? (
          <div className="text-muted font-mono animate-pulse">Loading workspace...</div>
        ) : items.length === 0 ? (
          <div className="text-muted font-mono">No entries yet. Start typing to create a task, or use /note to jot something down.</div>
        ) : (
          items.map((item, i) => (
            <div key={`${item.type}-${item.id}`} className="terminal-item">
              <span className="terminal-item-prefix text-muted">
                {item.type === 'task' ? '[T]' : '[N]'}
              </span>
              <div className="terminal-item-content">
                {item.type === 'task' ? (
                  <span className={item.status === 'done' ? 'text-muted line-through' : ''}>
                    {item.title}
                  </span>
                ) : (
                  <span>{item.content}</span>
                )}
              </div>
              <span className="terminal-item-time text-xs text-muted font-mono">
                {item.created_at ? format(new Date(item.created_at), "HH:mm") : ''}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="terminal-input-area">
        <span className="terminal-prompt text-accent">~&gt;</span>
        <form onSubmit={handleSubmit} className="terminal-form">
          <input
            ref={inputRef}
            type="text"
            className="terminal-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a task, or /note to jot something down..."
            autoComplete="off"
          />
        </form>
      </div>
    </div>
  );
}

export default TerminalWorkspace;
