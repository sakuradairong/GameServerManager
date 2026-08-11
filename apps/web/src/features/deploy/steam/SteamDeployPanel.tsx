import { useEffect, useState, type FormEvent } from 'react'
import type { SteamGameInfo } from '@gsm4/shared'
import { apiClient, ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySession } from '../hooks/useDeploySession'
import { DeployConsole } from '../components/DeployConsole'
import { SteamcmdInstallCard } from '../../settings/SteamcmdInstallCard'
import {
  SteamBranchPicker,
  type SteamBranchSelection,
  type SteamLoginValue,
} from '../../steam/SteamBranchPicker'

export function SteamDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySession()
  const [games, setGames] = useState<Record<string, SteamGameInfo>>({})
  const [gameKey, setGameKey] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [branchSelection, setBranchSelection] = useState<SteamBranchSelection>({
    branch: 'public',
    betaPassword: '',
  })
  const [login, setLogin] = useState<SteamLoginValue>({
    anonymous: true,
    steamUsername: '',
    steamPassword: '',
  })
  const [steamConfigured, setSteamConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [catalog, config] = await Promise.all([
          apiClient.get<Record<string, SteamGameInfo>>('/api/v1/catalog/steam-games'),
          apiClient.get<{ steamcmd: { configured: boolean } }>('/api/v1/config/public'),
        ])
        if (cancelled) return
        setGames(catalog)
        setSteamConfigured(config.steamcmd.configured)
        const first = Object.keys(catalog)[0]
        if (first) {
          setGameKey(first)
          setInstanceName(catalog[first].game_nameCN || first)
          setLogin((current) => ({
            ...current,
            anonymous: catalog[first].login_anonymous !== false,
          }))
        }
      } catch (error) {
        if (!cancelled) {
          push(error instanceof Error ? error.message : '加载目录失败', 'error')
          setSteamConfigured(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [push])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const info = games[gameKey]
    if (!info?.appid) {
      push('请选择有效游戏', 'error')
      return
    }
    if (!login.anonymous && (!login.steamUsername.trim() || !login.steamPassword)) {
      push('非匿名登录需要填写 Steam 账号和密码', 'error')
      return
    }
    try {
      await deploy.start({
        type: 'steamcmd',
        gameKey,
        appId: String(info.appid),
        instanceName: instanceName || info.game_nameCN || gameKey,
        anonymous: login.anonymous,
        branch: branchSelection.branch.trim() || 'public',
        ...(branchSelection.betaPassword
          ? { betaPassword: branchSelection.betaPassword }
          : {}),
        ...(login.anonymous
          ? {}
          : {
              steamUsername: login.steamUsername.trim(),
              steamPassword: login.steamPassword,
            }),
      })
      push('Steam 部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '启动失败', 'error')
    } finally {
      setBranchSelection((current) => ({ ...current, betaPassword: '' }))
      setLogin((current) => ({ ...current, steamPassword: '' }))
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>SteamCMD 部署</h3>
        <p className="page-desc">
          通过统一 DeploySession 调用 steamcmd 执行器。未安装时可直接一键安装。
        </p>
        {loading && <p className="muted">正在加载 Steam 目录与配置…</p>}
        {!loading && steamConfigured === false && (
          <div style={{ marginBottom: 16 }}>
            <p className="warn-text">尚未配置 SteamCMD，请先一键安装或到「设置」手动填写路径。</p>
            <SteamcmdInstallCard
              compact
              onInstalled={() => {
                setSteamConfigured(true)
              }}
            />
          </div>
        )}
        <div className="form-grid">
          <label className="field">
            <span>游戏</span>
            <select
              value={gameKey}
              onChange={(e) => {
                const nextKey = e.target.value
                const nextGame = games[nextKey]
                setGameKey(nextKey)
                setInstanceName(nextGame?.game_nameCN || nextKey)
                setBranchSelection({ branch: 'public', betaPassword: '' })
                setLogin({
                  anonymous: nextGame?.login_anonymous !== false,
                  steamUsername: '',
                  steamPassword: '',
                })
              }}
              required
              disabled={loading}
            >
              {Object.entries(games).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.game_nameCN || key} ({info.appid})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>实例名</span>
            <input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              required
              disabled={loading}
            />
          </label>
        </div>

        <label
          className="field"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
        >
          <input
            type="checkbox"
            checked={login.anonymous}
            onChange={(event) => {
              const anonymous = event.target.checked
              setLogin((current) => ({
                anonymous,
                steamUsername: anonymous ? '' : current.steamUsername,
                steamPassword: anonymous ? '' : current.steamPassword,
              }))
            }}
            style={{ width: 'auto' }}
            disabled={loading || deploy.submitting}
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
                onChange={(event) =>
                  setLogin((current) => ({
                    ...current,
                    steamUsername: event.target.value,
                  }))
                }
                required
                disabled={loading || deploy.submitting}
              />
            </label>
            <label className="field">
              <span>Steam 密码</span>
              <input
                type="password"
                autoComplete="new-password"
                value={login.steamPassword}
                onChange={(event) =>
                  setLogin((current) => ({
                    ...current,
                    steamPassword: event.target.value,
                  }))
                }
                required
                disabled={loading || deploy.submitting}
              />
            </label>
          </div>
        )}

        <SteamBranchPicker
          id="steam-deploy-branch"
          appId={games[gameKey]?.appid ? String(games[gameKey].appid) : ''}
          value={branchSelection}
          login={login}
          disabled={loading || deploy.submitting || steamConfigured === false}
          onChange={setBranchSelection}
        />

        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button
            className="btn"
            type="submit"
            disabled={deploy.submitting || loading || steamConfigured === false}
          >
            {deploy.submitting ? '提交中…' : '开始部署'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!deploy.session}
            onClick={() => deploy.cancel().catch((e) => push(e.message, 'error'))}
          >
            取消
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loading}
            onClick={async () => {
              try {
                const result = await apiClient.post<{ count: number }>(
                  '/api/v1/catalog/steam-games/sync',
                  {},
                )
                const catalog = await apiClient.get<Record<string, SteamGameInfo>>(
                  '/api/v1/catalog/steam-games',
                )
                setGames(catalog)
                push(`已同步 ${result.count} 个游戏`, 'success')
              } catch (error) {
                push(error instanceof ApiError ? error.message : '同步失败', 'error')
              }
            }}
          >
            同步远程目录
          </button>
        </div>
      </form>
      <DeployConsole
        session={deploy.session}
        progress={deploy.progress}
        logs={deploy.logs}
        error={deploy.error}
      />
    </div>
  )
}
