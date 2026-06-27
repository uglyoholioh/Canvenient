import { useNavigate, NavLink } from "react-router-dom"
import { useState, useEffect } from "react"
import { Home, CheckSquare, Calendar, Users, LogOut, Bell, RefreshCw, Map, FolderOpen } from "lucide-react"
import { getStoredToken, getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "../api"

const navigationConfig = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Task Planner", href: "/planner", icon: CheckSquare },
  { label: "Schedule", href: "/schedule", icon: Calendar },
  { label: "Groups & Comms", href: "/organisations", icon: Users },
  { label: "File Viewer", href: "/files", icon: FolderOpen },
  { label: "Canvas Sync (in prog)", href: "#", icon: RefreshCw },
  { label: "NUSMods (in prog)", href: "#", icon: Map },
  { label: "Group Work (in prog)", href: "#", icon: Users },
]

function Sidebar({ onLogout }) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)

  const token = getStoredToken()

  const loadNotifications = async () => {
    if (!token) return
    try {
      const data = await getNotifications(token)
      setNotifications(data || [])
    } catch (err) {
      console.error("Failed to load notifications:", err)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function refreshNotifications() {
      if (!token) return
      try {
        const data = await getNotifications(token)
        if (!cancelled) setNotifications(data || [])
      } catch (err) {
        console.error("Failed to load notifications:", err)
      }
    }

    refreshNotifications()
    const interval = window.setInterval(refreshNotifications, 10000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [token])

  const handleMarkRead = async (id) => {
    try {
      await markNotificationAsRead(token, id)
      loadNotifications()
    } catch (err) {
      alert(err.message || "Failed to mark as read.")
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead(token)
      loadNotifications()
    } catch (err) {
      alert(err.message || "Failed to mark all as read.")
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const handleLogout = () => {
    onLogout()
    navigate("/login")
  }

  return (
    <div className="sidebar-wrapper">
      <aside className="sidebar-container">

        <div className="brand-icon">
          <span>C</span><span className="brand-text">anvenient</span>
        </div>

        <nav className="sidebar-menu">
          {navigationConfig.map((item) => {
            const Icon = item.icon
            const isPlaceholder = item.href === "#"

            if (isPlaceholder) {
              return (
                <div key={item.label} className="menu-link placeholder">
                  <div className="icon-wrapper">
                    <Icon size={20} />
                  </div>
                  <span className="menu-label">{item.label}</span>
                </div>
              )
            }

            return (
              <NavLink
                key={item.label}
                to={item.href}
                className={({ isActive }) => `menu-link ${isActive ? "active" : ""}`}
              >
                <div className="icon-wrapper">
                  <Icon size={20} />
                </div>
                <span className="menu-label">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button onClick={() => setShowNotifications(!showNotifications)} className="menu-link" title="Notifications" style={{ position: "relative" }}>
            <div className="icon-wrapper">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: "6px",
                  right: "6px",
                  backgroundColor: "var(--error)",
                  color: "#FFFFFF",
                  borderRadius: "50%",
                  width: "16px",
                  height: "16px",
                  fontSize: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold"
                }}>{unreadCount}</span>
              )}
            </div>
            <span className="menu-label">Notifications</span>
          </button>

          <button onClick={handleLogout} className="menu-link logout-btn" title="Log Out">
            <div className="icon-wrapper">
              <LogOut size={20} />
            </div>
            <span className="menu-label">Log Out</span>
          </button>
        </div>

      </aside>

      {showNotifications && (
        <div className="card" style={{
          position: "fixed",
          left: "230px",
          bottom: "80px",
          width: "350px",
          maxHeight: "450px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "var(--shadow)",
          padding: "16px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)"
        }}>
          <div className="flex justify-between items-center" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
            <h4 style={{ fontSize: "16px", fontWeight: "600" }}>Notifications</h4>
            <div className="flex gap-sm">
              <button className="btn btn--secondary btn--sm" onClick={handleMarkAllRead}>Mark all read</button>
              <button className="btn btn--secondary btn--sm" onClick={() => setShowNotifications(false)}>Close</button>
            </div>
          </div>
          <div className="list list--scrollable" style={{ flex: 1, maxHeight: "350px", gap: "8px" }}>
            {notifications.map(n => (
              <div
                key={n.id}
                className="list-item"
                style={{
                  backgroundColor: n.is_read ? "var(--surface-warm)" : "rgba(var(--primary-rgb), 0.05)",
                  borderColor: n.is_read ? "var(--border)" : "var(--primary)",
                  cursor: n.is_read ? "default" : "pointer",
                  padding: "10px"
                }}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
              >
                <div className="flex justify-between items-start gap-xs">
                  <strong className="text-sm" style={{ color: "var(--text-h)" }}>{n.title}</strong>
                  {!n.is_read && <span className="color-dot" style={{ backgroundColor: "var(--primary)", width: "8px", height: "8px" }}></span>}
                </div>
                <p className="text-xs text-muted" style={{ marginTop: "4px" }}>{n.description}</p>
                <span className="text-xs text-muted" style={{ fontSize: "9px", display: "block", marginTop: "6px" }}>
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="state-box text-sm" style={{ padding: "20px 0" }}>No notifications yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar
