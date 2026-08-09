import path from 'node:path'
import { configManager } from '../config/ConfigManager.js'

function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  )
}

export function resolveInstallPath(input: {
  installName: string
  customInstallPath?: string
  allowCustomPath?: boolean
}): string {
  const defaultRoot = path.resolve(configManager.getConfig().game.defaultInstallPath)

  if (input.allowCustomPath && input.customInstallPath) {
    const custom = path.resolve(input.customInstallPath)
    if (custom.split(path.sep).includes('..')) {
      throw Object.assign(new Error('非法自定义路径'), { statusCode: 400 })
    }
    return custom
  }

  const safeName = input.installName.replace(/[<>:"|?*\x00-\x1F]/g, '_').trim()
  if (!safeName || safeName === '.' || safeName === '..') {
    throw Object.assign(new Error('安装目录名无效'), { statusCode: 400 })
  }

  const target = path.resolve(defaultRoot, safeName)
  if (!isPathInside(defaultRoot, target)) {
    throw Object.assign(new Error('安装路径逃逸出默认根目录'), { statusCode: 400 })
  }
  return target
}
