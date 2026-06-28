import { useState } from "react"
import { getAiBrief, sendAiChat, createTask } from "../api"

function readCachedBrief() {
    const cachedBrief = sessionStorage.getItem("user_brief")
    if (!cachedBrief) {
        return { brief: null, context: null }
    }

    const parsed = JSON.parse(cachedBrief)
    return {
        brief: parsed.brief,
        context: parsed.context_snapshot,
    }
}

function readCachedMessages() {
    const cachedChat = sessionStorage.getItem("user_brief_chat")
    return cachedChat ? JSON.parse(cachedChat) : []
}

export default function AiBrief({ token, onTaskCreated }) {
    const [briefData, setBriefData] = useState(readCachedBrief)
    const [loadBrief, setLoadBrief] = useState(false)
    const [chatInput, setChatInput] = useState("")
    const [messages, setMessages] = useState(readCachedMessages)
    const [chatLoading, setChatLoading] = useState(false)
    const [error, setError] = useState("")
    const { brief, context } = briefData

    const fetchBrief = async () => {
        setLoadBrief(true)
        setError("")
        try {
            const result = await getAiBrief(token)
            setBriefData({
                brief: result.brief,
                context: result.context_snapshot,
            })
            sessionStorage.setItem("user_brief", JSON.stringify(result))
            setMessages([])
            sessionStorage.removeItem("user_brief_chat")
        } catch (err) {
            setError(err.message || "Failed to load AI brief")
        } finally {
            setLoadBrief(false)
        }
    }

    const handleChatSubmit = async (event) => {
        event.preventDefault()
        if (!chatInput.trim() || chatLoading) return

        const message = { role: "user", content: chatInput.trim() }
        const updMessages = [...messages, message]
        
        setMessages(updMessages)
        setChatInput("")
        setChatLoading(true)
        setError("")

        try {
            const result = await sendAiChat(token, { 
                messages: updMessages, 
                context_snapshot: context 
            })
            const finalMessages = [...updMessages, { role: "model", content: result.reply }]
            setMessages(finalMessages)
            sessionStorage.setItem("user_brief_chat", JSON.stringify(finalMessages))
        } catch (err) {
            setError(err.message || "Failed to send message")
        } finally {
            setChatLoading(false)
        }
    }

    const handleAddTask = async (title, priority) => {
        setError("")
        try {
            await createTask(token, {
                title,
                status: "todo",
                priority_manual: priority || "medium"
            })
            if (onTaskCreated) {
                onTaskCreated()
            }
        } catch (err) {
            setError(err.message || "Failed to add suggested task")
        }
    }

    const handleClear = () => {
        setBriefData({ brief: null, context: null })
        setMessages([])
        sessionStorage.removeItem("user_brief")
        sessionStorage.removeItem("user_brief_chat")
    }

    if (loadBrief) {
        return (
            <div className="card ai-brief-card" style={{ textAlign: "center", padding: "2rem" }}>
                <p>Generating daily academic briefing...</p>
            </div>
        )
    }

    if (!brief) {
        return (
            <div className="card ai-brief-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <h3 style={{ margin: 0, fontFamily: "var(--font-serif)" }}>Daily Academic Briefing</h3>
                    <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        Analyze tasks, timetable schedule, and Canvas updates.
                    </p>
                </div>
                <button onClick={fetchBrief} className="btn btn--primary">
                    Generate Brief
                </button>
            </div>
        )
    }

    return (
        <div className="card ai-brief-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                    <h3 style={{ margin: 0, fontFamily: "var(--font-serif)" }}>Your Academic Briefing</h3>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Today: {context?.current_date}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={fetchBrief} className="btn btn--secondary btn--sm">Refresh</button>
                    <button onClick={handleClear} className="btn btn--secondary btn--sm">Clear</button>
                </div>
            </div>

            {error && <p style={{ color: "var(--text-danger)", fontSize: "0.8rem", marginBottom: "1rem" }}>{error}</p>}

            <p style={{ lineHeight: "1.6", color: "var(--text-h)", fontSize: "0.95rem" }}>{brief.summary}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", margin: "1rem 0" }}>
                {brief.suggestions?.map((item, idx) => (
                    <div key={idx} style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        padding: "0.75rem", 
                        background: "rgba(0,0,0,0.02)", 
                        border: "1px solid rgba(0,0,0,0.05)",
                        borderRadius: "6px" 
                    }}>
                        <div style={{ flex: 1 }}>
                            <span style={{ 
                                fontSize: "0.7rem", 
                                textTransform: "uppercase", 
                                fontWeight: "600", 
                                color: "var(--primary)",
                                display: "inline-block",
                                marginBottom: "0.25rem"
                            }}>
                                {item.type} {item.priority ? `(${item.priority})` : ""}
                            </span>
                            <h5 style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-h)" }}>{item.title || item.message}</h5>
                            {item.description && <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.description}</p>}
                        </div>
                        {item.type === "task" && (
                            <button 
                                onClick={() => handleAddTask(item.title, item.priority)} 
                                className="btn btn--primary btn--sm"
                                style={{ marginLeft: "1rem" }}
                            >
                                Add Task
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "1rem", marginTop: "1.5rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem" }}>Ask Follow-up Questions</h4>
                
                <div style={{ 
                    maxHeight: "200px", 
                    overflowY: "auto", 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "0.5rem",
                    padding: "0.5rem",
                    background: "rgba(0,0,0,0.01)",
                    borderRadius: "6px",
                    marginBottom: "0.75rem"
                }}>
                    {messages.length === 0 ? (
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", margin: "1rem 0" }}>
                            Ask the assistant to prioritize or organize these suggestions.
                        </p>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} style={{ 
                                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                                background: msg.role === "user" ? "rgba(53, 74, 47, 0.08)" : "#fff",
                                border: "1px solid rgba(0,0,0,0.05)",
                                padding: "0.5rem 0.75rem",
                                borderRadius: "8px",
                                maxWidth: "80%"
                            }}>
                                <span style={{ fontSize: "0.6rem", fontWeight: "600", display: "block", color: "var(--text-muted)" }}>
                                    {msg.role === "user" ? "YOU" : "ASSISTANT"}
                                </span>
                                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{msg.content}</p>
                            </div>
                        ))
                    )}
                    {chatLoading && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>Drafting response...</p>}
                </div>

                <form onSubmit={handleChatSubmit} style={{ display: "flex", gap: "0.5rem" }}>
                    <input 
                        type="text" 
                        placeholder="Ask a question..." 
                        value={chatInput} 
                        onChange={(e) => setChatInput(e.target.value)} 
                        disabled={chatLoading}
                        style={{ 
                            flex: 1, 
                            padding: "0.5rem", 
                            border: "1px solid rgba(0,0,0,0.1)", 
                            borderRadius: "4px",
                            fontSize: "0.85rem"
                        }}
                    />
                    <button type="submit" disabled={chatLoading || !chatInput.trim()} className="btn btn--primary">
                        Send
                    </button>
                </form>
            </div>
        </div>
    )
}
