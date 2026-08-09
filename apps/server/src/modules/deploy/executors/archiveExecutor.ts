import fs from 'node:fs/promises'
import path from 'node:path'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import { extractZipArchive } from '../../../adapters/archive/ZipExtractor.js'
import type { ArchiveDeployRequest } from '@gsm4/shared'
import { deployUploadService } from '../DeployUploadService.js'
import type { DeployExecutor } from './types.js'

export const archiveExecutor: DeployExecutor = {
  type: 'archive',
  async run(ctx) {
    const request = ctx.request as ArchiveDeployRequest
    const source = request.source || (request.uploadId ? 'upload' : 'url')

    await fs.mkdir(ctx.installPath, { recursive: true })
    const archivePath = path.join(ctx.installPath, `_gsm4_archive_${Date.now()}.zip`)

    if (source === 'upload') {
      if (!request.uploadId) throw new Error('缺少 uploadId')
      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: '使用已上传的 zip 归档…',
        level: 'info',
      })
      ctx.bus.emitProgress({
        sessionId: ctx.sessionId,
        percent: 35,
        stage: 'upload',
        message: '复制上传文件',
      })
      await deployUploadService.consumeTo(archivePath, request.uploadId, 'archive')
    } else {
      if (!request.archiveUrl) throw new Error('缺少 archiveUrl')
      ctx.bus.emitLog({ sessionId: ctx.sessionId, line: '开始下载归档…', level: 'info' })
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 5, stage: 'download' })

      await downloadFile({
        url: request.archiveUrl,
        destination: archivePath,
        signal: ctx.signal,
        onProgress: (percent) => {
          ctx.bus.emitProgress({
            sessionId: ctx.sessionId,
            percent: percent != null ? Math.max(5, Math.min(70, percent * 0.7)) : undefined,
            stage: 'download',
            message: '下载中',
          })
        },
      })
    }

    if (ctx.signal.aborted) throw new Error('部署已取消')

    ctx.bus.emitLog({ sessionId: ctx.sessionId, line: '开始解压…', level: 'info' })
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 75,
      stage: 'extract',
      message: '解压归档',
    })

    await extractZipArchive(archivePath, ctx.installPath)
    await fs.unlink(archivePath).catch(() => undefined)

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 95,
      stage: 'finalize',
      message: '准备提交实例',
    })
    return { startCommand: request.startCommand }
  },
}
