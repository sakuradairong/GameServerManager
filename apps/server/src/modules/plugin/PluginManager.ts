import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  PluginManifestSchema,
  type PluginInfo,
  type PluginIssue,
  type PluginListResult,
  type PluginManifest,
} from '@gsm4/shared'
import { configManager } from '../config/ConfigManager.js'
import { writeJsonAtomic } from '../../lib/atomicJson.js'
import {
  assertNoSymlinkEscape,
  assertSafePathSegment,
  resolveRelativePathInside,
} from '../../lib/safePath.js'
import {
  OFFICIAL_EXAMPLE_HTML,
  OFFICIAL_EXAMPLE_MANIFEST,
  OFFICIAL_EXAMPLE_PLUGIN_NAME,
} from './examplePlugin.js'

const MAX_MANIFEST_BYTES = 128 * 1024
const WEB_ASSET_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
])

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

type PluginRecord = {
  directory: string
  manifest: PluginManifest
  info: PluginInfo
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode })
}

function normalizedEntryPoint(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = normalized.split('/').filter(Boolean)
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))
  ) {
    throw httpError(400, '插件入口路径无效')
  }
  return segments.join('/')
}

async function requireStat(target: string, statusCode: number, missingMessage: string) {
  try {
    return await fs.stat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw httpError(statusCode, missingMessage)
    }
    throw error
  }
}

async function removeTemporaryDirectory(target: string): Promise<void> {
  try {
    await fs.rm(target, { recursive: true, force: true })
  } catch {
    // Best effort cleanup; preserve the original install error.
  }
}

export class PluginManager {
  private pluginsDir = ''
  private readonly plugins = new Map<string, PluginRecord>()
  private issues: PluginIssue[] = []

  async init(): Promise<void> {
    this.pluginsDir = path.join(configManager.getDataDir(), 'plugins')
    await fs.mkdir(this.pluginsDir, { recursive: true })
    await this.refresh()
  }

