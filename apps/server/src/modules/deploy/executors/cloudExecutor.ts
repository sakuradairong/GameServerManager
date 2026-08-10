import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  CloudBuildArtifactSchema,
  type CloudBuildArtifact,
  type CloudBuildTaskStatus,
  type CloudDeployRequest,
} from '@gsm4/shared'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import { extractTarGzArchive, extractTarXzArchive } from '../../../adapters/archive/TarExtractor.js'
import { extractZipArchive } from '../../../adapters/archive/ZipExtractor.js'
import { cloudBuildClient } from '../cloud/CloudBuildClient.js'
import type { DeployExecutor, ExecutorContext } from './types.js'

const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS = 30 * 60 * 1000

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('部署已取消'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('部署已取消'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function readArtifact(status: CloudBuildTaskStatus): CloudBuildArtifact {
  const direct = CloudBuildArtifactSchema.safeParse(status.data)
  if (direct.success) return direct.data

  if (status.data && typeof status.data === 'object' && 'data' in status.data) {
    const nested = CloudBuildArtifactSchema.safeParse(
      (status.data as { data?: unknown }).data,
    )
    if (nested.success) return nested.data
  }
  throw new Error('云构建成功，但响应中缺少 downloadUrl')
}

function getArchiveFileName(downloadUrl: string, archiveFileName?: string): string {
  let candidate = archiveFileName?.trim()
  if (!candidate) {
    try {
      candidate = decodeURIComponent(path.basename(new URL(downloadUrl).pathname))
    } catch {
      candidate = ''
    }
  }
  const safeName = path.basename(candidate || '').replace(/[<>:"|?*]/g, '')
  return safeName || `cloud-build-${Date.now()}.zip`
}

async function extractCloudArchive(
  archivePath: string,
  archiveName: string,
  destination: string,
  signal: AbortSignal,
) {
  const lowerName = archiveName.toLowerCase()
  if (lowerName.endsWith('.zip')) {
    await extractZipArchive(archivePath, destination)
    return
  }
  if (lowerName.endsWith('.tar.xz') || lowerName.endsWith('.txz')) {
    await extractTarXzArchive(archivePath, destination, signal)
    return
  }
  if (
    lowerName.endsWith('.tar.gz') ||
    lowerName.endsWith('.tgz') ||
    lowerName.endsWith('.tar')
  ) {
    await extractTarGzArchive(archivePath, destination)
    return
  }
  throw new Error(`不支持的云构建归档格式: ${archiveName}`)
}

async function normalizeExtractedDirectory(targetPath: string): Promise<void> {
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  if (entries.length !== 1 || !entries[0].isDirectory()) return

  const wrappedPath = path.join(targetPath, entries[0].name)
  const wrappedEntries = await fs.readdir(wrappedPath, { withFileTypes: true })
  for (const entry of wrappedEntries) {
    const destination = path.join(targetPath, entry.name)
    try {
      await fs.access(destination)
      throw new Error(`解压结果整理失败，目标目录中已存在: ${entry.name}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await fs.rename(path.join(wrappedPath, entry.name), destination)
  }
  await fs.rmdir(wrappedPath)
}

async function detectStartCommand(targetPath: string): Promise<string> {
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  const files = entries.flatMap((entry) => (entry.isFile() ? [entry.name] : []))
  const findCaseInsensitive = (names: string[]) =>
    names.map((name) => files.find((file) => file.toLowerCase() === name)).find(Boolean)

  if (os.platform() === 'win32') {
    const script = findCaseInsensitive(['run.bat', 'start.bat'])
    if (script) return `.\\${script}`
  } else {
    const script = findCaseInsensitive(['run.sh', 'start.sh'])
    if (script) {
      await fs.chmod(path.join(targetPath, script), 0o755).catch(() => undefined)
      return `bash ${script}`
    }
  }

  const jars = files.filter(
    (file) => file.toLowerCase().endsWith('.jar') && !file.toLowerCase().includes('installer'),
  )
  const preferredJar =
    findCaseInsensitive(['server.jar', 'fabric-server-launch.jar']) ||
    jars.find((file) => /^(paper|purpur|spigot|folia|velocity|waterfall|bungeecord)/i.test(file)) ||
    jars[0]
  if (preferredJar) {
    return `java -Xms1G -Xmx2G -jar ${preferredJar} nogui`
  }
  throw new Error('云构建归档中未找到 run/start 脚本或可启动的服务端 jar')
}

async function pollBuild(ctx: ExecutorContext, requestId: string, accessToken: string) {
  const startedAt = Date.now()
  let attempts = 0
  let lastMessage = ''

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    if (attempts > 0) await wait(POLL_INTERVAL_MS, ctx.signal)
    const result = await cloudBuildClient.getBuildStatus(requestId, accessToken, ctx.signal)
    const status = result.status.trim().toUpperCase()
    const message = result.message?.trim() || `云构建状态: ${status}`

    if (message !== lastMessage) {
      ctx.bus.emitLog({ sessionId: ctx.sessionId, line: message, level: 'info' })
      lastMessage = message
    }
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: Math.min(45, 12 + attempts * 2),
      stage: 'build',
      message,
    })

    if (status === 'SUCCESS') return readArtifact(result)
    if (status === 'FAILED') throw new Error(result.message || '云构建任务失败')
    if (status === 'CANCELLED') throw new Error(result.message || '云构建任务已取消')
    attempts += 1
  }
  throw new Error('云构建任务轮询超时')
}

export const cloudExecutor: DeployExecutor = {
  type: 'cloud',
  async run(ctx) {
    const request = ctx.request as CloudDeployRequest
    await fs.mkdir(ctx.installPath, { recursive: true })

    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: `提交云构建任务：${request.coreType} ${request.version}（MC ${request.mcVersion}）`,
      level: 'info',
    })
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 5,
      stage: 'submit',
      message: '提交云构建任务',
    })

    const task = await cloudBuildClient.createBuild(
      {
        coreType: request.coreType,
        version: request.version,
        mcVersion: request.mcVersion,
      },
      ctx.signal,
    )
    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: task.message || `云构建任务已创建: ${task.requestId}`,
      level: 'info',
    })

    const artifact = await pollBuild(ctx, task.requestId, task.accessToken)
    if (ctx.signal.aborted) throw new Error('部署已取消')

    const downloadUrl = cloudBuildClient.resolveDownloadUrl(artifact.downloadUrl)
    const archiveName = getArchiveFileName(downloadUrl, artifact.archiveFileName)
    const tempDir = path.join(process.cwd(), 'data', 'cloud-build', 'temp', ctx.sessionId)
    const archivePath = path.join(tempDir, archiveName)
    await fs.mkdir(tempDir, { recursive: true })

    try {
      ctx.bus.emitLog({ sessionId: ctx.sessionId, line: `下载云构建产物: ${archiveName}`, level: 'info' })
      ctx.bus.emitProgress({
        sessionId: ctx.sessionId,
        percent: 50,
        stage: 'download',
        message: '下载云构建产物',
      })
      await downloadFile({
        url: downloadUrl,
        destination: archivePath,
        signal: ctx.signal,
        onProgress: (percent) => {
          ctx.bus.emitProgress({
            sessionId: ctx.sessionId,
            percent: percent == null ? undefined : Math.max(50, Math.min(85, 50 + percent * 0.35)),
            stage: 'download',
            message: '下载云构建产物',
          })
        },
      })

      if (ctx.signal.aborted) throw new Error('部署已取消')
      ctx.bus.emitProgress({
        sessionId: ctx.sessionId,
        percent: 88,
        stage: 'extract',
        message: '安全解压云构建产物',
      })
      await extractCloudArchive(archivePath, archiveName, ctx.installPath, ctx.signal)
      await normalizeExtractedDirectory(ctx.installPath)
      await fs.writeFile(path.join(ctx.installPath, 'eula.txt'), 'eula=true\n', 'utf8')

      const startCommand = await detectStartCommand(ctx.installPath)
      ctx.bus.emitLog({ sessionId: ctx.sessionId, line: `启动命令: ${startCommand}`, level: 'info' })
      ctx.bus.emitProgress({
        sessionId: ctx.sessionId,
        percent: 96,
        stage: 'finalize',
        message: '云构建服务端就绪',
      })
      return { startCommand }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}
