import path from 'node:path'
import {
  assertSafePathSegment,
  isPathInside,
  pathsOverlap,
  resolveRelativePathInside,
} from '../../lib/safePath.js'
import { configManager } from '../config/ConfigManager.js'

export function resolveInstallPath(input: {
  installName: string
  customInstallPath?: string
  allowCustomPath?: boolean
}): string {
  const defaultRoot = path.resolve(configManager.getConfig().game.defaultInstallPath)

  if (input.allowCustomPath && input.customInstallPath) {
    const rawCustomPath = input.customInstallPath.trim()
    if (!path.isAbsolute(rawCustomPath)) {
      throw Object.assign(new Error('自定义安装路径必须是绝对路径'), { statusCode: 400 })
    }

    const custom = path.resolve(rawCustomPath)
    const filesystemRoot = path.parse(custom).root
    const dataDir = path.resolve(configManager.getDataDir())
    const customContainsDefaultRoot = isPathInside(custom, defaultRoot)
    if (
      custom === filesystemRoot ||
      pathsOverlap(custom, dataDir) ||
      customContainsDefaultRoot
    ) {
      throw Object.assign(new Error('自定义安装路径指向受保护或危险目录'), {
        statusCode: 400,
      })
    }
    return custom
  }

  let safeName: string
  try {
    safeName = assertSafePathSegment(input.installName, '安装目录名')
  } catch (error) {
    throw Object.assign(new Error('安装目录名无效'), { statusCode: 400 })
  }

  try {
    return resolveRelativePathInside(defaultRoot, safeName, {
      allowRoot: false,
      singleSegment: true,
    })
  } catch {
    throw Object.assign(new Error('安装路径逃逸出默认根目录'), { statusCode: 400 })
  }
}
