import { useEffect, useMemo, useRef, useState } from 'react'
import type { SteamBranchInfo, SteamBranchQueryBody } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'

export type SteamBranchSelection = {
  branch: string
  betaPassword: string
}

export type SteamLoginValue = {
  anonymous: boolean
  steamUsername: string
  steamPassword: string
}

export function SteamBranchPicker({
  id,
  appId,
  value,
  login,
  disabled = false,
  onChange,
}: {
  id: string
  appId: string
  value: SteamBranchSelection
  login: SteamLoginValue
  disabled?: boolean
  onChange: (value: SteamBranchSelection) => void
}) {
  const [branches, setBranches] = useState<SteamBranchInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queried, setQueried] = useState(false)
  const requestIdRef = useRef(0)

  const normalizedBranch = value.branch.trim() || 'public'
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.name === normalizedBranch),
    [branches, normalizedBranch],
  )
  const credentialsReady =
    login.anonymous || Boolean(login.steamUsername.trim() && login.steamPassword)
  const queryDisabled = disabled || loading || !appId.trim() || !credentialsReady

  useEffect(() => {
    requestIdRef.current += 1
    setBranches([])
    setError('')
    setQueried(false)
  }, [appId, login.anonymous, login.steamPassword, login.steamUsername])

  async function loadBranches() {
    if (queryDisabled) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError('')
    try {
      const body: SteamBranchQueryBody = {
        forceRefresh: queried,
        ...(login.anonymous
          ? {}
          : {
              steamUsername: login.steamUsername.trim(),
              steamPassword: login.steamPassword,
            }),
      }
      const result = await apiClient.post<SteamBranchInfo[]>(
        `/api/v1/steamcmd/apps/${encodeURIComponent(appId.trim())}/branches`,
        body,
      )
      if (requestIdRef.current !== requestId) return
      setBranches(result)
      setQueried(true)
      if (!result.some((branch) => branch.name === normalizedBranch)) {
        setError('当前输入的分支未出现在可见列表中，仍可按已知名称继续使用')
      }
    } catch (queryError) {
      if (requestIdRef.current !== requestId) return
      setBranches([])
      setQueried(true)
      setError(
        queryError instanceof ApiError ? queryError.message : 'Steam 分支查询失败',
      )
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }

  const status = loading
    ? '正在通过 SteamCMD 查询可见分支…'
    : !credentialsReady
      ? '请先填写 Steam 账号和密码，再查询该账号可见的分支'
      : error
        ? `${error}。也可以直接输入已知分支名称`
        : branches.length > 0
          ? `已查询到 ${branches.length} 个可见分支；未公开分支仍可手动输入`
          : '可查询 SteamCMD 可见分支，或直接输入 public / beta 分支名称'

  return (
    <div className="steam-branch-picker">
      <div className="steam-branch-input-row">
        <label className="field steam-branch-input">
          <span>目标分支</span>
          <input
            id={id}
            autoComplete="off"
            value={value.branch}
            onChange={(event) => {
              const branch = event.target.value
              onChange({
                branch,
                betaPassword: branch.trim() === 'public' ? '' : value.betaPassword,
              })
            }}
            placeholder="public"
            required
            disabled={disabled}
            aria-describedby={`${id}-status`}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost steam-branch-query-button"
          disabled={queryDisabled}
          onClick={() => void loadBranches()}
        >
          {loading ? '查询中…' : queried ? '重新查询' : '查询分支'}
        </button>
      </div>

      {branches.length > 0 && (
        <label className="field">
          <span>可见分支</span>
          <select
            value={branches.some((branch) => branch.name === normalizedBranch) ? normalizedBranch : ''}
            onChange={(event) => {
              if (!event.target.value) return
              onChange({
                branch: event.target.value,
                betaPassword:
                  event.target.value === 'public' ? '' : value.betaPassword,
              })
            }}
            disabled={disabled}
          >
            <option value="">选择已查询到的分支</option>
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
                {branch.isDefault ? ' · 默认' : ''}
                {branch.requiresPassword ? ' · 需密码' : ''}
                {branch.description && branch.description !== branch.name
                  ? ` · ${branch.description}`
                  : ''}
                {branch.buildId ? ` · Build ${branch.buildId}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <span
        id={`${id}-status`}
        className={error ? 'steam-branch-status warn-text' : 'steam-branch-status muted'}
        aria-live="polite"
      >
        {status}
      </span>

      {normalizedBranch !== 'public' && (
        <label className="field">
          <span>
            分支密码
            {selectedBranch?.requiresPassword ? '（必填）' : '（可选）'}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={value.betaPassword}
            onChange={(event) =>
              onChange({ ...value, betaPassword: event.target.value })
            }
            placeholder="受密码保护的 beta 分支需要"
            required={selectedBranch?.requiresPassword === true}
            disabled={disabled}
          />
        </label>
      )}
    </div>
  )
}
