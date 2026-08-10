import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { MrpackDeployRequest } from '@gsm4/shared'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import { extractZipArchive } from '../../../adapters/archive/ZipExtractor.js'
import { deployUploadService } from '../DeployUploadService.js'
import type { DeployExecutor } from './types.js'
import {
  detectLoader,
  isServerFile,
  parseModrinthIndex,
  type ModrinthFile,
} from './mrpack/modrinthIndex.js'
import { installLoader } from './mrpack/loaderInstaller.js'

/** 目标路径必须落在安装目录内（防目录穿越），拒绝绝对路径与 `..`。 */
function safeTarget(installPath: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/')
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`非法文件路径: ${relPath}`)
  }
  const resolvedRoot = path.resolve(installPath)
  const target = path.resolve(resolvedRoot, normalized)
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`检测到路径穿越: ${relPath}`)
  }
  return target
}

async function computeHash(filePath: string, algorithm: 'sha1' | 'sha512'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** 尽量校验 hash：优先 sha512，其次 sha1；不一致则抛错。 */
async function verifyHash(filePath: string, file: ModrinthFile): Promise<void> {
  if (file.hashes?.sha512) {
    const actual = await computeHash(filePath, 'sha512')
    if (actual.toLowerCase() !== file.hashes.sha512.toLowerCase()) {
      throw new Error(`${file.path} sha512 校验失败`)
    }
    return
  }
  if (file.hashes?.sha1) {
    const actual = await computeHash(filePath, 'sha1')
    if (actual.toLowerCase() !== file.hashes.sha1.toLowerCase()) {
      throw new Error(`${file.path} sha1 校验失败`)
    }
  }
}

/** 将 overrides 目录内容覆盖复制进安装目录（若存在）。 */
async function applyOverrides(
  extractDir: string,
  overridesName: string,
  installPath: string,
): Promise<boolean> {
  const src = path.join(extractDir, overridesName)
  try {
    const stat = await fs.stat(src)
    if (!stat.isDirectory()) return false
  } catch {
    return false
  }
  await fs.cp(src, installPath, { recursive: true, force: true })
  return true
}

export const mrpackExecutor: DeployExecutor = {
  type: 'mrpack',
  async run(ctx) {
    const request = ctx.request as MrpackDeployRequest
    const source = request.source || (request.uploadId ? 'upload' : 'url')

    await fs.mkdir(ctx.installPath, { recursive: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsm4-mrpack-'))
    const mrpackFile = path.join(tempDir, 'pack.mrpack')
    const extractDir = path.join(tempDir, 'extracted')

    try {
      // 1. 获取 .mrpack
      if (source === 'upload') {
        if (!request.uploadId) throw new Error('缺少 uploadId')
        ctx.bus.emitLog({ sessionId: ctx.sessionId, line: '使用已上传的 .mrpack…', level: 'info' })
        ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 8, stage: 'upload', message: '复制上传文件' })
        await deployUploadService.consumeTo(mrpackFile, request.uploadId, 'mrpack')
      } else {
        if (!request.mrpackUrl) throw new Error('缺少 mrpackUrl')
        ctx.bus.emitLog({ sessionId: ctx.sessionId, line: `下载整合包: ${request.mrpackUrl}`, level: 'info' })
        ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 4, stage: 'download', message: '下载整合包' })
        await downloadFile({
          url: request.mrpackUrl,
          destination: mrpackFile,
          signal: ctx.signal,
          onProgress: (percent) => {
            if (percent != null)
              ctx.bus.emitProgress({
                sessionId: ctx.sessionId,
                percent: Math.max(4, Math.min(14, percent * 0.14)),
                stage: 'download',
              })
          },
        })
      }

      if (ctx.signal.aborted) throw new Error('部署已取消')

      // 2. 解压并解析 modrinth.index.json
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 16, stage: 'extract', message: '解析整合包' })
      await extractZipArchive(mrpackFile, extractDir)
      const indexRaw = await fs.readFile(path.join(extractDir, 'modrinth.index.json'), 'utf8').catch(() => {
        throw new Error('整合包中未找到 modrinth.index.json')
      })
      const index = parseModrinthIndex(indexRaw)

      const minecraftVersion = request.minecraftVersion || index.dependencies.minecraft
      if (!minecraftVersion) throw new Error('无法确定 Minecraft 版本')
      const detected = detectLoader(index.dependencies)
      const loader = request.loaderType || detected.loader
      const loaderVersion = request.loaderType ? undefined : detected.version

      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: `整合包: ${index.name || '未命名'} | MC ${minecraftVersion} | 加载器 ${loader}${
          loaderVersion ? ` ${loaderVersion}` : ''
        }`,
        level: 'info',
      })

      // 3. 按 files[].path 下载并校验（跳过服务端不支持的文件）
      const serverFiles = index.files.filter(isServerFile)
      const skipped = index.files.length - serverFiles.length
      if (skipped > 0) {
        ctx.bus.emitLog({
          sessionId: ctx.sessionId,
          line: `跳过 ${skipped} 个客户端专用文件`,
          level: 'info',
        })
      }
      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: `开始下载 ${serverFiles.length} 个文件…`,
        level: 'info',
      })

      for (let i = 0; i < serverFiles.length; i += 1) {
        if (ctx.signal.aborted) throw new Error('部署已取消')
        const file = serverFiles[i]
        if (!file.downloads?.length) {
          throw new Error(`文件缺少下载链接: ${file.path}`)
        }
        const target = safeTarget(ctx.installPath, file.path)
        await fs.mkdir(path.dirname(target), { recursive: true })

        let lastError: Error | null = null
        let ok = false
        for (const url of file.downloads) {
          try {
            await downloadFile({ url, destination: target, signal: ctx.signal })
            await verifyHash(target, file)
            ok = true
            break
          } catch (error) {
            lastError = error as Error
            ctx.bus.emitLog({
              sessionId: ctx.sessionId,
              line: `下载失败(${path.basename(file.path)})，尝试下一个源: ${lastError.message}`,
              level: 'warn',
            })
          }
        }
        if (!ok) {
          throw new Error(`文件下载失败: ${file.path}（${lastError?.message || '未知错误'}）`)
        }

        const base = 18
        const span = 52
        ctx.bus.emitProgress({
          sessionId: ctx.sessionId,
          percent: serverFiles.length
            ? Math.round(base + ((i + 1) / serverFiles.length) * span)
            : base + span,
          stage: 'files',
          message: `下载文件 ${i + 1}/${serverFiles.length}`,
        })
      }

      if (ctx.signal.aborted) throw new Error('部署已取消')

      // 4. 应用 overrides（通用）与 server-overrides（服务端专用，优先级更高）
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 72, stage: 'overrides', message: '应用配置覆盖' })
      const appliedGeneric = await applyOverrides(extractDir, 'overrides', ctx.installPath)
      const appliedServer = await applyOverrides(extractDir, 'server-overrides', ctx.installPath)
      if (appliedGeneric || appliedServer) {
        ctx.bus.emitLog({ sessionId: ctx.sessionId, line: '已应用整合包配置覆盖', level: 'info' })
      }

      if (ctx.signal.aborted) throw new Error('部署已取消')

      // 5. 安装加载器 -> 生成 startCommand
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 76, stage: 'loader', message: `安装 ${loader} 加载器` })
      const loaderResult = await installLoader(loader, {
        installPath: ctx.installPath,
        minecraftVersion,
        loaderVersion,
        javaCommand: request.javaCommand,
        signal: ctx.signal,
        log: (line, level) => ctx.bus.emitLog({ sessionId: ctx.sessionId, line, level: level || 'info' }),
        progress: (percent, message) =>
          ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent, stage: 'loader', message }),
      })

      if (ctx.signal.aborted) throw new Error('部署已取消')

      // 6. 写入 eula=true（直接落盘，不再运行一次服务端触发）
      await fs.writeFile(path.join(ctx.installPath, 'eula.txt'), 'eula=true\n', 'utf8')

      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: `启动命令: ${loaderResult.startCommand}`,
        level: 'info',
      })
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 95, stage: 'finalize', message: '整合包就绪' })

      return { startCommand: loaderResult.startCommand }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}
