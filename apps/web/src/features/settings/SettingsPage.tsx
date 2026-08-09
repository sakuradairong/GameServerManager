import { useEffect, useState, type FormEvent } from 'react'
import type { PublicConfig } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { useAuth } from '../../shared/api/AuthContext'

export function SettingsPage() {
  const { push } = useToast()
  const { user, logout } = useAuth()
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [installPath, setInstallPath] = useState('')
  const [steamcmdPath, setSteamcmdPath] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient
      .get<PublicConfig>('/api/v1/config/public')
      .then((data) => {
        setConfig(data)
        setInstallPath(data.game.defaultInstallPath)
        setSteamcmdPath(data.steamcmd.path)
      })
      .catch((error) => push(error instanceof Error ? error.message : '加载失败', 'error'))
  }, [push])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const data = await apiClient.put<PublicConfig>('/api/v1/config/settings', {
        game: { defaultInstallPath: installPath },
        steamcmd: { path: steamcmdPath },
      })
      setConfig(data)
      push('设置已保存', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">设置</h2>
        <p className="page-desc">配置游戏安装根目录与 SteamCMD，保存后立即生效。</p>
      </div>

      <form className="page-card" onSubmit={onSave}>
        <h3 style={{ marginTop: 0 }}>路径</h3>
        <label className="field">
          <span>默认游戏安装目录（文件管理根目录）</span>
          <input value={installPath} onChange={(e) => setInstallPath(e.target.value)} required />
        </label>
        <label className="field">
          <span>SteamCMD 可执行文件路径</span>
          <input
            value={steamcmdPath}
            onChange={(e) => setSteamcmdPath(e.target.value)}
            placeholder="/path/to/steamcmd.sh 或 steamcmd.exe"
          />
        </label>
        <div className="muted" style={{ marginBottom: 12 }}>
          当前端口：{config?.server.port ?? '—'} · SteamCMD：
          {config?.steamcmd.configured ? '已配置' : '未配置'}
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </button>
      </form>

      <div className="page-card">
        <h3 style={{ marginTop: 0 }}>账号</h3>
        <p className="muted">当前用户：{user?.username}（{user?.role}）</p>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          退出登录
        </button>
      </div>
    </div>
  )
}
