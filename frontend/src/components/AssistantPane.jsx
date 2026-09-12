import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Sparkles, X } from "lucide-react";
import { assistantChat, createTask } from "../api";
import "./assistant.css";

const EXAMPLE_PROMPTS = [
  "What's on my plate today?",
  "What's due this week?",
  "Summarise the attached page",
];

const RESOURCE_ICONS = {
  note: FileText,
  announcement: FileText,
  assignment: FileText,
  file: FileText,
};

function formatDueHint(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AssistantPane({
  token,
  onClose,
  onOpenResource,
  initialQuery = "",
  attachment = null,
  initialSend = false,
}) {
  const [messages, setMessages] = useState([]); // {role, content, resources?, actions?, error?}
  const [input, setInput] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sentInitialRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text) => {
    const trimmed = (text ?? input).trim();
    if ((!trimmed && !attachment) || busy) return;
    const history = [...messages, { role: "user", content: trimmed }];
    setMessages([...history, { role: "assistant", content: "", pending: true }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await assistantChat(token, {
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        attachment,
      });
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: reply.reply || "(no reply)",
          resources: reply.resources || [],
          actions: reply.actions || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: "",
          error: err.message || "The assistant is unavailable right now.",
        },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // A pre-filled query from the omnibar / "Ask about this" sends immediately.
  useEffect(() => {
    if (!initialSend || sentInitialRef.current) return;
    sentInitialRef.current = true;
    send(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (messageIndex, actionIndex) => {
    const action = messages[messageIndex]?.actions?.[actionIndex];
    if (!action) return;
    setActionState(messageIndex, actionIndex, "running");
    try {
      const payload = { title: action.title, priority_manual: action.priority || "medium" };
      if (action.due_at) payload.due_at_override = new Date(action.due_at).toISOString();
      await createTask(token, payload);
      window.dispatchEvent(new CustomEvent("canvenient-tasks-changed"));
      setActionState(messageIndex, actionIndex, "done");
    } catch {
      setActionState(messageIndex, actionIndex, "error");
    }
  };

  const setActionState = (messageIndex, actionIndex, state) => {
    setMessages((prev) =>
      prev.map((msg, mi) => {
        if (mi !== messageIndex || !msg.actions) return msg;
        const actions = msg.actions.map((a, ai) => (ai === actionIndex ? { ...a, state } : a));
        return { ...msg, actions };
      }),
    );
  };

  return (
    <aside className="assistant-pane" role="dialog" aria-label="Assistant">
      <header className="assistant-header">
        <div className="assistant-header-title">
          <Sparkles size={15} />
          <strong>Assistant</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close assistant">
          <X size={15} />
        </button>
      </header>

      {attachment && (
        <div className="assistant-attachment" title={attachment.label}>
          <span className="assistant-attachment-kind">{attachment.type}</span>
          <span className="assistant-attachment-label">
            {attachment.label || `#${attachment.id}`}
          </span>
          <span className="assistant-attachment-hint">attached for this session</span>
        </div>
      )}

      <div className="assistant-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="assistant-empty">
            <p>Ask about your day, find a resource, or get something organised.</p>
            <div className="assistant-examples">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => send(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, mi) => (
          <div key={mi} className={`assistant-message is-${message.role}`}>
            {message.pending && <span className="assistant-typing" aria-label="Thinking" />}
            {message.error && <span className="assistant-error">{message.error}</span>}
            {message.content && <p>{message.content}</p>}
            {message.resources?.length > 0 && (
              <div className="assistant-resources">
                {message.resources.map((res, ri) => {
                  const Icon = RESOURCE_ICONS[res.type] || FileText;
                  return (
                    <button
                      key={`${res.type}-${res.id ?? ri}`}
                      type="button"
                      className="assistant-resource-chip"
                      onClick={() => onOpenResource?.(res)}
                    >
                      <Icon size={12} />
                      <span>{res.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {message.actions?.length > 0 && (
              <div className="assistant-actions">
                {message.actions.map((action, ai) => (
                  <div key={ai} className={`assistant-action is-${action.state || "idle"}`}>
                    <div className="assistant-action-text">
                      <strong>{action.title}</strong>
                      {action.due_at && <span>{formatDueHint(action.due_at)}</span>}
                    </div>
                    {(action.state || "idle") === "idle" && (
                      <button type="button" onClick={() => setActionState(mi, ai, "confirming")}>
                        Add task
                      </button>
                    )}
                    {action.state === "confirming" && (
                      <span className="assistant-action-confirm">
                        Create?
                        <button
                          type="button"
                          onClick={() => runAction(mi, ai)}
                          aria-label="Confirm create task"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionState(mi, ai, "idle")}
                          aria-label="Cancel"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                    {action.state === "running" && (
                      <span className="assistant-action-state">Adding…</span>
                    )}
                    {action.state === "done" && (
                      <span className="assistant-action-state">Added ✓</span>
                    )}
                    {action.state === "error" && (
                      <span className="assistant-action-state is-error">Failed — try again</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <footer className="assistant-composer">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          placeholder="Ask, find, or organise…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            } else if (event.key === "Escape") {
              onClose();
            }
          }}
        />
        <button
          type="button"
          className="assistant-send"
          aria-label="Send"
          disabled={busy || !(input.trim() || attachment)}
          onClick={() => send()}
        >
          <ArrowUp size={14} />
        </button>
      </footer>
    </aside>
  );
}
