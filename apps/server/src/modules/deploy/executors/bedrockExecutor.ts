import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { BedrockDeployRequest } from '@gsm4/shared'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import { extractZipArchive } from '../../../adapters/archive/ZipExtractor.js'
import type { DeployExecutor } from './types.js'

interface BedrockLink {
  downloadType: string
  downloadUrl: string
}

async function fetchBedrockLinks(): Promise<BedrockLink[]> {
  const response = await fetch(
    'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links',
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        Accept: '*/*',
        Origin: 'https://www.minecraft.net',
        Referer: 'https://www.minecraft.net/',
      },
    },
  )
  if (!response.ok) {
    throw new Error(`获取基岩版下载链接失败: HTTP ${response.status}`)
  }
  const json = (await response.json()) as {
    result?: { links?: BedrockLink[] }
  }
  const links = json.result?.links
  if (!links?.length) {
    throw new Error('基岩版下载链接响应无效')
  }
  return links
}

function pickLink(links: BedrockLink[], platform: 'windows' | 'linux', versionType: 'stable' | 'preview') {
  const wantPreview = versionType === 'preview'
  const platformKeys =
    platform === 'windows' ? ['windows', 'win'] : ['linux', 'ubuntu']

  return links.find((link) => {
    const type = link.downloadType.toLowerCase()
    const isPreview = type.includes('preview')
    if (wantPreview !== isPreview) return false
    return platformKeys.some((key) => type.includes(key))
  })
}

export const bedrockExecutor: DeployExecutor = {
  type: 'bedrock',
  async run(ctx) {
    const request = ctx.request as BedrockDeployRequest
    const versionType = request.versionType || 'stable'
    const platform = os.platform() === 'win32' ? 'windows' : 'linux'
    const workingDirectory = path.join(ctx.installPath, 'Minecraft-bedrock-server')

    await fs.mkdir(workingDirectory, { recursive: true })

    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: `部署 Minecraft 基岩版（${platform} / ${versionType}）…`,
      level: 'info',
    })
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 8,
      stage: 'resolve',
      message: '获取下载链接',
    })

    const links = await fetchBedrockLinks()
    const link = pickLink(links, platform, versionType)
    if (!link) {
      throw new Error(
        `未找到 ${platform}/${versionType} 下载链接。可用: ${links.map((l) => l.downloadType).join(', ')}`,
      )
    }

    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: `使用链接类型: ${link.downloadType}`,
      level: 'info',
    })

    const archivePath = path.join(workingDirectory, 'bedrock-server.zip')
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 15,
      stage: 'download',
      message: '下载服务端',
    })

    await downloadFile({
      url: link.downloadUrl,
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
      message: '解压服务端',
    })
    await extractZipArchive(archivePath, workingDirectory)
    await fs.unlink(archivePath).catch(() => undefined)

    let startCommand = './bedrock_server'
    if (platform === 'windows') {
      startCommand = '.\\bedrock_server.exe'
    } else {
      await fs.chmod(path.join(workingDirectory, 'bedrock_server'), 0o755).catch(() => undefined)
    }

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 95,
      stage: 'finalize',
      message: '准备提交实例',
    })

    return { startCommand, workingDirectory }
  },
}
