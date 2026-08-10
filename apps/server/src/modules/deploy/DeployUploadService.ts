import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DeployUploadKind, DeployUploadResult } from '@gsm4/shared'
import { configManager } from '../config/ConfigManager.js'

interface StoredUpload extends DeployUploadResult {
  absolutePath: string
}

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

export class DeployUploadService {
  private uploads = new Map<string, StoredUpload>()

  private rootDir() {
    return path.join(configManager.getDataDir(), 'tmp', 'deploy-uploads')
  }

  async save(kind: DeployUploadKind, fileName: string, data: Buffer): Promise<DeployUploadResult> {
    const safeName = path.basename(fileName).replace(/[<>:"|?*\x00-\x1F]/g, '_')
    if (!safeName) {
      throw Object.assign(new Error('文件名无效'), { statusCode: 400 })
    }

    const ext = path.extname(safeName).toLowerCase()
    if (!ALLOWED_EXT[kind].has(ext)) {
      throw Object.assign(new Error(EXT_ERROR[kind]), { statusCode: 400 })
    }

    const uploadId = crypto.randomUUID()
    const dir = path.join(this.rootDir(), uploadId)
    await fs.mkdir(dir, { recursive: true })
    const absolutePath = path.join(dir, safeName)
    await fs.writeFile(absolutePath, data)

    const result: StoredUpload = {
      uploadId,
      kind,
      fileName: safeName,
      size: data.length,
      createdAt: new Date().toISOString(),
      absolutePath,
    }
    this.uploads.set(uploadId, result)

    return {
      uploadId: result.uploadId,
      kind: result.kind,
      fileName: result.fileName,
      size: result.size,
      createdAt: result.createdAt,
    }
  }

  async resolve(uploadId: string, expectedKind?: DeployUploadKind): Promise<StoredUpload> {
    let stored = this.uploads.get(uploadId)
    if (!stored) {
      // 进程重启后尝试从磁盘恢复
      const dir = path.join(this.rootDir(), uploadId)
      try {
        const names = await fs.readdir(dir)
        const fileName = names[0]
        if (!fileName) throw new Error('empty')
        const absolutePath = path.join(dir, fileName)
        const stat = await fs.stat(absolutePath)
        const inferredKind: DeployUploadKind = fileName.endsWith('.jar')
          ? 'minecraft'
          : fileName.endsWith('.mrpack')
            ? 'mrpack'
            : 'archive'
        stored = {
          uploadId,
          kind: expectedKind || inferredKind,
          fileName,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          absolutePath,
        }
        this.uploads.set(uploadId, stored)
      } catch {
        throw Object.assign(new Error('上传文件不存在或已过期，请重新上传'), { statusCode: 404 })
      }
    }

    if (expectedKind && stored.kind !== expectedKind) {
      throw Object.assign(new Error('上传文件类型与部署类型不匹配'), { statusCode: 400 })
    }

    try {
      await fs.access(stored.absolutePath)
    } catch {
      this.uploads.delete(uploadId)
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
    const stored = this.uploads.get(uploadId)
    this.uploads.delete(uploadId)
    const dir = stored
      ? path.dirname(stored.absolutePath)
      : path.join(this.rootDir(), uploadId)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const deployUploadService = new DeployUploadService()
