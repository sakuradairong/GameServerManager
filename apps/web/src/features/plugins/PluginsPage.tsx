import { useCallback, useEffect, useMemo, useState, memo } from 'react'
import type { PluginInfo, PluginListResult } from '@gsm4/shared'
import { useAuth } from '../../shared/api/AuthContext'
import { apiClient, ApiError } from '../../shared/api/client'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/Toast'
import { PluginWebDialog } from './PluginWebDialog'

const emptyResult: PluginListResult = { plugins: [], issues: [] }

function createChannel(): string {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toggleLabel(plugin: PluginInfo, busyName: string | null): string {
  if (busyName === plugin.name) return '处理中…'
  return plugin.enabled ? '禁用' : '启用'
}

const PluginCard = memo(function PluginCard({
  plugin,
  isAdmin,
  busyName,
  onOpen,
  onToggle,
  onDelete,
}: {
  plugin: PluginInfo
  isAdmin: boolean
  busyName: string | null
  onOpen: (plugin: PluginInfo) => void
  onToggle: (plugin: PluginInfo) => void
  onDelete: (plugin: PluginInfo) => void
}) {
  return (
    <article className="plugin-card">
      <div className="plugin-card-heading">
        <div className="plugin-icon" aria-hidden="true">🧩</div>
        <div>
          <div className="plugin-title-row">
            <strong>{plugin.displayName}</strong>
            <span className={`status-pill ${plugin.enabled ? 'status-running' : 'status-stopped'}`}>
              {plugin.enabled ? '已启用' : '已禁用'}
            </span>
          </div>
          <div className="muted">
            {plugin.name} · v{plugin.version}
          </div>
        </div>
      </div>
      <p className="plugin-description">{plugin.description || '暂无描述'}</p>
      <div className="plugin-meta">
        <span>{plugin.category}</span>
        <span>{plugin.author}</span>
        {plugin.source === 'official' && <span>官方</span>}
      </div>
      {plugin.warning && <div className="plugin-warning">{plugin.warning}</div>}
      <div className="row-actions plugin-actions">
        <button
          type="button"
          className="btn"
          disabled={!plugin.enabled || !plugin.webAvailable || busyName === plugin.name}
          onClick={() => onOpen(plugin)}
        >
          打开 WebUI
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busyName !== null}
              onClick={() => onToggle(plugin)}
            >
              {toggleLabel(plugin, busyName)}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busyName !== null}
              onClick={() => onDelete(plugin)}
            >
              卸载
            </button>
          </>
        )}
      </div>
    </article>
  )
})