  async refresh(): Promise<PluginListResult> {
    if (!this.pluginsDir) throw new Error('PluginManager 未初始化')
    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true })
    const next = new Map<string, PluginRecord>()
    const issues: PluginIssue[] = []

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue
      try {
        const record = await this.loadPlugin(entry.name)
        next.set(record.info.name, record)
      } catch (error) {
        issues.push({
          directory: entry.name,
          message: error instanceof Error ? error.message : '插件清单读取失败',
        })
      }
    }

    this.plugins.clear()
    for (const [name, record] of next) this.plugins.set(name, record)
    this.issues = issues
    return this.list()
  }

  list(): PluginListResult {
    return {
      plugins: [...this.plugins.values()]
        .map((record) => ({ ...record.info }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN')),
      issues: this.issues.map((issue) => ({ ...issue })),
    }
  }

  async setEnabled(name: string, enabled: boolean): Promise<PluginInfo> {
    const record = this.requirePlugin(name)
    if (enabled && record.info.hasWebInterface && !record.info.webAvailable) {
      throw httpError(400, record.info.warning || '插件 Web 入口不可用')
    }
    await writeJsonAtomic(path.join(record.directory, 'plugin.json'), {
      ...record.manifest,
      enabled,
    })
    await this.refresh()
    return { ...this.requirePlugin(name).info }
  }

  async installOfficialExample(): Promise<PluginInfo> {
    const target = path.join(this.pluginsDir, OFFICIAL_EXAMPLE_PLUGIN_NAME)
    try {
      await fs.lstat(target)
      throw httpError(409, '官方示例插件已经安装')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const temporary = path.join(
      this.pluginsDir,
      `.${OFFICIAL_EXAMPLE_PLUGIN_NAME}.${crypto.randomUUID()}.tmp`,
    )
    try {
      await fs.mkdir(temporary, { recursive: false })
      await writeJsonAtomic(path.join(temporary, 'plugin.json'), OFFICIAL_EXAMPLE_MANIFEST)
      await fs.writeFile(path.join(temporary, 'index.html'), OFFICIAL_EXAMPLE_HTML, {
        encoding: 'utf8',
        mode: 0o600,
      })
      await fs.rename(temporary, target)
    } finally {
      await removeTemporaryDirectory(temporary)
    }

    await this.refresh()
    return { ...this.requirePlugin(OFFICIAL_EXAMPLE_PLUGIN_NAME).info }
  }

  async remove(name: string): Promise<void> {
    const record = this.requirePlugin(name)
    await assertNoSymlinkEscape(this.pluginsDir, record.directory)
    await fs.rm(record.directory, { recursive: true, force: false })
    await this.refresh()
  }

  async resolveWebAsset(
    name: string,
    requestedPath?: string,
  ): Promise<{ path: string; contentType: string; cacheControl: string }> {
    const record = this.requirePlugin(name)
    if (!record.info.enabled) throw httpError(404, '插件未启用')
    if (!record.info.hasWebInterface || !record.info.webAvailable) {
      throw httpError(404, '插件没有可用的 Web 界面')
    }

    const relativePath = normalizedEntryPoint(requestedPath || record.info.entryPoint)
    const extension = path.extname(relativePath).toLowerCase()
    if (!WEB_ASSET_EXTENSIONS.has(extension)) {
      throw httpError(403, '不允许通过插件界面读取此类文件')
    }
    const target = resolveRelativePathInside(record.directory, relativePath)
    await assertNoSymlinkEscape(record.directory, target)
    const stat = await requireStat(target, 404, '插件资源不存在')
    if (!stat.isFile()) throw httpError(404, '插件资源不存在')

    return {
      path: target,
      contentType: CONTENT_TYPES[extension] || 'application/octet-stream',
      cacheControl: extension === '.html' ? 'no-store' : 'private, max-age=300',
    }
  }

  private async loadPlugin(directoryName: string): Promise<PluginRecord> {
    const safeDirectoryName = assertSafePathSegment(directoryName, '插件目录名')
    const directory = path.join(this.pluginsDir, safeDirectoryName)
    const manifestPath = path.join(directory, 'plugin.json')
    await assertNoSymlinkEscape(this.pluginsDir, manifestPath)
    const stat = await requireStat(manifestPath, 400, '缺少 plugin.json')
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
      throw httpError(400, 'plugin.json 无效或过大')
    }

    let raw: unknown
    try {
      raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    } catch {
      throw httpError(400, 'plugin.json 不是有效 JSON')
    }
    const parsed = PluginManifestSchema.safeParse(raw)
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues[0]?.message || 'plugin.json 字段无效')
    }
    if (parsed.data.name !== safeDirectoryName) {
      throw httpError(400, 'plugin.json 的 name 必须与目录名一致')
    }

    const entryPoint = normalizedEntryPoint(parsed.data.entryPoint)
    let webAvailable = false
    let warning: string | null = null
    if (parsed.data.hasWebInterface) {
      const entryPath = resolveRelativePathInside(directory, entryPoint)
      try {
        await assertNoSymlinkEscape(directory, entryPath)
        const entryStat = await fs.stat(entryPath)
        webAvailable = entryStat.isFile() && path.extname(entryPath).toLowerCase() === '.html'
        if (!webAvailable) warning = 'Web 入口必须是 HTML 文件'
      } catch {
        warning = '找不到插件 Web 入口文件'
      }
    }

    const manifest = { ...parsed.data, entryPoint }
    return {
      directory,
      manifest,
      info: {
        name: manifest.name,
        displayName: manifest.displayName,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
        enabled: manifest.enabled,
        hasWebInterface: manifest.hasWebInterface,
        entryPoint: manifest.entryPoint,
        icon: manifest.icon,
        category: manifest.category,
        apiVersion: manifest.apiVersion,
        source: manifest.name === OFFICIAL_EXAMPLE_PLUGIN_NAME ? 'official' : 'local',
        webAvailable,
        warning,
      },
    }
  }

  private requirePlugin(name: string): PluginRecord {
    const safeName = assertSafePathSegment(name, '插件标识')
    const plugin = this.plugins.get(safeName)
    if (!plugin) throw httpError(404, '插件不存在')
    return plugin
  }
}

export const pluginManager = new PluginManager()
