import fs from 'node:fs/promises'
import path from 'node:path'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import type { MinecraftDeployRequest } from '@gsm4/shared'
import { deployUploadService } from '../DeployUploadService.js'
import type { DeployExecutor } from './types.js'

export const minecraftExecutor: DeployExecutor = {
  type: 'minecraft',
  async run(ctx) {
    const request = ctx.request as MinecraftDeployRequest
    await fs.mkdir(ctx.installPath, { recursive: true })

    const source = request.source || (request.uploadId ? 'upload' : 'url')
    let jarName = request.jarFileName || 'server.jar'

    if (source === 'upload') {
      if (!request.uploadId) throw new Error('缺少 uploadId')
      const uploaded = await deployUploadService.resolve(request.uploadId, 'minecraft')
      jarName = request.jarFileName || uploaded.fileName || 'server.jar'
      const jarPath = path.join(ctx.installPath, jarName)

      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: `使用已上传核心: ${uploaded.fileName}`,
        level: 'info',
      })
      ctx.bus.emitProgress({
        sessionId: ctx.sessionId,
        percent: 40,
        stage: 'upload',
        message: '复制上传文件',
      })

      await deployUploadService.consumeTo(jarPath, request.uploadId, 'minecraft')
    } else {
      if (!request.downloadUrl) throw new Error('缺少 downloadUrl')
      const jarPath = path.join(ctx.installPath, jarName)

      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: `下载 Minecraft 核心: ${request.downloadUrl}`,
        level: 'info',
      })
      ctx.bus.emitProgress({
        sessionId: ctx.sessionId,
        percent: 10,
        stage: 'download',
        message: '下载 jar',
      })

      await downloadFile({
        url: request.downloadUrl,
        destination: jarPath,
        signal: ctx.signal,
        onProgress: (percent) => {
          ctx.bus.emitProgress({
            sessionId: ctx.sessionId,
            percent: percent != null ? Math.max(10, Math.min(90, percent * 0.9)) : undefined,
            stage: 'download',
          })
        },
      })
    }

    if (ctx.signal.aborted) throw new Error('部署已取消')

    await fs.writeFile(path.join(ctx.installPath, 'eula.txt'), 'eula=true\n', 'utf8')

    const startCommand =
      request.javaCommand?.includes(jarName)
        ? request.javaCommand
        : (request.javaCommand || `java -Xms1G -Xmx2G -jar ${jarName} nogui`).replace(
            'server.jar',
            jarName,
          )

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 95,
      stage: 'finalize',
      message: 'Minecraft 文件就绪',
    })
    return { startCommand }
  },
}