export function PluginsPage() {
  const { user } = useAuth()
  const { push } = useToast()
  const [result, setResult] = useState<PluginListResult>(emptyResult)
  const [loading, setLoading] = useState(true)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PluginInfo | null>(null)
  const [activePlugin, setActivePlugin] = useState<PluginInfo | null>(null)
  const [pluginDialogOpen, setPluginDialogOpen] = useState(false)
  const [channel, setChannel] = useState('')
  const isAdmin = user?.role === 'admin'

  const loadPlugins = useCallback(async () => {
    const data = await apiClient.get<PluginListResult>('/api/v1/plugins')
    setResult(data)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadPlugins()
      .catch((error) => push(error instanceof Error ? error.message : '加载插件失败', 'error'))
      .finally(() => setLoading(false))
  }, [loadPlugins, push])

  const stats = useMemo(
    () => ({
      total: result.plugins.length,
      enabled: result.plugins.filter((plugin) => plugin.enabled).length,
      web: result.plugins.filter((plugin) => plugin.webAvailable).length,
    }),
    [result.plugins],
  )

  async function refreshDirectory() {
    setBusyName('__refresh__')
    try {
      const data = await apiClient.post<PluginListResult>('/api/v1/plugins/refresh')
      setResult(data)
      push('插件目录已重新扫描', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '扫描插件目录失败', 'error')
    } finally {
      setBusyName(null)
    }
  }

  async function installExample() {
    setBusyName('__install__')
    try {
      await apiClient.post<PluginInfo>('/api/v1/plugins/example')
      push('官方示例插件已安装，请启用后打开', 'success')
      await loadPlugins()
    } catch (error) {
      push(error instanceof ApiError ? error.message : '安装示例插件失败', 'error')
    } finally {
      setBusyName(null)
    }
  }

  const setEnabled = useCallback(
    async (plugin: PluginInfo) => {
      setBusyName(plugin.name)
      try {
        await apiClient.request<PluginInfo>(`/api/v1/plugins/${encodeURIComponent(plugin.name)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !plugin.enabled }),
        })
        push(`插件已${plugin.enabled ? '禁用' : '启用'}`, 'success')
        await loadPlugins()
      } catch (error) {
        push(error instanceof ApiError ? error.message : '更新插件状态失败', 'error')
      } finally {
        setBusyName(null)
      }
    },
    [loadPlugins, push],
  )

  async function uninstall(plugin: PluginInfo) {
    setBusyName(plugin.name)
    try {
      await apiClient.request(`/api/v1/plugins/${encodeURIComponent(plugin.name)}`, {
        method: 'DELETE',
      })
      push('插件已卸载', 'success')
      await loadPlugins()
    } catch (error) {
      push(error instanceof ApiError ? error.message : '卸载插件失败', 'error')
    } finally {
      setBusyName(null)
    }
  }

  const openPlugin = useCallback((plugin: PluginInfo) => {
    if (!plugin.enabled || !plugin.webAvailable) return
    setChannel(createChannel())
    setActivePlugin(plugin)
    setPluginDialogOpen(true)
  }, [])

  const requestDelete = useCallback((plugin: PluginInfo) => {
    setPendingDelete(plugin)
  }, [])

  const togglePlugin = useCallback(
    (target: PluginInfo) => {
      void setEnabled(target)
    },
    [setEnabled],
  )

  return (
    <div className="stack">
      <section className="page-card plugin-page-header">
        <div>
          <h2 className="page-title">插件</h2>
          <p className="page-desc">
            扫描 <code>data/plugins</code> 中的插件，管理启用状态并在安全沙箱中打开 WebUI。
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busyName !== null}
            onClick={() => void refreshDirectory()}
          >
            {busyName === '__refresh__' ? '扫描中…' : '重新扫描'}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn"
              disabled={busyName !== null || result.plugins.some((item) => item.name === 'gsm4-example')}
              onClick={() => void installExample()}
            >
              {busyName === '__install__' ? '安装中…' : '安装官方示例'}
            </button>
          )}
        </div>
      </section>

      <section className="stat-grid plugin-stat-grid">
        <div className="stat-card">
          <div className="muted">已发现</div>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-card">
          <div className="muted">已启用</div>
          <strong>{stats.enabled}</strong>
        </div>
        <div className="stat-card">
          <div className="muted">可打开 WebUI</div>
          <strong>{stats.web}</strong>
        </div>
      </section>

      {result.issues.length > 0 && (
        <section className="page-card plugin-issues">
          <h3>未加载的插件目录</h3>
          {result.issues.map((issue) => (
            <div key={issue.directory} className="plugin-issue-row">
              <code>{issue.directory}</code>
              <span>{issue.message}</span>
            </div>
          ))}
        </section>
      )}

      <section className="page-card">
        <div className="plugin-section-heading">
          <h3>本地插件</h3>
          {!isAdmin && <span className="muted">普通用户可查看和打开已启用插件</span>}
        </div>
        {loading ? (
          <p className="muted">正在加载插件…</p>
        ) : result.plugins.length === 0 ? (
          <div className="plugin-empty">
            <strong>尚未发现插件</strong>
            <p className="muted">
              管理员可以安装官方示例，或将包含 <code>plugin.json</code> 的插件目录放入
              <code> data/plugins</code> 后重新扫描。
            </p>
          </div>
        ) : (
          <div className="plugin-grid">
            {result.plugins.map((plugin) => (
              <PluginCard
                key={plugin.name}
                plugin={plugin}
                isAdmin={isAdmin}
                busyName={busyName}
                onOpen={openPlugin}
                onToggle={togglePlugin}
                onDelete={requestDelete}
              />
            ))}
          </div>
        )}
      </section>

      {activePlugin && (
        <PluginWebDialog
          plugin={activePlugin}
          channel={channel}
          open={pluginDialogOpen}
          onClose={() => setPluginDialogOpen(false)}
          onExited={() => setActivePlugin(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="卸载插件"
        message={
          pendingDelete
            ? `确定卸载插件「${pendingDelete.displayName}」吗？插件目录及其中数据会被删除。`
            : ''
        }
        confirmText="卸载"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void uninstall(target)
        }}
      />
    </div>
  )
}
