import { useState, useEffect } from "react"
import { useNavigate, NavLink } from "react-router-dom"
import {
  Compass,
  CheckSquare,
  Calendar,
  FolderOpen,
  Settings,
  Bell,
  LogOut,
  Command,
  ChevronRight
} from "lucide-react"
import { getStoredToken, getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "../api"

const navigationItems = [
  { label: "Today", href: "/dashboard", icon: Compass, shortcut: "G T" },
  { label: "Tasks", href: "/planner", icon: CheckSquare, shortcut: "G P" },
  { label: "Schedule", href: "/schedule", icon: Calendar, shortcut: "G S" },
  { label: "Canvas", href: "/canvas", icon: FolderOpen, shortcut: "G C" },
]

export default function SlimSidebar({ onLogout, onOpenCommandPalette }) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const token = getStoredToken()

  const loadNotifications = async () => {
    if (!token) return
    try {
      const data = await getNotifications(token)
      setNotifications(data || [])
    } catch {
      // silent
    }
  }

  useEffect(() => {
    let cancelled = false
    loadNotifications()
    const interval = window.setInterval(() => {
      if (!cancelled) loadNotifications()
    }, 15000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [token])

  const handleMarkRead = async (id) => {
    try {
      await markNotificationAsRead(token, id)
      loadNotifications()
    } catch {
      // silent
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead(token)
      loadNotifications()
    } catch {
      // silent
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const handleLogout = () => {
    onLogout()
    navigate("/login")
  }

  return (
    <div className="slim-sidebar-wrapper">
      <aside className="slim-sidebar">
        {/* Brand */}
        <div className="slim-brand" onClick={() => navigate("/dashboard")} title="Canvenient">
          <span className="slim-brand-mark">C</span>
        </div>

        {/* Quick Search trigger */}
        <div className="slim-action-group">
          <button
            className="slim-icon-btn cmd-trigger-btn"
            onClick={onOpenCommandPalette}
            title="Command Palette (⌘K)"
          >
            <Command size={17} />
            <span className="slim-tooltip">Command Palette <kbd>⌘K</kbd></span>
          </button>
        </div>

        {/* Main Nav */}
        <nav className="slim-nav">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) => `slim-nav-link ${isActive ? "active" : ""}`}
                title={item.label}
              >
                <Icon size={18} />
                <span className="slim-tooltip">
                  {item.label} <kbd>{item.shortcut}</kbd>
                </span>
              </NavLink>
            )
          })}
        </nav>

        {/* Footer actions */}
        <div className="slim-footer">
          {/* Notifications */}
          <div className="slim-popover-anchor">
            <button
              className={`slim-icon-btn ${showNotifications ? "active" : ""}`}
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="slim-badge-dot" />}
              <span className="slim-tooltip">Notifications</span>
            </button>

            {showNotifications && (
              <div className="slim-notif-popover">
                <div className="slim-notif-header">
                  <h5>Notifications ({unreadCount} unread)</h5>
                  <div className="flex gap-xs items-center">
                    {unreadCount > 0 && (
                      <button className="btn btn--subtle text-xs" onClick={handleMarkAllRead}>
                        Mark all read
                      </button>
                    )}
                    <button className="btn btn--subtle text-xs" onClick={() => setShowNotifications(false)}>
                      Close
                    </button>
                  </div>
                </div>
                <div className="slim-notif-list">
                  {notifications.length === 0 ? (
                    <div className="p-sm text-center text-xs text-muted">No notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`slim-notif-item ${n.is_read ? "read" : "unread"}`}
                        onClick={() => !n.is_read && handleMarkRead(n.id)}
                      >
                        <div className="flex justify-between items-start">
                          <strong className="text-xs">{n.title}</strong>
                          {!n.is_read && <span className="unread-pip" />}
                        </div>
                        <p className="text-xs text-muted mt-xs">{n.description}</p>
                        <span className="text-xs text-muted slim-notif-time">
                          {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) => `slim-icon-btn ${isActive ? "active" : ""}`}
            title="Settings"
          >
            <Settings size={18} />
            <span className="slim-tooltip">Settings</span>
          </NavLink>

          {/* Logout */}
          <button className="slim-icon-btn slim-logout-btn" onClick={handleLogout} title="Log Out">
            <LogOut size={18} />
            <span className="slim-tooltip">Log Out</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
