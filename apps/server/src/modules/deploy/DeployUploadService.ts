import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  DeployUploadResultSchema,
  type DeployUploadKind,
  type DeployUploadResult,
} from '@gsm4/shared'
import { writeJsonAtomic } from '../../lib/atomicJson.js'
import { assertSafePathSegment, resolveRelativePathInside } from '../../lib/safePath.js'
import { configManager } from '../config/ConfigManager.js'

interface StoredUpload extends DeployUploadResult {
  absolutePath: string
}

export const DEPLOY_UPLOAD_FILE_LIMIT_BYTES = 512 * 1024 * 1024
const DEPLOY_UPLOAD_TOTAL_QUOTA_BYTES = 2 * 1024 * 1024 * 1024
const DEPLOY_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000
const METADATA_FILE = 'upload.json'

const ALLOWED_EXT: Record<DeployUploadKind, Set<string>> = {
  minecraft: new Set(['.jar']),
  archive: new Set(['.zip']),
  mrpack: new Set(['.mrpack', '.zip']),
}

const EXT_ERROR: Record<DeployUploadKind, string> = {
  minecraft: '仅支持上传 .jar 文件',
  archive: '仅支持上传 .zip 文件',
  mrpack: '仅支持上传 .mrpack 文件',
}

function publicResult(stored: StoredUpload): DeployUploadResult {
  const { absolutePath: _absolutePath, ...result } = stored
  return result
}

export class DeployUploadService {
  private uploads = new Map<string, StoredUpload>()
  private initPromise?: Promise<void>
  private saveQueue: Promise<void> = Promise.resolve()

  private rootDir() {
    return path.join(configManager.getDataDir(), 'tmp', 'deploy-uploads')
  }

