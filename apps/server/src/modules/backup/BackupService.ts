import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CreateBackupBodySchema,
  RestoreBackupBodySchema,
  type BackupFile,
  type BackupSet,
  type CreateBackupBody,
  type RestoreBackupBody,
} from '@gsm4/shared'
import { createTarGzArchive } from '../../adapters/archive/TarCreator.js'
import { extractTarGzArchive } from '../../adapters/archive/TarExtractor.js'
import { writeJsonAtomic } from '../../lib/atomicJson.js'
import {
  assertNoSymlinkEscape,
  assertSafePathSegment,
  isPathInside,
  resolveRelativePathInside,
} from '../../lib/safePath.js'
import { configManager } from '../config/ConfigManager.js'
import { instanceService } from '../instance/InstanceService.js'

const ARCHIVE_SUFFIX = '.tar.gz'
const META_FILE = 'meta.json'

type BackupMeta = {
  instanceId: string
  sourcePath: string
  updatedAt: string
}

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}

function formatBackupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}${ARCHIVE_SUFFIX}`
  )
}

function assertBackupFileName(fileName: string): string {
  const name = assertSafePathSegment(fileName, '备份文件名')
  if (!name.endsWith(ARCHIVE_SUFFIX) || name.length <= ARCHIVE_SUFFIX.length) {
    throw httpError('备份文件名无效', 400)
  }
  return name
}

export class BackupService {
  private rootDir() {
    return path.join(configManager.getDataDir(), 'backupdata')
  }

  async init() {
    await fs.mkdir(this.rootDir(), { recursive: true })
  }

  private setDir(instanceId: string) {
    assertSafePathSegment(instanceId, '实例 ID')
    return path.join(this.rootDir(), instanceId)
  }

  private archivePath(instanceId: string, fileName: string) {
    const safeName = assertBackupFileName(fileName)
    return resolveRelativePathInside(this.setDir(instanceId), safeName, {
      allowRoot: false,
      singleSegment: true,
    })
  }

  async list(instanceId: string): Promise<BackupSet> {
    const instance = instanceService.get(instanceId)
    if (!instance) throw httpError('实例不存在', 404)

    const dir = this.setDir(instanceId)
    let entries: string[] = []
    try {
      entries = await fs.readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return {
        instanceId,
        sourcePath: instance.workingDirectory,
        files: [],
        totalSize: 0,
      }
    }

    const files: BackupFile[] = []
    for (const name of entries) {
      if (!name.endsWith(ARCHIVE_SUFFIX) || name === META_FILE) continue
      try {
        assertBackupFileName(name)
      } catch {
        continue
      }
      const full = path.join(dir, name)
      try {
        const stat = await fs.stat(full)
        if (!stat.isFile()) continue
        files.push({
          fileName: name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        // skip unreadable
      }
    }

    files.sort((a, b) => b.fileName.localeCompare(a.fileName))
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    return {
      instanceId,
      sourcePath: instance.workingDirectory,
      files,
      totalSize,
    }
  }

  async create(instanceId: string, body: CreateBackupBody): Promise<BackupSet> {
    const parsed = CreateBackupBodySchema.parse(body)
    await this.ensureStopped(instanceId, parsed.stopInstance)

    const instance = instanceService.acquireLock(instanceId)
    try {
      await this.assertSourceDirectory(instance.workingDirectory)
      const dir = this.setDir(instanceId)
      await fs.mkdir(dir, { recursive: true })

      const fileName = formatBackupFileName()
      const archivePath = this.archivePath(instanceId, fileName)
      await createTarGzArchive(instance.workingDirectory, archivePath)
      await this.writeMeta({
        instanceId,
        sourcePath: instance.workingDirectory,
        updatedAt: new Date().toISOString(),
      })
      await this.applyRetention(instanceId, parsed.maxKeep)
      return await this.list(instanceId)
    } finally {
      instanceService.releaseLock(instanceId)
    }
  }

  async restore(instanceId: string, body: RestoreBackupBody): Promise<BackupSet> {
    const parsed = RestoreBackupBodySchema.parse(body)
    await this.ensureStopped(instanceId, parsed.stopInstance)

    const instance = instanceService.acquireLock(instanceId)
    try {
      const archivePath = this.archivePath(instanceId, parsed.fileName)
      try {
        const stat = await fs.stat(archivePath)
        if (!stat.isFile()) throw httpError('备份文件不存在', 404)
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode) throw error
        throw httpError('备份文件不存在', 404)
      }

      await this.assertSourceDirectory(instance.workingDirectory)
      await assertNoSymlinkEscape(instance.workingDirectory, instance.workingDirectory, {
        allowRoot: true,
      })

      // 清空工作目录内容后安全解压（归档内路径相对工作目录）
      await this.clearDirectoryContents(instance.workingDirectory)
      await extractTarGzArchive(archivePath, instance.workingDirectory)

      await this.writeMeta({
        instanceId,
        sourcePath: instance.workingDirectory,
        updatedAt: new Date().toISOString(),
      })
      return await this.list(instanceId)
    } finally {
      instanceService.releaseLock(instanceId)
    }
  }

  async deleteFile(instanceId: string, fileName: string): Promise<BackupSet> {
    if (!instanceService.get(instanceId)) throw httpError('实例不存在', 404)
    const archivePath = this.archivePath(instanceId, fileName)
    try {
      await fs.unlink(archivePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw httpError('备份文件不存在', 404)
      }
      throw error
    }
    return await this.list(instanceId)
  }

  async deleteSet(instanceId: string): Promise<void> {
    if (!instanceService.get(instanceId)) throw httpError('实例不存在', 404)
    const dir = this.setDir(instanceId)
    await fs.rm(dir, { recursive: true, force: true })
  }

  private async ensureStopped(instanceId: string, stopInstance: boolean) {
    const instance = instanceService.get(instanceId)
    if (!instance) throw httpError('实例不存在', 404)
    if (instanceService.isLocked(instanceId)) {
      throw httpError('实例正在执行其它操作', 409)
    }
    if (instance.status === 'running' || instance.status === 'starting') {
      if (!stopInstance) {
        throw httpError('实例运行中，请先停止或勾选「先停止实例」', 409)
      }
      await instanceService.stop(instanceId)
    }
  }

  private async assertSourceDirectory(dir: string) {
    try {
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) throw httpError('工作目录不是文件夹', 400)
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) throw error
      throw httpError(`工作目录不存在: ${dir}`, 400)
    }
  }

  private async writeMeta(meta: BackupMeta) {
    const dir = this.setDir(meta.instanceId)
    await writeJsonAtomic(path.join(dir, META_FILE), meta)
  }

  private async applyRetention(instanceId: string, maxKeep: number) {
    const set = await this.list(instanceId)
    if (set.files.length <= maxKeep) return
    const toDelete = set.files.slice(maxKeep)
    for (const file of toDelete) {
      const full = this.archivePath(instanceId, file.fileName)
      await fs.rm(full, { force: true })
    }
  }

  /** 删除目录内条目，保留目录本身；拒绝符号链接逃逸。 */
  private async clearDirectoryContents(root: string) {
    const resolvedRoot = path.resolve(root)
    const realRoot = await fs.realpath(resolvedRoot)
    const entries = await fs.readdir(resolvedRoot)
    for (const name of entries) {
      const target = path.join(resolvedRoot, name)
      const lstat = await fs.lstat(target)
      if (lstat.isSymbolicLink()) {
        const linkTarget = await fs.readlink(target)
        const resolved = path.resolve(resolvedRoot, linkTarget)
        if (!isPathInside(realRoot, resolved, true)) {
          throw httpError(`拒绝删除逃逸符号链接: ${name}`, 400)
        }
        await fs.unlink(target)
        continue
      }
      await assertNoSymlinkEscape(realRoot, target, { followLeaf: false, allowRoot: true })
      await fs.rm(target, { recursive: true, force: true })
    }
  }
}

export const backupService = new BackupService()
