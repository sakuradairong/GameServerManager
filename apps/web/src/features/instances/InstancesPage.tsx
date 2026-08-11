import { memo, useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateInstanceBody, Instance } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { SteamUpdateDialog } from './SteamUpdateDialog'

const emptyForm: CreateInstanceBody = {
  name: '',
  description: '',
  workingDirectory: '',
  startCommand: '',
  stopCommand: 'ctrl+c',
  autoStart: false,
}

const InstanceRow = memo(function InstanceRow({
  instance,
  busy,
  onAction,
  onOpenTerminal,
  onSteamUpdate,
  onDelete,
}: {
  instance: Instance
  busy: boolean
  onAction: (id: string, action: 'start' | 'stop' | 'restart') => void
  onOpenTerminal: (sessionId: string) => void
  onSteamUpdate: (instance: Instance) => void
  onDelete: (instance: Instance) => void
}) {
  return (
    <div className="table-row">
      <div>
        <div style={{ fontWeight: 600 }}>
          {instance.name}
          {instance.instanceType && instance.instanceType !== 'generic' && (
            <span className="status-pill" style={{ marginLeft: 8 }}>
              {instance.instanceType}
            </span>
          )}
        </div>
        <div className="muted">{instance.workingDirectory}</div>
        <div className="muted">{instance.startCommand}</div>
        {instance.instanceType === 'steam' && instance.steam && (
          <div className="muted">
            appId {instance.steam.appId} · 分支 {instance.steam.branch || 'public'}
          </div>
        )}
      </div>
      <div>
        <span className={`status-pill status-${instance.status}`}>{instance.status}</span>
        {instance.terminalSessionId && (
          <div className="muted" style={{ marginTop: 6 }}>
            session: {instance.terminalSessionId.slice(0, 8)}
          </div>
        )}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => onAction(instance.id, 'start')}
        >
          启动
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => onAction(instance.id, 'stop')}
        >
          停止
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => onAction(instance.id, 'restart')}
        >
          重启
        </button>
        {instance.terminalSessionId && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onOpenTerminal(instance.terminalSessionId!)}
          >
            终端
          </button>
        )}
        {instance.instanceType === 'steam' && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => onSteamUpdate(instance)}
          >
            更新/分支
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => onDelete(instance)}
        >
          删除
        </button>
      </div>
    </div>
  )
})

function CreateInstanceForm({
  creating,
  onCreated,
}: {
  creating: boolean
  onCreated: (form: CreateInstanceBody) => Promise<void>
}) {
  const [form, setForm] = useState<CreateInstanceBody>(emptyForm)

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    try {
      await onCreated(form)
      setForm(emptyForm)
    } catch {
      // 错误已由父组件提示
    }
  }

  return (
    <form className="page-card" onSubmit={onCreate}>
      <h3 style={{ marginTop: 0 }}>新建实例</h3>
      <div className="form-grid">
        <label className="field">
          <span>名称</span>
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>工作目录</span>
          <input
            value={form.workingDirectory}
            onChange={(e) => setForm((prev) => ({ ...prev, workingDirectory: e.target.value }))}
            placeholder="/home/steam/games/demo"
            required
          />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>启动命令</span>
          <input
            value={form.startCommand}
            onChange={(e) => setForm((prev) => ({ ...prev, startCommand: e.target.value }))}
            placeholder="./server.sh 或 java -jar server.jar"
            required
          />
        </label>
        <label className="field">
          <span>停止方式</span>
          <select
            value={form.stopCommand || 'ctrl+c'}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                stopCommand: e.target.value as CreateInstanceBody['stopCommand'],
              }))
            }
          >
            <option value="ctrl+c">Ctrl+C</option>
            <option value="stop">stop</option>
            <option value="exit">exit</option>
            <option value="quit">quit</option>
          </select>
        </label>
        <label className="field">
          <span>描述</span>
          <input
            value={form.description || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </label>
      </div>
      <button className="btn" type="submit" disabled={creating}>
        {creating ? '创建中…' : '创建实例'}
      </button>
    </form>
  )
}

