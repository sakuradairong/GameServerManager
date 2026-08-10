import { useEffect, useMemo, useState } from 'react'
import type { DeployCapability, DeployPlatform, DeployType } from '@gsm4/shared'
import { apiClient } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { SteamDeployPanel } from './steam/SteamDeployPanel'
import { MinecraftDeployPanel } from './minecraft/MinecraftDeployPanel'
import { ArchiveDeployPanel } from './archive/ArchiveDeployPanel'
import { BedrockDeployPanel } from './bedrock/BedrockDeployPanel'
import { TmodloaderDeployPanel } from './tmodloader/TmodloaderDeployPanel'
import { MrpackDeployPanel } from './mrpack/MrpackDeployPanel'
import { FactorioDeployPanel } from './factorio/FactorioDeployPanel'
import { CloudDeployPanel } from './cloud/CloudDeployPanel'

type CapabilitiesResponse = {
  platform: DeployPlatform
  capabilities: DeployCapability[]
}

export function DeployPage() {
  const { push } = useToast()
  const [capabilities, setCapabilities] = useState<DeployCapability[]>([])
  const [platform, setPlatform] = useState<DeployPlatform | null>(null)
  const [tab, setTab] = useState<DeployType>('archive')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiClient.get<CapabilitiesResponse>('/api/v1/deploy/capabilities')
        if (cancelled) return
        setPlatform(data.platform)
        setCapabilities(data.capabilities)
        const firstAvailable =
          data.capabilities.find((item) => item.available !== false)?.type || 'archive'
        setTab(firstAvailable)
      } catch (error) {
        if (!cancelled) {
          push(error instanceof Error ? error.message : '加载部署能力失败', 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [push])

  const visibleTabs = useMemo(
    () => capabilities.filter((item) => item.available !== false),
    [capabilities],
  )
  const hiddenTabs = useMemo(
    () => capabilities.filter((item) => item.available === false),
    [capabilities],
  )

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">游戏部署</h2>
        <p className="page-desc">
          统一 DeploySession 内核。当前平台：{platform ?? (loading ? '检测中…' : '未知')}。
          标签页由能力表驱动，当前环境不可用的入口会自动隐藏。
        </p>
        {loading ? (
          <p className="muted">正在加载部署能力…</p>
        ) : (
          <div className="deploy-tabs">
            {visibleTabs.map((item) => (
              <button
                key={item.type}
                type="button"
                className={`deploy-tab${tab === item.type ? ' active' : ''}`}
                onClick={() => setTab(item.type)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {hiddenTabs.length > 0 && (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            当前平台不可用：{hiddenTabs.map((item) => item.label).join('、')}
          </p>
        )}
      </div>

      {/* 保持各面板挂载，避免切换时重复请求/闪烁提示 */}
      <div hidden={tab !== 'steamcmd'}>
        <SteamDeployPanel />
      </div>
      <div hidden={tab !== 'minecraft'}>
        <MinecraftDeployPanel />
      </div>
      <div hidden={tab !== 'archive'}>
        <ArchiveDeployPanel />
      </div>
      <div hidden={tab !== 'bedrock'}>
        <BedrockDeployPanel />
      </div>
      <div hidden={tab !== 'tmodloader'}>
        <TmodloaderDeployPanel />
      </div>
      <div hidden={tab !== 'mrpack'}>
        <MrpackDeployPanel />
      </div>
      <div hidden={tab !== 'factorio'}>
        <FactorioDeployPanel />
      </div>
      <div hidden={tab !== 'cloud'}>
        <CloudDeployPanel />
      </div>
    </div>
  )
}
