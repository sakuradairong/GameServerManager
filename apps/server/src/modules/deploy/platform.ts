import os from 'node:os'
import type { DeployCapability, DeployPlatform } from '@gsm4/shared'
import { DEPLOY_CAPABILITIES } from '@gsm4/shared'

export function getDeployPlatform(): DeployPlatform {
  const platform = os.platform()
  const arch = os.arch()
  if (platform === 'win32') return 'windows'
  if (arch === 'arm' || arch === 'arm64') return 'linux_arm'
  return 'linux'
}

export function listAvailableCapabilities(): DeployCapability[] {
  const current = getDeployPlatform()
  return DEPLOY_CAPABILITIES.map((item) => ({
    ...item,
    available: item.platforms.includes(current),
  }))
}

export function assertCapabilityAvailable(type: DeployCapability['type']) {
  const item = listAvailableCapabilities().find((entry) => entry.type === type)
  if (!item?.available) {
    throw Object.assign(new Error(`当前平台不支持 ${item?.label || type} 部署`), {
      statusCode: 400,
    })
  }
}
