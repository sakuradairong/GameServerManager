import { useEffect, useState, type FormEvent } from 'react'
import type { SteamGameInfo } from '@gsm4/shared'
import { apiClient, ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySession } from '../hooks/useDeploySession'
import { DeployConsole } from '../components/DeployConsole'

export function SteamDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySession()
  const [games, setGames] = useState<Record<string, SteamGameInfo>>({})
  const [gameKey, setGameKey] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [steamConfigured, setSteamConfigured] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [catalog, config] = await Promise.all([
          apiClient.get<Record<string, SteamGameInfo>>('/api/v1/catalog/steam-games'),
          apiClient.get<{ steamcmd: { configured: boolean } }>('/api/v1/config/public'),
        ])
        setGames(catalog)
        setSteamConfigured(config.steamcmd.configured)
        const first = Object.keys(catalog)[0]
        if (first) {
          setGameKey(first)
          setInstanceName(catalog[first].game_nameCN || first)
        }
      } catch (error) {
        push(error instanceof Error ? error.message : '加载目录失败', 'error')
      }
    })()
  }, [push])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const info = games[gameKey]
    if (!info?.appid) {
      push('请选择有效游戏', 'error')
      return
    }
    try {
      await deploy.start({
        type: 'steamcmd',
        gameKey,
        appId: String(info.appid),
        instanceName: instanceName || info.game_nameCN || gameKey,
        anonymous: info.login_anonymous !== false,
        branch: 'public',
      })
      push('Steam 部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '启动失败', 'error')
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>SteamCMD 部署</h3>
        <p className="page-desc">
          通过统一 DeploySession 调用 steamcmd 执行器。需先在 `config.json` 配置
          `steamcmd.path`。
        </p>
        {!steamConfigured && (
          <p className="error-text">当前未配置 SteamCMD 路径，提交将失败（用于验证错误回滚）。</p>
        )}
        <div className="form-grid">
          <label className="field">
            <span>游戏</span>
            <select value={gameKey} onChange={(e) => setGameKey(e.target.value)} required>
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
            />
          </label>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" type="submit" disabled={deploy.submitting}>
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
