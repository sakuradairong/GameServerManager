import crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { FileEntry, FileListResult, FileReadResult } from '@gsm4/shared'
import {
  assertNoSymlinkEscape,
  assertSafePathSegment,
  isPathInside,
  resolveRelativePathInside,
} from '../../lib/safePath.js'
import { configManager } from '../config/ConfigManager.js'

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.log',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.properties',
  '.sh',
  '.bat',
  '.cmd',
  '.md',
  '.xml',
  '.csv',
  '.env',
])

export const FILE_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

export class FileService {
  getRoot(): string {
    return path.resolve(configManager.getConfig().game.defaultInstallPath)
  }

  private async resolveSafe(
    relativeOrAbsolute: string,
    options: { followLeaf?: boolean; allowRoot?: boolean } = {},
  ): Promise<string> {
    await this.ensureRoot()
    const root = this.getRoot()
    const target = path.isAbsolute(relativeOrAbsolute)
      ? path.resolve(relativeOrAbsolute)
      : path.resolve(root, relativeOrAbsolute || '.')
    if (!isPathInside(root, target)) {
      throw Object.assign(new Error('路径超出允许的文件根目录'), { statusCode: 403 })
    }
    try {
      await assertNoSymlinkEscape(root, target, options)
    } catch {
      throw Object.assign(new Error('路径通过符号链接超出允许的文件根目录'), {
        statusCode: 403,
      })
    }
    return target
  }

  async ensureRoot() {
    await fs.mkdir(this.getRoot(), { recursive: true })
  }

  async list(relativePath = ''): Promise<FileListResult> {
    await this.ensureRoot()
    const root = this.getRoot()
    const abs = await this.resolveSafe(relativePath || '.')
    const stat = await fs.stat(abs)
    if (!stat.isDirectory()) {
      throw Object.assign(new Error('目标不是目录'), { statusCode: 400 })
    }

    const names = await fs.readdir(abs)
    const entries: FileEntry[] = []
    for (const name of names) {
      const full = path.join(abs, name)
      try {
        await assertNoSymlinkEscape(root, full)
        const itemStat = await fs.stat(full)
        entries.push({
          name,
          path: path.relative(root, full).split(path.sep).join('/'),
          isDirectory: itemStat.isDirectory(),
          size: itemStat.isFile() ? itemStat.size : undefined,
          modifiedAt: itemStat.mtime.toISOString(),
        })
      } catch {
        // skip inaccessible
      }
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return {
      root,
      path: path.relative(root, abs).split(path.sep).join('/') || '',
      entries,
    }
  }

  async read(relativePath: string): Promise<FileReadResult> {
    const abs = await this.resolveSafe(relativePath)
    const stat = await fs.stat(abs)
    if (!stat.isFile()) {
      throw Object.assign(new Error('只能读取文件'), { statusCode: 400 })
    }
    if (stat.size > 2 * 1024 * 1024) {
      throw Object.assign(new Error('文件超过 2MB，请用本机编辑器打开'), { statusCode: 400 })
    }
    const ext = path.extname(abs).toLowerCase()
    if (ext && !TEXT_EXTENSIONS.has(ext)) {
      // still allow no-extension and known text; for unknown small files try utf8
    }
    const content = await fs.readFile(abs, 'utf8')
    return {
      path: relativePath,
      content,
      size: stat.size,
    }
  }

  async write(relativePath: string, content: string) {
    const abs = await this.resolveSafe(relativePath)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
  }

  async mkdir(relativePath: string) {
    const abs = await this.resolveSafe(relativePath)
    await fs.mkdir(abs, { recursive: true })
  }

  async remove(relativePath: string) {
    const abs = await this.resolveSafe(relativePath, { followLeaf: false })
    const root = this.getRoot()
    if (abs === root) {
      throw Object.assign(new Error('不能删除文件根目录'), { statusCode: 400 })
    }
    await fs.rm(abs, { recursive: true, force: true })
  }

  async saveUpload(relativeDir: string, fileName: string, source: Readable) {
    const basename = path.win32.basename(path.posix.basename(fileName))
    let safeName: string
    try {
      safeName = assertSafePathSegment(basename, '文件名')
    } catch {
      throw Object.assign(new Error('文件名无效'), { statusCode: 400 })
    }
    const absDir = await this.resolveSafe(relativeDir || '.')
    await fs.mkdir(absDir, { recursive: true })
    let abs: string
    try {
      abs = resolveRelativePathInside(absDir, safeName, {
        allowRoot: false,
        singleSegment: true,
      })
      await assertNoSymlinkEscape(this.getRoot(), abs)
    } catch {
      throw Object.assign(new Error('上传路径非法'), { statusCode: 403 })
    }
    const partialPath = path.join(
      path.dirname(abs),
      `.${path.basename(abs)}.${crypto.randomUUID()}.part`,
    )
    try {
      await pipeline(source, createWriteStream(partialPath, { mode: 0o600 }))
      const stat = await fs.stat(partialPath)
      if (stat.size > FILE_UPLOAD_LIMIT_BYTES) {
        throw Object.assign(new Error('上传文件超过 100MB 限制'), { statusCode: 413 })
      }
      await fs.rename(partialPath, abs)
      return {
        path: path.relative(this.getRoot(), abs).split(path.sep).join('/'),
        size: stat.size,
      }
    } finally {
      await fs.rm(partialPath, { force: true }).catch(() => undefined)
    }
  }
}

export const fileService = new FileService()