export function InstancesPage() {
  const { push } = useToast()
  const navigate = useNavigate()
  const [instances, setInstances] = useState<Instance[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [steamUpdateInstance, setSteamUpdateInstance] = useState<Instance | null>(null)
  const [steamUpdateOpen, setSteamUpdateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Instance | null>(null)

  const refresh = useCallback(async () => {
    const data = await apiClient.get<Instance[]>('/api/v1/instances')
    setInstances(data)
    setSteamUpdateInstance((current) =>
      current ? data.find((instance) => instance.id === current.id) || current : null,
    )
  }, [])

  useEffect(() => {
    refresh().catch((error) => {
      push(error instanceof Error ? error.message : '加载实例失败', 'error')
    })
  }, [refresh, push])

  const onCreated = useCallback(
    async (form: CreateInstanceBody) => {
      setCreating(true)
      try {
        await apiClient.post<Instance>('/api/v1/instances', form)
        push('实例已创建', 'success')
        await refresh()
      } catch (error) {
        push(error instanceof ApiError ? error.message : '创建失败', 'error')
        throw error
      } finally {
        setCreating(false)
      }
    },
    [push, refresh],
  )

  const runAction = useCallback(
    async (id: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
      setBusyId(id)
      try {
        if (action === 'delete') {
          await apiClient.request(`/api/v1/instances/${id}`, { method: 'DELETE' })
          push('实例已删除', 'success')
        } else {
          const instance = await apiClient.post<Instance>(`/api/v1/instances/${id}/${action}`)
          push(
            `实例已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}`,
            'success',
          )
          if (action === 'start' && instance.terminalSessionId) {
            navigate(`/terminal?sessionId=${instance.terminalSessionId}`)
          }
        }
        await refresh()
      } catch (error) {
        push(error instanceof ApiError ? error.message : '操作失败', 'error')
        await refresh().catch(() => undefined)
      } finally {
        setBusyId(null)
      }
    },
    [navigate, push, refresh],
  )

  const onAction = useCallback(
    (id: string, action: 'start' | 'stop' | 'restart') => {
      void runAction(id, action)
    },
    [runAction],
  )

  const onOpenTerminal = useCallback(
    (sessionId: string) => {
      navigate(`/terminal?sessionId=${sessionId}`)
    },
    [navigate],
  )

  const onSteamUpdate = useCallback((instance: Instance) => {
    setSteamUpdateInstance(instance)
    setSteamUpdateOpen(true)
  }, [])

  const onDelete = useCallback((instance: Instance) => {
    setPendingDelete(instance)
  }, [])

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">实例</h2>
        <p className="page-desc">创建命令型实例，启停通过 PTY 会话执行（M1）。</p>
      </div>

      <CreateInstanceForm creating={creating} onCreated={onCreated} />

      <div className="page-card">
        <h3 style={{ marginTop: 0 }}>实例列表</h3>
        {instances.length === 0 ? (
          <p className="muted">暂无实例</p>
        ) : (
          <div className="table">
            {instances.map((instance) => (
              <InstanceRow
                key={instance.id}
                instance={instance}
                busy={busyId === instance.id}
                onAction={onAction}
                onOpenTerminal={onOpenTerminal}
                onSteamUpdate={onSteamUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {steamUpdateInstance && (
        <SteamUpdateDialog
          instance={steamUpdateInstance}
          open={steamUpdateOpen}
          onClose={() => setSteamUpdateOpen(false)}
          onExited={() => setSteamUpdateInstance(null)}
          onUpdated={() => {
            refresh().catch(() => undefined)
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除实例"
        message={
          pendingDelete
            ? `确定删除实例「${pendingDelete.name}」吗？此操作不会删除其工作目录。`
            : ''
        }
        confirmText="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void runAction(target.id, 'delete')
        }}
      />
    </div>
  )
}
