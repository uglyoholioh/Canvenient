import { useState, useRef } from "react";
import { Check, Send } from "lucide-react";
import { getAiBrief, sendAiChat, createTask } from "../../api";

function readCachedBrief() {
  const cachedBrief = sessionStorage.getItem("user_brief");
  if (!cachedBrief) return { brief: null, context: null };
  const parsed = JSON.parse(cachedBrief);
  return { brief: parsed.brief, context: parsed.context_snapshot };
}

function readCachedMessages() {
  const cachedChat = sessionStorage.getItem("user_brief_chat");
  return cachedChat ? JSON.parse(cachedChat) : [];
}

export default function AiBriefModule({ token }) {
  const [briefData, setBriefData] = useState(readCachedBrief);
  const [loadBrief, setLoadBrief] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState(readCachedMessages);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [addedSuggestions, setAddedSuggestions] = useState([]);
  const [timeframe, setTimeframe] = useState("this_week");
  const fetchIdRef = useRef(0);
  
  const { brief, context } = briefData;

  const fetchBrief = async (forceRefresh = false, overrideTimeframe = null) => {
    const selectedTimeframe = overrideTimeframe || timeframe;
    setLoadBrief(true);
    setError("");
    const currentFetchId = ++fetchIdRef.current;
    
    try {
      const result = await getAiBrief(token, forceRefresh, selectedTimeframe);
      if (currentFetchId !== fetchIdRef.current) return;
      setBriefData({ brief: result.brief, context: result.context_snapshot });
      sessionStorage.setItem("user_brief", JSON.stringify(result));
      setMessages([]);
      sessionStorage.removeItem("user_brief_chat");
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return;
      setError(err.message || "Failed to load AI brief");
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoadBrief(false);
      }
    }
  };

  const handleChatSubmit = async (event) => {
    event.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const message = { role: "user", content: chatInput.trim() };
    const updMessages = [...messages, message];
    
    setMessages(updMessages);
    setChatInput("");
    setChatLoading(true);
    setError("");

    try {
      const result = await sendAiChat(token, { messages: updMessages, context_snapshot: context });
      const finalMessages = [...updMessages, { role: "model", content: result.reply }];
      setMessages(finalMessages);
      sessionStorage.setItem("user_brief_chat", JSON.stringify(finalMessages));
    } catch (err) {
      setError(err.message || "Failed to send message");
    } finally {
      setChatLoading(false);
    }
  };

  const handleAddTask = async (idx, title, priority) => {
    setError("");
    const normPriority = (priority || "medium").toLowerCase().trim();
    const validPriorities = ["low", "medium", "high", "urgent"];
    const finalPriority = validPriorities.includes(normPriority) ? normPriority : "medium";

    try {
      await createTask(token, { title, status: "todo", priority_manual: finalPriority });
      setAddedSuggestions(prev => [...prev, idx]);
      window.dispatchEvent(new Event("canvenient-task-created"));
    } catch (err) {
      setError(err.message || "Failed to add task");
    }
  };

  if (loadBrief) {
    return <div className="module-empty">Generating daily academic briefing...</div>;
  }

  if (!brief) {
    return (
      <div className="module-empty ai-brief-empty">
        <p>Analyze tasks, schedule, and Canvas updates.</p>
        <button type="button" className="module-primary-action" onClick={() => fetchBrief()}>Generate Brief</button>
      </div>
    );
  }

  return (
    <div className="ai-brief-module">
      <header className="ai-brief-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <select 
            value={timeframe} 
            onChange={(e) => {
              setTimeframe(e.target.value);
              fetchBrief(false, e.target.value);
            }}
            className="ai-brief-timeframe-select"
            style={{ fontSize: '0.85rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-color)' }}
          >
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
          </select>
          <button type="button" onClick={() => fetchBrief(true)} style={{ fontSize: '0.8rem', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-muted)' }}>Refresh</button>
        </div>
        <p>{brief.summary}</p>
        {error && <div className="module-error">{error}</div>}
      </header>

      <div className="module-list ai-brief-list">
        {(brief.suggestions || []).map((item, idx) => (
          <div key={idx} className="module-list-item ai-brief-item">
            <span className="module-item-copy">
              <strong>{item.type} {item.priority ? `(${item.priority})` : ""} - {item.title || item.message}</strong>
              {item.description && <small>{item.description}</small>}
            </span>
            {item.type === "task" && (
              <button
                type="button"
                className="ai-brief-action-btn"
                onClick={() => handleAddTask(idx, item.title || item.message, item.priority)}
                disabled={addedSuggestions.includes(idx)}
                title="Add Task"
              >
                {addedSuggestions.includes(idx) ? <Check size={14} /> : "Add"}
              </button>
            )}
          </div>
        ))}
        
        {messages.map((msg, idx) => (
          <div key={`msg-${idx}`} className={`module-list-item ai-brief-chat-item ${msg.role === 'user' ? 'is-user' : ''}`}>
            <span className="module-item-copy">
              <strong>{msg.role === 'user' ? 'You' : 'Assistant'}</strong>
              <small>{msg.content}</small>
            </span>
          </div>
        ))}
        {chatLoading && <div className="module-list-item ai-brief-chat-item"><small>Thinking...</small></div>}
      </div>

      <form className="ai-brief-form" onSubmit={handleChatSubmit}>
        <input 
          type="text" 
          value={chatInput} 
          onChange={(e) => setChatInput(e.target.value)} 
          placeholder="Ask follow-up..." 
          disabled={chatLoading}
          aria-label="Chat input"
        />
        <button type="submit" disabled={chatLoading || !chatInput.trim()} aria-label="Send message">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