  private assertUploadId(uploadId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(uploadId)) {
      throw Object.assign(new Error('uploadId 格式无效'), { statusCode: 400 })
    }
  }

  private isExpired(stored: DeployUploadResult): boolean {
    const createdAt = Date.parse(stored.createdAt)
    return !Number.isFinite(createdAt) || Date.now() - createdAt > DEPLOY_UPLOAD_TTL_MS
  }

  private async loadOne(uploadId: string): Promise<StoredUpload> {
    this.assertUploadId(uploadId)
    const dir = path.join(this.rootDir(), uploadId)
    let rawMetadata: unknown
    try {
      rawMetadata = JSON.parse(await fs.readFile(path.join(dir, METADATA_FILE), 'utf8'))
    } catch {
      throw new Error('上传元数据无效')
    }
    const metadata = DeployUploadResultSchema.parse(rawMetadata)
    if (metadata.uploadId !== uploadId) throw new Error('上传元数据不匹配')

    const safeName = assertSafePathSegment(metadata.fileName, '文件名')
    const absolutePath = resolveRelativePathInside(dir, safeName, {
      allowRoot: false,
      singleSegment: true,
    })
    const stat = await fs.lstat(absolutePath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== metadata.size) {
      throw new Error('上传文件状态无效')
    }

    const ext = path.extname(safeName).toLowerCase()
    if (!ALLOWED_EXT[metadata.kind].has(ext)) throw new Error('上传文件扩展名无效')

    return { ...metadata, absolutePath }
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      await fs.mkdir(this.rootDir(), { recursive: true })
      const entries = await fs.readdir(this.rootDir(), { withFileTypes: true })
      for (const entry of entries) {
        const candidate = path.join(this.rootDir(), entry.name)
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          await fs.rm(candidate, { recursive: true, force: true }).catch(() => undefined)
          continue
        }
        try {
          const stored = await this.loadOne(entry.name)
          if (this.isExpired(stored)) {
            await fs.rm(candidate, { recursive: true, force: true })
          } else {
            this.uploads.set(stored.uploadId, stored)
          }
        } catch {
          await fs.rm(candidate, { recursive: true, force: true }).catch(() => undefined)
        }
      }
    })()
    return this.initPromise
  }

  private async cleanupExpired(): Promise<void> {
    for (const [uploadId, stored] of this.uploads) {
      if (this.isExpired(stored)) await this.cleanup(uploadId)
    }
  }

  private totalStoredBytes(): number {
    let total = 0
    for (const stored of this.uploads.values()) total += stored.size
    return total
  }

  async save(
    kind: DeployUploadKind,
    fileName: string,
    source: Readable,
  ): Promise<DeployUploadResult> {
    const run = this.saveQueue.then(async () => {
      await this.init()
      await this.cleanupExpired()

      const basename = path.win32.basename(path.posix.basename(fileName))
      const sanitized = basename.replace(/[<>:"|?*\x00-\x1F]/gu, '_')
      let safeName: string
      try {
        safeName = assertSafePathSegment(sanitized, '文件名')
      } catch {
        throw Object.assign(new Error('文件名无效'), { statusCode: 400 })
      }

      const ext = path.extname(safeName).toLowerCase()
      if (!ALLOWED_EXT[kind].has(ext)) {
        throw Object.assign(new Error(EXT_ERROR[kind]), { statusCode: 400 })
      }
      if (this.totalStoredBytes() >= DEPLOY_UPLOAD_TOTAL_QUOTA_BYTES) {
        throw Object.assign(new Error('部署上传临时目录已达到 2GB 配额'), { statusCode: 507 })
      }

      const uploadId = crypto.randomUUID()
      const dir = path.join(this.rootDir(), uploadId)
      const absolutePath = resolveRelativePathInside(dir, safeName, {
        allowRoot: false,
        singleSegment: true,
      })
      const partialPath = `${absolutePath}.part`
      await fs.mkdir(dir, { recursive: true })

      try {
        await pipeline(source, createWriteStream(partialPath, { mode: 0o600 }))
        const stat = await fs.stat(partialPath)
        if (stat.size > DEPLOY_UPLOAD_FILE_LIMIT_BYTES) {
          throw Object.assign(new Error('上传文件超过 512MB 限制'), { statusCode: 413 })
        }
        if (this.totalStoredBytes() + stat.size > DEPLOY_UPLOAD_TOTAL_QUOTA_BYTES) {
          throw Object.assign(new Error('部署上传临时目录已达到 2GB 配额'), { statusCode: 507 })
        }

        await fs.rename(partialPath, absolutePath)
        const stored: StoredUpload = {
          uploadId,
          kind,
          fileName: safeName,
          size: stat.size,
          createdAt: new Date().toISOString(),
          absolutePath,
        }
        await writeJsonAtomic(path.join(dir, METADATA_FILE), publicResult(stored), { mode: 0o600 })
        this.uploads.set(uploadId, stored)
        return publicResult(stored)
      } catch (error) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
        throw error
      }
    })

    this.saveQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async resolve(uploadId: string, expectedKind?: DeployUploadKind): Promise<StoredUpload> {
    await this.init()
    this.assertUploadId(uploadId)
    let stored = this.uploads.get(uploadId)
    if (!stored) {
      try {
        stored = await this.loadOne(uploadId)
        this.uploads.set(uploadId, stored)
      } catch {
        throw Object.assign(new Error('上传文件不存在或已过期，请重新上传'), { statusCode: 404 })
      }
    }

    if (this.isExpired(stored)) {
      await this.cleanup(uploadId)
      throw Object.assign(new Error('上传文件已过期，请重新上传'), { statusCode: 410 })
    }
    if (expectedKind && stored.kind !== expectedKind) {
      throw Object.assign(new Error('上传文件类型与部署类型不匹配'), { statusCode: 400 })
    }

    try {
      const stat = await fs.lstat(stored.absolutePath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== stored.size) throw new Error()
    } catch {
      await this.cleanup(uploadId)
      throw Object.assign(new Error('上传文件已丢失，请重新上传'), { statusCode: 404 })
    }
    return stored
  }

  async consumeTo(destination: string, uploadId: string, expectedKind?: DeployUploadKind) {
    const stored = await this.resolve(uploadId, expectedKind)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(stored.absolutePath, destination)
    await this.cleanup(uploadId)
    return stored
  }

  async cleanup(uploadId: string) {
    this.assertUploadId(uploadId)
    this.uploads.delete(uploadId)
    const dir = path.join(this.rootDir(), uploadId)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const deployUploadService = new DeployUploadService()
