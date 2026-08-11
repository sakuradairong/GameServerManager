import { useCallback, useEffect, useState } from 'react'
import type { BackupSet, Instance } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function BackupDialog({
  instance,
  open,
  onClose,
  onExited,
  onChanged,
}: {
  instance: Instance
  open: boolean
  onClose: () => void
  onExited: () => void
  onChanged: () => void
}) {
  const { push } = useToast()
  const [set, setSet] = useState<BackupSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stopInstance, setStopInstance] = useState(true)
  const [maxKeep, setMaxKeep] = useState(10)
  const [pendingRestore, setPendingRestore] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingClear, setPendingClear] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiClient.get<BackupSet>(`/api/v1/instances/${instance.id}/backups`)
      setSet(data)
    } catch (error) {
      push(error instanceof ApiError ? error.message : '加载备份失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [instance.id, push])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

  async function onCreate() {
    setBusy(true)
    try {
      const data = await apiClient.post<BackupSet>(`/api/v1/instances/${instance.id}/backups`, {
        stopInstance,
        maxKeep,
      })
      setSet(data)
      push('备份已创建', 'success')
      onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.message : '备份失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onRestore(fileName: string) {
    setBusy(true)
    try {
      const data = await apiClient.post<BackupSet>(
        `/api/v1/instances/${instance.id}/backups/restore`,
        { fileName, stopInstance },
      )
      setSet(data)
      push('备份已恢复到工作目录', 'success')
      onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.message : '恢复失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteFile(fileName: string) {
    setBusy(true)
    try {
      const data = await apiClient.request<BackupSet>(
        `/api/v1/instances/${instance.id}/backups/${encodeURIComponent(fileName)}`,
        { method: 'DELETE' },
      )
      setSet(data)
      push('备份文件已删除', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '删除失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onClearSet() {
    setBusy(true)
    try {
      await apiClient.request(`/api/v1/instances/${instance.id}/backups`, { method: 'DELETE' })
      setSet({
        instanceId: instance.id,
        sourcePath: instance.workingDirectory,
        files: [],
        totalSize: 0,
      })
      push('备份集已清空', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '清空失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className={`modal-backdrop${open ? '' : ' is-closing'}`}
        onClick={busy ? undefined : onClose}
        onAnimationEnd={(event) => {
          if (!open && event.target === event.currentTarget) onExited()
        }}
      >
        <div
          className="modal-card"
          role="dialog"
          aria-modal="true"
          style={{ maxWidth: 720, width: '94%' }}
          onClick={(event) => event.stopPropagation()}
        >
          <h3 style={{ marginTop: 0 }}>实例备份</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            实例「{instance.name}」· 源目录 {instance.workingDirectory}
          </p>
          <p className="muted" style={{ marginTop: 0 }}>
            备份保存为 tar.gz，位于 data/backupdata/{instance.id}/。恢复会清空工作目录后再解压。
          </p>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <input
                type="checkbox"
                checked={stopInstance}
                onChange={(e) => setStopInstance(e.target.checked)}
                style={{ width: 'auto' }}
                disabled={busy}
              />
              <span>操作前先停止实例（推荐）</span>
            </label>
            <label className="field">
              <span>保留份数</span>
              <input
                type="number"
                min={1}
                max={100}
                value={maxKeep}
                onChange={(e) => setMaxKeep(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                disabled={busy}
              />
            </label>
          </div>

          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void onCreate()}>
              {busy ? '处理中…' : '立即备份'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              刷新
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !set?.files.length}
              onClick={() => setPendingClear(true)}
            >
              清空全部
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              关闭
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            {loading && !set ? (
              <p className="muted">加载中…</p>
            ) : !set?.files.length ? (
              <p className="muted">暂无备份</p>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 8 }}>
                  共 {set.files.length} 份 · {formatBytes(set.totalSize)}
                </p>
                <div className="table">
                  {set.files.map((file) => (
                    <div className="table-row" key={file.fileName}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{file.fileName}</div>
                        <div className="muted">
                          {formatBytes(file.size)} · {new Date(file.modifiedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => setPendingRestore(file.fileName)}
                        >
                          恢复
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy}
                          onClick={() => setPendingDelete(file.fileName)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRestore)}
        title="恢复备份"
        message={
          pendingRestore
            ? `将用「${pendingRestore}」覆盖工作目录全部内容，此操作不可撤销。确定继续？`
            : ''
        }
        confirmText="恢复"
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          const name = pendingRestore
          setPendingRestore(null)
          if (name) void onRestore(name)
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除备份"
        message={pendingDelete ? `确定删除备份「${pendingDelete}」？` : ''}
        confirmText="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const name = pendingDelete
          setPendingDelete(null)
          if (name) void onDeleteFile(name)
        }}
      />

      <ConfirmDialog
        open={pendingClear}
        title="清空备份集"
        message="确定删除该实例下全部备份文件？"
        confirmText="清空"
        onCancel={() => setPendingClear(false)}
        onConfirm={() => {
          setPendingClear(false)
          void onClearSet()
        }}
      />
    </>
  )
}
