import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { NAV_ITEMS } from '@gsm4/shared'
import { useAuth } from '../shared/api/AuthContext'
import { AppLayout } from './AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { PlaceholderPage } from '../features/common/PlaceholderPage'
import { HomePage } from '../features/home/HomePage'
import { InstancesPage } from '../features/instances/InstancesPage'
import { TerminalPage } from '../features/terminal/TerminalPage'
import { DeployPage } from '../features/deploy/DeployPage'

const featurePages: Record<string, ReactElement> = {
  home: <HomePage />,
  terminal: <TerminalPage />,
  instances: <InstancesPage />,
  deploy: <DeployPage />,
}

export function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="login-page">
        <div className="muted">加载中…</div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {NAV_ITEMS.map((item) => (
          <Route
            key={item.id}
            path={item.path === '/' ? '/' : item.path}
            element={
              featurePages[item.id] || (
                <PlaceholderPage
                  title={item.label}
                  description={`「${item.label}」模块将在后续里程碑接入。`}
                />
              )
            }
          />
        ))}
      </Route>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
