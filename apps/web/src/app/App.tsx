import { lazy, Suspense, type ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { NAV_ITEMS } from '@gsm4/shared'
import { useAuth } from '../shared/api/AuthContext'
import { AppLayout } from './AppLayout'
import { LoginPage } from '../features/auth/LoginPage'

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((module) => ({ default: module.HomePage })),
)
const InstancesPage = lazy(() =>
  import('../features/instances/InstancesPage').then((module) => ({
    default: module.InstancesPage,
  })),
)
const TerminalPage = lazy(() =>
  import('../features/terminal/TerminalPage').then((module) => ({
    default: module.TerminalPage,
  })),
)
const DeployPage = lazy(() =>
  import('../features/deploy/DeployPage').then((module) => ({ default: module.DeployPage })),
)
const FilesPage = lazy(() =>
  import('../features/files/FilesPage').then((module) => ({ default: module.FilesPage })),
)
const PluginsPage = lazy(() =>
  import('../features/plugins/PluginsPage').then((module) => ({ default: module.PluginsPage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
)
const AboutPage = lazy(() =>
  import('../features/about/AboutPage').then((module) => ({ default: module.AboutPage })),
)

const featurePages: Record<string, ReactElement> = {
  home: <HomePage />,
  terminal: <TerminalPage />,
  instances: <InstancesPage />,
  deploy: <DeployPage />,
  files: <FilesPage />,
  plugins: <PluginsPage />,
  settings: <SettingsPage />,
  about: <AboutPage />,
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
              <Suspense fallback={<div className="page-card muted">页面加载中…</div>}>
                {featurePages[item.id]}
              </Suspense>
            }
          />
        ))}
      </Route>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
