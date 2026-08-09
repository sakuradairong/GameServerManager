import { useEffect, useState } from 'react'
import { ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { useSteamcmdInstall } from './useSteamcmdInstall'

interface SteamcmdInstallCardProps {
  /** 本次一键安装成功后回调 */
  onInstalled?: (executablePath: string) => void
  compact?: boolean
}

export function SteamcmdInstallCard({ onInstalled, compact = false }: SteamcmdInstallCardProps) {
  const { push } = useToast()
  const { status, loading, installing, progress, statusMessage, install, refresh } =
    useSteamcmdInstall({
      onInstalled: (executablePath) => {
        push('SteamCMD 安装完成', 'success')
        onInstalled?.(executablePath)
      },
    })
  const [customPath, setCustomPath] = useState('')

  useEffect(() => {
    if (status?.defaultInstallPath && !customPath) {
      setCustomPath(status.defaultInstallPath)
    }
  }, [status?.defaultInstallPath, customPath])

  async function handleInstall() {
    try {
      await install(customPath.trim() || undefined)
      push('已开始一键安装 SteamCMD', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '启动安装失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className={compact ? undefined : 'page-card'}>
        <p className="muted">正在检查 SteamCMD 状态…</p>
      </div>
    )
  }

  const supported = status?.supported !== false
  const installed = Boolean(status?.isInstalled)

  return (
    <div className={compact ? 'stack' : 'page-card'} style={compact ? { gap: 10 } : undefined}>
      {!compact && <h3 style={{ marginTop: 0 }}>SteamCMD 一键安装</h3>}
      <p className="page-desc" style={{ marginTop: compact ? 0 : undefined }}>
        从 Steam CDN 下载官方包并解压到本地，完成后自动写入可执行文件路径。
      </p>

      {installed && !installing && (
        <p className="muted">已安装：{status?.executablePath || '未知路径'}</p>
      )}

      {!supported && (
        <p className="warn-text">
          {status?.unsupportedReason || '当前平台不支持一键安装，请手动填写路径。'}
        </p>
      )}

      {supported && (
        <>
          <label className="field">
            <span>安装目录</span>
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              disabled={installing}
              placeholder={status?.defaultInstallPath || 'data/steamcmd'}
            />
          </label>

          {(installing || (statusMessage && progress > 0)) && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
              <div className="muted">
                {statusMessage || '安装中…'} {installing ? `(${progress}%)` : ''}
              </div>
            </div>
          )}

          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn"
              disabled={installing || !customPath.trim()}
              onClick={() => void handleInstall()}
            >
              {installing ? '安装中…' : installed ? '重新一键安装' : '一键安装 SteamCMD'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={installing}
              onClick={() => {
                void refresh()
                  .then(() => push('已刷新 SteamCMD 状态', 'success'))
                  .catch((error) =>
                    push(error instanceof Error ? error.message : '刷新失败', 'error'),
                  )
              }}
            >
              刷新状态
            </button>
          </div>
        </>
      )}
    </div>
  )
}
