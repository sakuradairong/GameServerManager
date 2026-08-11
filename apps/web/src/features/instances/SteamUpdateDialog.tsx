import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { DeploySessionSummary, Instance, SteamUpdateBody } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { useDeploySession } from '../deploy/hooks/useDeploySession'
import { DeployConsole } from '../deploy/components/DeployConsole'
import {
  SteamBranchPicker,
  type SteamBranchSelection,
  type SteamLoginValue,
} from '../steam/SteamBranchPicker'

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
  const [branchSelection, setBranchSelection] = useState<SteamBranchSelection>({
    branch: currentBranch,
    betaPassword: '',
  })
  const [login, setLogin] = useState<SteamLoginValue>({
    anonymous: true,
    steamUsername: '',
    steamPassword: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const status = deploy.session?.status
  const sessionId = deploy.session?.sessionId
  const running = status === 'queued' || status === 'running' || status === 'cancelling'

  useEffect(() => {
    if (!open || running) return
    setBranchSelection({ branch: currentBranch, betaPassword: '' })
    setLogin({ anonymous: true, steamUsername: '', steamPassword: '' })
  }, [currentBranch, instance.id, open, running])

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
    if (!login.anonymous && (!login.steamUsername.trim() || !login.steamPassword)) {
      push('非匿名登录需要填写 Steam 账号和密码', 'error')
      return
    }
    setSubmitting(true)
    try {
      const body: SteamUpdateBody = {
        branch: branchSelection.branch.trim() || 'public',
        ...(branchSelection.betaPassword
          ? { betaPassword: branchSelection.betaPassword }
          : {}),
        anonymous: login.anonymous,
        ...(login.anonymous
          ? {}
          : {
              steamUsername: login.steamUsername.trim(),
              steamPassword: login.steamPassword,
            }),
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
      setBranchSelection((current) => ({ ...current, betaPassword: '' }))
      setLogin((current) => ({ ...current, steamPassword: '' }))
      setSubmitting(false)
    }
  }

  const targetBranch = branchSelection.branch.trim() || 'public'
  const branchChanged = targetBranch !== currentBranch
  const loginReady =
    login.anonymous || Boolean(login.steamUsername.trim() && login.steamPassword)

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
          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
          >
            <input
              type="checkbox"
              checked={login.anonymous}
              onChange={(e) => {
                const anonymous = e.target.checked
                setLogin((current) => ({
                  anonymous,
                  steamUsername: anonymous ? '' : current.steamUsername,
                  steamPassword: anonymous ? '' : current.steamPassword,
                }))
              }}
              style={{ width: 'auto' }}
              disabled={running || submitting}
            />
            <span>匿名登录（免费专用服务端）</span>
          </label>

          {!login.anonymous && (
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label className="field">
                <span>Steam 账号</span>
                <input
                  autoComplete="off"
                  value={login.steamUsername}
                  onChange={(e) =>
                    setLogin((current) => ({
                      ...current,
                      steamUsername: e.target.value,
                    }))
                  }
                  required
                  disabled={running || submitting}
                />
              </label>
              <label className="field">
                <span>Steam 密码</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={login.steamPassword}
                  onChange={(e) =>
                    setLogin((current) => ({
                      ...current,
                      steamPassword: e.target.value,
                    }))
                  }
                  required
                  disabled={running || submitting}
                />
              </label>
            </div>
          )}

          <SteamBranchPicker
            id={`steam-update-branch-${instance.id}`}
            appId={instance.steam?.appId || ''}
            value={branchSelection}
            login={login}
            disabled={running || submitting}
            onChange={setBranchSelection}
          />

          <span className="muted" style={{ display: 'block', marginTop: 8 }}>
            {branchChanged
              ? `将从 ${currentBranch} 切换到 ${targetBranch}`
              : '保持当前分支进行更新'}
          </span>

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
              <button className="btn" type="submit" disabled={submitting || !loginReady}>
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
