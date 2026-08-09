import { NavLink, Outlet } from 'react-router-dom'
import { NAV_ITEMS } from '@gsm4/shared'
import { useAuth } from '../shared/api/AuthContext'

export function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          GSM<span>4</span>
        </div>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="main">
        <div className="topbar">
          <div className="muted">GameServerManager 4 · M0</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="muted">{user?.username}</span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              退出
            </button>
          </div>
        </div>
        <Outlet />
      </section>
    </div>
  )
}
