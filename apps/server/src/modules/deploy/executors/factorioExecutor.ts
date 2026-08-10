import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { FactorioDeployRequest } from '@gsm4/shared'
import { downloadFile } from '../../../adapters/download/HttpDownloader.js'
import { extractTarXzArchive } from '../../../adapters/archive/TarExtractor.js'
import type { DeployExecutor, ExecutorContext } from './types.js'

/** 定位解压后的 factorio 可执行文件，返回其所在的服务器根目录（含 bin/x64/factorio）。 */
async function resolveServerRoot(installPath: string): Promise<string | null> {
  const candidates = [path.join(installPath, 'factorio'), installPath]
  for (const root of candidates) {
    try {
      await fs.access(path.join(root, 'bin', 'x64', 'factorio'))
      return root
    } catch {
      // continue
    }
  }
  return null
}

/** 运行 factorio 二进制（如 --create 生成初始存档），转发输出，支持取消与超时。 */
function runFactorio(
  args: string[],
  cwd: string,
  ctx: ExecutorContext,
  timeoutMs = 120 * 1000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ctx.signal.aborted) {
      reject(new Error('部署已取消'))
      return
    }
    const child = spawn('./bin/x64/factorio', args, { cwd, env: process.env })
    let timedOut = false
    const onAbort = () => child.kill('SIGTERM')
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    const forward = (buf: Buffer, level: 'info' | 'warn') => {
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (line.trim()) ctx.bus.emitLog({ sessionId: ctx.sessionId, line, level })
      }
    }
    child.stdout?.on('data', (b: Buffer) => forward(b, 'info'))
    child.stderr?.on('data', (b: Buffer) => forward(b, 'warn'))

    child.on('error', (error) => {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onAbort)
      if (ctx.signal.aborted) {
        reject(new Error('部署已取消'))
        return
      }
      if (timedOut) {
        reject(new Error('factorio 初始化超时'))
        return
      }
      if (code === 0) resolve()
      else reject(new Error(`factorio 退出码 ${code}`))
    })
  })
}

export const factorioExecutor: DeployExecutor = {
  type: 'factorio',
  async run(ctx) {
    const request = ctx.request as FactorioDeployRequest
    const version = request.version?.trim() || 'stable'

    await fs.mkdir(ctx.installPath, { recursive: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsm4-factorio-'))
    const archivePath = path.join(tempDir, 'factorio-headless.tar.xz')

    try {
      const url = `https://factorio.com/get-download/${encodeURIComponent(version)}/headless/linux64`
      ctx.bus.emitLog({
        sessionId: ctx.sessionId,
        line: `下载 Factorio headless（${version}）…`,
        level: 'info',
      })
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 5, stage: 'download', message: '下载服务端' })

      await downloadFile({
        url,
        destination: archivePath,
        signal: ctx.signal,
        onProgress: (percent) => {
          if (percent != null)
            ctx.bus.emitProgress({
              sessionId: ctx.sessionId,
              percent: Math.max(5, Math.min(60, percent * 0.55 + 5)),
              stage: 'download',
              message: '下载中',
            })
        },
      })

      if (ctx.signal.aborted) throw new Error('部署已取消')

      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 66, stage: 'extract', message: '解压 tar.xz' })
      await extractTarXzArchive(archivePath, ctx.installPath, ctx.signal)

      const serverRoot = await resolveServerRoot(ctx.installPath)
      if (!serverRoot) {
        throw new Error('解压完成但未找到 factorio 可执行文件（bin/x64/factorio）')
      }
      await fs.chmod(path.join(serverRoot, 'bin', 'x64', 'factorio'), 0o755).catch(() => undefined)

      // 生成初始存档，便于 --start-server-load-latest 直接启动
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 84, stage: 'init', message: '生成初始存档' })
      await fs.mkdir(path.join(serverRoot, 'saves'), { recursive: true })
      try {
        await runFactorio(['--create', './saves/gsm4-default.zip'], serverRoot, ctx)
        ctx.bus.emitLog({ sessionId: ctx.sessionId, line: '已生成初始存档 saves/gsm4-default.zip', level: 'info' })
      } catch (error) {
        if (ctx.signal.aborted) throw error
        ctx.bus.emitLog({
          sessionId: ctx.sessionId,
          line: `初始存档生成失败（可稍后在终端手动 --create）：${(error as Error).message}`,
          level: 'warn',
        })
      }

      const startCommand = './bin/x64/factorio --start-server-load-latest'
      ctx.bus.emitLog({ sessionId: ctx.sessionId, line: `启动命令: ${startCommand}`, level: 'info' })
      ctx.bus.emitProgress({ sessionId: ctx.sessionId, percent: 95, stage: 'finalize', message: 'Factorio 就绪' })

      return { startCommand, workingDirectory: serverRoot }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}
