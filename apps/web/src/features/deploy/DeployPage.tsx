import { useState } from 'react'
import { SteamDeployPanel } from './steam/SteamDeployPanel'
import { MinecraftDeployPanel } from './minecraft/MinecraftDeployPanel'
import { ArchiveDeployPanel } from './archive/ArchiveDeployPanel'

const tabs = [
  { id: 'steamcmd', label: 'SteamCMD' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'archive', label: '文件归档' },
] as const

type TabId = (typeof tabs)[number]['id']

export function DeployPage() {
  const [tab, setTab] = useState<TabId>('archive')

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">游戏部署</h2>
        <p className="page-desc">
          M2 统一 DeploySession 内核：校验 → 会话 → 执行器 → 进度总线 → 实例提交/回滚。
        </p>
        <div className="deploy-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`deploy-tab${tab === item.id ? ' active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
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
    </div>
  )
}
