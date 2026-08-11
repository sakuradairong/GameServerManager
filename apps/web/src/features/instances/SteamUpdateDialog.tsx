import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { DeploySessionSummary, Instance, SteamUpdateBody } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { useDeploySession } from '../deploy/hooks/useDeploySession'
import { DeployConsole } from '../deploy/components/DeployConsole'

export function SteamUpdateDialog({
  instance,
  open,
  onClose,
  onExited,
  onUpdated,
}: {
  instance: Instance
  open: boolean
  onClose: () => void
  onExited: () => void
  onUpdated: () => void
}) {
  const { push } = useToast()
  const deploy = useDeploySession()
  const currentBranch = instance.steam?.branch || 'public'
  const [branch, setBranch] = useState(currentBranch)
  const [betaPassword, setBetaPassword] = useState('')
  const [anonymous, setAnonymous] = useState(true)
  const [steamUsername, setSteamUsername] = useState('')
  const [steamPassword, setSteamPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const status = deploy.session?.status
  const sessionId = deploy.session?.sessionId
  const running = status === 'queued' || status === 'running' || status === 'cancelling'

  // 每个会话只处理一次完成事件，避免父级回调标识变化导致的重复提示/刷新
  const handledSessionRef = useRef<string | null>(null)
  useEffect(() => {
    if (status === 'completed' && sessionId && handledSessionRef.current !== sessionId) {
      handledSessionRef.current = sessionId
      push('Steam 更新完成', 'success')
      onUpdated()
    }
  }, [status, sessionId, push, onUpdated])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const body: SteamUpdateBody = {
        branch: branch.trim() || 'public',
        ...(betaPassword ? { betaPassword } : {}),
        anonymous,
        ...(anonymous ? {} : { steamUsername, steamPassword }),
      }
      const session = await apiClient.post<DeploySessionSummary>(
        `/api/v1/instances/${instance.id}/steam/update`,
        body,
      )
      deploy.attach(session)
      push('已开始更新', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '更新失败', 'error')
    } finally {
      setBetaPassword('')
      setSteamPassword('')
      setSubmitting(false)
    }
  }

  const branchChanged = branch.trim() !== currentBranch

  return (
    <div
      className={`modal-backdrop${open ? '' : ' is-closing'}`}
      onClick={running ? undefined : onClose}
      onAnimationEnd={(event) => {
        if (!open && event.target === event.currentTarget) onExited()
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 640, width: '92%' }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Steam 更新 / 分支切换</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          实例「{instance.name}」· appId {instance.steam?.appId} · 当前分支{' '}
          <strong>{currentBranch}</strong>
        </p>

        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>目标分支</span>
              <input
                autoComplete="off"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="public"
              />
              <span className="muted" style={{ marginTop: 6 }}>
                {branchChanged ? `将从 ${currentBranch} 切换到 ${branch.trim() || 'public'}` : '保持当前分支进行更新'}
              </span>
            </label>
            <label className="field">
              <span>分支密码（可选）</span>
              <input
                type="password"
                autoComplete="new-password"
                value={betaPassword}
                onChange={(e) => setBetaPassword(e.target.value)}
                placeholder="私有 beta 分支需要"
              />
            </label>
          </div>

          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
          >
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => {
                const checked = e.target.checked
                setAnonymous(checked)
                if (checked) {
                  setSteamUsername('')
                  setSteamPassword('')
                }
              }}
              style={{ width: 'auto' }}
            />
            <span>匿名登录（免费专用服务端）</span>
          </label>

          {!anonymous && (
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label className="field">
                <span>Steam 账号</span>
                <input
                  autoComplete="off"
                  value={steamUsername}
                  onChange={(e) => setSteamUsername(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Steam 密码</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={steamPassword}
                  onChange={(e) => setSteamPassword(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={running}
            >
              关闭
            </button>
            {running ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deploy.cancel().catch((e) => push(e.message, 'error'))}
              >
                取消更新
              </button>
            ) : (
              <button className="btn" type="submit" disabled={submitting}>
                {submitting ? '提交中…' : branchChanged ? '切换分支并更新' : '开始更新'}
              </button>
            )}
          </div>
        </form>

        <div style={{ marginTop: 16 }}>
          <DeployConsole
            session={deploy.session}
            progress={deploy.progress}
            logs={deploy.logs}
            error={deploy.error}
          />
        </div>
      </div>
    </div>
  )
}
