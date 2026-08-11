import { memo } from 'react'
import type { DeployProgress, DeploySessionSummary } from '@gsm4/shared'

export const DeployConsole = memo(function DeployConsole({
  session,
  progress,
  logs,
  error,
}: {
  session: DeploySessionSummary | null
  progress: DeployProgress | null
  logs: string[]
  error: string | null
}) {
  if (!session && logs.length === 0 && !error) {
    return null
  }

  return (
    <div className="page-card">
      <h3 style={{ marginTop: 0 }}>部署会话</h3>
      {session && (
        <div className="muted" style={{ marginBottom: 8 }}>
          {session.sessionId} · {session.status}
          {session.installPath ? ` · ${session.installPath}` : ''}
          {session.instanceId ? ` · instance ${session.instanceId.slice(0, 8)}` : ''}
        </div>
      )}
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.max(0, Math.min(100, progress?.percent ?? 0))}%` }}
        />
      </div>
      <div className="muted" style={{ margin: '8px 0 12px' }}>
        {progress?.message || progress?.stage || '等待进度…'}
        {progress?.percent != null ? ` (${progress.percent.toFixed(0)}%)` : ''}
      </div>
      {error && <p className="error-text">{error}</p>}
      <pre className="deploy-log">{logs.join('\n') || '暂无日志'}</pre>
    </div>
  )
})
