import { useEffect, useState } from 'react'
import { RealtimeEvents, type SystemInfo, type SystemStats } from '@gsm4/shared'
import { apiClient } from '../../shared/api/client'
import { getSocket } from '../../shared/realtime/socket'

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(1)} ${units[idx]}`
}

export function HomePage() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = await apiClient.get<SystemInfo>('/api/v1/system/info')
        if (!cancelled) setInfo(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      }
    })()

    const socket = getSocket()
    const onStats = (payload: SystemStats) => setStats(payload)
    socket.emit(RealtimeEvents.subscribeSystemStats)
    socket.on(RealtimeEvents.systemStats, onStats)

    return () => {
      cancelled = true
      socket.emit(RealtimeEvents.unsubscribeSystemStats)
      socket.off(RealtimeEvents.systemStats, onStats)
    }
  }, [])

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">首页</h2>
        <p className="page-desc">主机基础监控（M1）。统计通过 Socket.IO 实时推送。</p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="stat-grid">
        <div className="page-card stat-card">
          <div className="stat-label">CPU</div>
          <div className="stat-value">{stats ? `${stats.cpu.usage.toFixed(1)}%` : '—'}</div>
          <div className="muted">{stats?.cpu.model || info?.cpuModel}</div>
        </div>
        <div className="page-card stat-card">
          <div className="stat-label">内存</div>
          <div className="stat-value">{stats ? `${stats.memory.usage.toFixed(1)}%` : '—'}</div>
          <div className="muted">
            {stats
              ? `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`
              : info
                ? `${formatBytes(info.totalMemory - info.freeMemory)} / ${formatBytes(info.totalMemory)}`
                : '—'}
          </div>
        </div>
        <div className="page-card stat-card">
          <div className="stat-label">磁盘 `/`</div>
          <div className="stat-value">
            {stats?.disk?.usage != null ? `${stats.disk.usage.toFixed(1)}%` : '—'}
          </div>
          <div className="muted">
            {stats?.disk
              ? `${formatBytes(stats.disk.used || 0)} / ${formatBytes(stats.disk.total || 0)}`
              : '暂无数据'}
          </div>
        </div>
        <div className="page-card stat-card">
          <div className="stat-label">Load</div>
          <div className="stat-value">{stats ? stats.load.avg1.toFixed(2) : '—'}</div>
          <div className="muted">
            {stats
              ? `${stats.load.avg5.toFixed(2)} / ${stats.load.avg15.toFixed(2)}`
              : info
                ? `${info.platform} · ${info.arch}`
                : '—'}
          </div>
        </div>
      </div>

      {info && (
        <div className="page-card">
          <h3 style={{ marginTop: 0 }}>主机信息</h3>
          <div className="kv-grid">
            <div>
              <span className="muted">主机名</span>
              <div>{info.hostname}</div>
            </div>
            <div>
              <span className="muted">系统</span>
              <div>
                {info.platform} {info.release}
              </div>
            </div>
            <div>
              <span className="muted">CPU 核心</span>
              <div>{info.cpuCount}</div>
            </div>
            <div>
              <span className="muted">Node</span>
              <div>{info.nodeVersion}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
