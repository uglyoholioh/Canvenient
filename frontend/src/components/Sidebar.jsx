import { useNavigate, NavLink } from "react-router-dom"
import { Home, CheckSquare, RefreshCw, Map, Users, LogOut, FolderOpen } from "lucide-react"

const navigationConfig = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Task Planner", href: "/planner", icon: CheckSquare },
  { label: "File Viewer", href: "/files", icon: FolderOpen },
  { label: "Canvas Sync (in prog)", href: "#", icon: RefreshCw },
  { label: "NUSMods (in prog)", href: "#", icon: Map },
  { label: "Group Work (in prog)", href: "#", icon: Users },
]

function Sidebar({ currentUser, onLogout }) {
  const navigate = useNavigate()

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

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="menu-link logout-btn" title="Log Out">
            <div className="icon-wrapper">
              <LogOut size={20} />
            </div>
            <span className="menu-label">Log Out</span>
          </button>
        </div>

      </aside>
    </div>
  )
}

export default Sidebar
