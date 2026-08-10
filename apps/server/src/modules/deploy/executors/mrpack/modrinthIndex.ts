import type { MrpackLoader } from '@gsm4/shared'

export interface ModrinthFileHashes {
  sha1?: string
  sha512?: string
}

export interface ModrinthFile {
  path: string
  hashes: ModrinthFileHashes
  env?: {
    client?: string
    server?: string
  }
  downloads: string[]
  fileSize?: number
}

export interface ModrinthIndex {
  formatVersion: number
  game: string
  versionId?: string
  name?: string
  summary?: string
  files: ModrinthFile[]
  dependencies: Record<string, string>
}

/**
 * 解析并校验 modrinth.index.json 的关键字段。
 * 只做形状校验，不做业务默认值填充。
 */
export function parseModrinthIndex(raw: string): ModrinthIndex {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new Error(`modrinth.index.json 解析失败: ${(error as Error).message}`)
  }

  if (!data || typeof data !== 'object') {
    throw new Error('modrinth.index.json 内容无效')
  }

  const index = data as Partial<ModrinthIndex>
  if (index.game && index.game !== 'minecraft') {
    throw new Error(`不支持的整合包游戏类型: ${index.game}`)
  }
  if (!Array.isArray(index.files)) {
    throw new Error('modrinth.index.json 缺少 files 数组')
  }
  if (!index.dependencies || typeof index.dependencies !== 'object') {
    throw new Error('modrinth.index.json 缺少 dependencies')
  }

  return {
    formatVersion: index.formatVersion ?? 1,
    game: index.game ?? 'minecraft',
    versionId: index.versionId,
    name: index.name,
    summary: index.summary,
    files: index.files as ModrinthFile[],
    dependencies: index.dependencies as Record<string, string>,
  }
}

/**
 * 依据 dependencies 推断加载器类型与版本。
 * mrpack 约定：dependencies 含 minecraft，以及 fabric-loader / quilt-loader / forge / neoforge 之一。
 */
export function detectLoader(
  dependencies: Record<string, string>,
): { loader: MrpackLoader; version?: string } {
  if (dependencies.neoforge) return { loader: 'neoforge', version: dependencies.neoforge }
  if (dependencies.forge) return { loader: 'forge', version: dependencies.forge }
  if (dependencies['quilt-loader']) return { loader: 'quilt', version: dependencies['quilt-loader'] }
  if (dependencies['fabric-loader']) return { loader: 'fabric', version: dependencies['fabric-loader'] }
  // 未显式声明时默认按 fabric 处理（最常见）
  return { loader: 'fabric' }
}

/** 判断某个文件在服务端是否需要（env.server === 'unsupported' 则跳过） */
export function isServerFile(file: ModrinthFile): boolean {
  return file.env?.server !== 'unsupported'
}
