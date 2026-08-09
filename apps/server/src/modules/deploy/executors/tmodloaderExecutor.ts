import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { TmodloaderDeployRequest } from '@gsm4/shared'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import { extractZipArchive } from '../../../adapters/archive/ZipExtractor.js'
import type { DeployExecutor } from './types.js'

interface GithubAsset {
  name: string
  browser_download_url: string
}

interface GithubRelease {
  tag_name: string
  assets: GithubAsset[]
}

async function getTModLoaderInfo(): Promise<{ version: string; downloadUrl: string }> {
  const response = await fetch(
    'https://api.github.com/repos/tModLoader/tModLoader/releases/latest',
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GSM4-Deploy',
      },
    },
  )
  if (!response.ok) {
    throw new Error(`获取 tModLoader 版本失败: HTTP ${response.status}`)
  }
  const data = (await response.json()) as GithubRelease
  const patterns = [
    /tmodloader.*server.*\.zip$/i,
    /tmodloader.*\.zip$/i,
    /.*server.*\.zip$/i,
    /^(?!.*example).*\.zip$/i,
  ]

  let downloadUrl = ''
  for (const pattern of patterns) {
    const asset = data.assets.find((item) => pattern.test(item.name))
    if (asset) {
      downloadUrl = asset.browser_download_url
      break
    }
  }
  if (!downloadUrl) {
    throw new Error('未找到 tModLoader 服务端下载链接')
  }
  return { version: data.tag_name, downloadUrl }
}

async function resolveStartCommand(installPath: string): Promise<string> {
  const isWindows = os.platform() === 'win32'
  const candidates = isWindows
    ? ['tModLoaderServer.exe', 'start-tModLoaderServer.bat', 'start-tModLoaderServer.sh']
    : [
        'start-tModLoaderServer.sh',
        'tModLoaderServer',
        'tModLoaderServer.exe',
        'LaunchUtils/ScriptCaller.sh',
      ]

  for (const name of candidates) {
    const full = path.join(installPath, name)
    try {
      await fs.access(full)
      if (!isWindows && name.endsWith('.sh')) {
        await fs.chmod(full, 0o755).catch(() => undefined)
        return `./${name}`
      }
      if (isWindows && name.endsWith('.exe')) return `.\\${name}`
      if (isWindows && name.endsWith('.bat')) return `.\\${name}`
      if (!isWindows) {
        await fs.chmod(full, 0o755).catch(() => undefined)
        return `./${name}`
      }
      return name
    } catch {
      // continue
    }
  }

  return isWindows ? '.\\tModLoaderServer.exe' : './start-tModLoaderServer.sh'
}

export const tmodloaderExecutor: DeployExecutor = {
  type: 'tmodloader',
  async run(ctx) {
    const request = ctx.request as TmodloaderDeployRequest
    void request

    await fs.mkdir(ctx.installPath, { recursive: true })

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 8,
      stage: 'resolve',
      message: '获取 tModLoader 版本',
    })
    const info = await getTModLoaderInfo()
    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: `找到版本 ${info.version}`,
      level: 'info',
    })

    const archivePath = path.join(ctx.installPath, `_gsm4_tmodloader_${Date.now()}.zip`)
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 15,
      stage: 'download',
      message: '下载 tModLoader',
    })

    await downloadFile({
      url: info.downloadUrl,
      destination: archivePath,
      signal: ctx.signal,
      onProgress: (percent) => {
        ctx.bus.emitProgress({
          sessionId: ctx.sessionId,
          percent: percent != null ? Math.max(15, Math.min(70, percent * 0.55 + 15)) : undefined,
          stage: 'download',
          message: '下载中',
        })
      },
    })

    if (ctx.signal.aborted) throw new Error('部署已取消')

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 78,
      stage: 'extract',
      message: '解压 tModLoader',
    })
    await extractZipArchive(archivePath, ctx.installPath)
    await fs.unlink(archivePath).catch(() => undefined)

    const startCommand = await resolveStartCommand(ctx.installPath)
    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: `推荐启动命令: ${startCommand}`,
      level: 'info',
    })

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 95,
      stage: 'finalize',
      message: '准备提交实例',
    })
    return { startCommand }
  },
}
