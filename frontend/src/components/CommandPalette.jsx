import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Calendar,
  CheckSquare,
  Compass,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
  Sparkles
} from "lucide-react"

export default function CommandPalette({ isOpen, onClose, onQuickCreateTask, onTriggerCanvasSync }) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Build items based on query
  const navigationItems = [
    {
      id: "nav-today",
      type: "navigation",
      icon: Compass,
      label: "Go to Today Hub",
      shortcut: "G T",
      action: () => {
        navigate("/dashboard")
        onClose()
      },
    },
    {
      id: "nav-tasks",
      type: "navigation",
      icon: CheckSquare,
      label: "Go to Tasks & Planner",
      shortcut: "G P",
      action: () => {
        navigate("/planner")
        onClose()
      },
    },
    {
      id: "nav-schedule",
      type: "navigation",
      icon: Calendar,
      label: "Go to Timetable & Schedule",
      shortcut: "G S",
      action: () => {
        navigate("/schedule")
        onClose()
      },
    },
    {
      id: "nav-canvas",
      type: "navigation",
      icon: FolderOpen,
      label: "Go to Canvas Hub",
      shortcut: "G C",
      action: () => {
        navigate("/canvas")
        onClose()
      },
    },
    {
      id: "nav-settings",
      type: "navigation",
      icon: Settings,
      label: "Settings & Profile",
      shortcut: "G ,",
      action: () => {
        navigate("/settings")
        onClose()
      },
    },
  ]

  const actionItems = [
    {
      id: "act-sync-canvas",
      type: "action",
      icon: RefreshCw,
      label: "Refresh & Sync Canvas (Assignments, Announcements, Files)",
      shortcut: "⌘ R",
      action: () => {
        if (onTriggerCanvasSync) onTriggerCanvasSync()
        onClose()
      },
    },
  ]

  let items = []

  const cleanQuery = query.trim()

  if (cleanQuery.length > 0) {
    items.push({
      id: "create-task-custom",
      type: "create",
      icon: Plus,
      label: `Create task "${cleanQuery}"`,
      badge: "Press Enter",
      action: () => {
        if (onQuickCreateTask) {
          onQuickCreateTask(cleanQuery)
        }
        onClose()
      },
    })
  }

  // Filter navigation & actions
  const filteredNav = navigationItems.filter(
    (item) => item.label.toLowerCase().includes(query.toLowerCase())
  )
  const filteredActions = actionItems.filter(
    (item) => item.label.toLowerCase().includes(query.toLowerCase())
  )

  items = [...items, ...filteredNav, ...filteredActions]

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (items[selectedIndex]) {
        items[selectedIndex].action()
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-header">
          <Search size={18} className="cmd-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Type a command, navigate, or add a task..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query ? (
            <button className="cmd-clear-btn" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          ) : (
            <kbd className="cmd-kbd">ESC</kbd>
          )}
        </div>

        <div className="cmd-body">
          {items.length === 0 ? (
            <div className="cmd-empty">
              <p>No matching commands found</p>
              <span className="text-xs text-muted">Try typing a task title or navigation target</span>
            </div>
          ) : (
            <div className="cmd-list">
              {items.map((item, idx) => {
                const Icon = item.icon
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.id}
                    className={`cmd-item ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => item.action()}
                  >
                    <div className="cmd-item-left">
                      <div className="cmd-item-icon">
                        <Icon size={16} />
                      </div>
                      <span className="cmd-item-label">{item.label}</span>
                    </div>
                    <div className="cmd-item-right">
                      {item.badge && <span className="cmd-badge">{item.badge}</span>}
                      {item.shortcut && <kbd className="cmd-item-shortcut">{item.shortcut}</kbd>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="cmd-footer">
          <div className="cmd-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
          <div className="cmd-brand">
            <Sparkles size={12} />
            <span>Canvenient</span>
          </div>
        </div>
      </div>
    </div>
  )
}
