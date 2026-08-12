import { memo, useEffect, useState } from 'react'
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

function formatUptime(sec: number) {
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}

function shouldUpdateStats(prev: SystemStats | null, next: SystemStats): boolean {
  if (!prev) return true
  if (Math.abs(prev.cpu.usage - next.cpu.usage) >= 0.5) return true
  if (Math.abs(prev.memory.usage - next.memory.usage) >= 0.5) return true
  if (Math.abs(prev.memory.used - next.memory.used) >= 8 * 1024 * 1024) return true
  if (Math.abs(prev.load.avg1 - next.load.avg1) >= 0.05) return true
  const prevDisk = prev.disk?.usage
  const nextDisk = next.disk?.usage
  if (prevDisk != null && nextDisk != null && Math.abs(prevDisk - nextDisk) >= 0.5) return true
  if ((prevDisk == null) !== (nextDisk == null)) return true
  return false
}

function usageTone(usage: number | null | undefined): 'ok' | 'warn' | 'crit' | undefined {
  if (usage == null || Number.isNaN(usage)) return undefined
  if (usage >= 90) return 'crit'
  if (usage >= 75) return 'warn'
  return 'ok'
}

const StatCard = memo(function StatCard({
  label,
  value,
  detail,
  usage,
}: {
  label: string
  value: string
  detail: string
  usage?: number | null
}) {
  const tone = usageTone(usage)
  return (
    <div className="page-card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted">{detail}</div>
      {usage != null && Number.isFinite(usage) && (
        <div
          className={`stat-meter${tone ? ` is-${tone}` : ''}`}
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage)}
        >
          <div className="stat-meter-bar" style={{ width: `${Math.max(0, Math.min(100, usage))}%` }} />
        </div>
      )}
    </div>
  )
})

export function HomePage() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(typeof document === 'undefined' || document.visibilityState !== 'hidden')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = await apiClient.get<SystemInfo>('/api/v1/system/info', {
          cacheTtlMs: 60_000,
        })
        if (!cancelled) setInfo(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      setLive(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!live) return

    const socket = getSocket()
    const onStats = (payload: SystemStats) => {
      setStats((prev) => (shouldUpdateStats(prev, payload) ? payload : prev))
    }
    socket.emit(RealtimeEvents.subscribeSystemStats)
    socket.on(RealtimeEvents.systemStats, onStats)

    return () => {
      socket.emit(RealtimeEvents.unsubscribeSystemStats)
      socket.off(RealtimeEvents.systemStats, onStats)
    }
  }, [live])

  const cpuModel = stats?.cpu.model || info?.cpuModel
  const updatedAt = stats?.timestamp ? new Date(stats.timestamp) : null

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">首页</h2>
        <p className="page-desc">
          主机性能监控。统计经 Socket.IO 推送；后台标签页自动暂停订阅。
          {updatedAt && (
            <span className="muted"> · 更新于 {updatedAt.toLocaleTimeString()}</span>
          )}
          {!live && <span className="muted"> · 已暂停</span>}
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="stat-grid">
        <StatCard
          label="CPU"
          value={stats ? `${stats.cpu.usage.toFixed(1)}%` : '—'}
          detail={cpuModel || '—'}
          usage={stats?.cpu.usage}
        />
        <StatCard
          label="内存"
          value={stats ? `${stats.memory.usage.toFixed(1)}%` : '—'}
          detail={
            stats
              ? `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`
              : info
                ? `${formatBytes(info.totalMemory - info.freeMemory)} / ${formatBytes(info.totalMemory)}`
                : '—'
          }
          usage={
            stats?.memory.usage ??
            (info && info.totalMemory > 0
              ? ((info.totalMemory - info.freeMemory) / info.totalMemory) * 100
              : null)
          }
        />
        <StatCard
          label="磁盘 `/`"
          value={stats?.disk?.usage != null ? `${stats.disk.usage.toFixed(1)}%` : '—'}
          detail={
            stats?.disk
              ? `${formatBytes(stats.disk.used || 0)} / ${formatBytes(stats.disk.total || 0)}`
              : '暂无数据'
          }
          usage={stats?.disk?.usage}
        />
        <StatCard
          label="Load"
          value={stats ? stats.load.avg1.toFixed(2) : '—'}
          detail={
            stats
              ? `5m ${stats.load.avg5.toFixed(2)} · 15m ${stats.load.avg15.toFixed(2)}`
              : info
                ? `${info.platform} · ${info.arch}`
                : '—'
          }
        />
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
              <span className="muted">运行时间</span>
              <div>{formatUptime(info.uptimeSec)}</div>
            </div>
            <div>
              <span className="muted">架构</span>
              <div>{info.arch}</div>
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
