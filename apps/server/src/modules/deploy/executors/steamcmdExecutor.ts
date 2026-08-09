import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { SteamDeployRequest } from '@gsm4/shared'
import { configManager } from '../../config/ConfigManager.js'
import type { DeployExecutor } from './types.js'

function quoteArg(value: string) {
  if (!/[\s"]/u.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

export const steamcmdExecutor: DeployExecutor = {
  type: 'steamcmd',
  async run(ctx) {
    const request = ctx.request as SteamDeployRequest
    const steamcmdPath = configManager.getConfig().steamcmd.path
    if (!steamcmdPath) {
      throw new Error('未配置 SteamCMD 路径，请在 data/config.json 的 steamcmd.path 中设置')
    }

    try {
      await fs.access(steamcmdPath)
    } catch {
      throw new Error(`SteamCMD 不存在: ${steamcmdPath}`)
    }

    await fs.mkdir(ctx.installPath, { recursive: true })

    const scriptDir = path.join(configManager.getDataDir(), 'tmp', 'steamcmd')
    await fs.mkdir(scriptDir, { recursive: true })
    const scriptPath = path.join(scriptDir, `${ctx.sessionId}.txt`)

    const anonymous = request.anonymous !== false
    const loginLine = anonymous
      ? 'login anonymous'
      : `login ${quoteArg(request.steamUsername || '')}${
          request.steamPassword ? ` ${quoteArg(request.steamPassword)}` : ''
        }`

    const branch =
      request.branch && request.branch !== 'public' ? ` -beta ${request.branch}` : ''
    const script = [
      `@ShutdownOnFailedCommand 1`,
      `@NoPromptForPassword 1`,
      `force_install_dir ${quoteArg(ctx.installPath)}`,
      loginLine,
      `app_update ${request.appId}${branch} validate`,
      'quit',
      '',
    ].join('\n')

    await fs.writeFile(scriptPath, script, { encoding: 'utf8', mode: 0o600 })

    ctx.bus.emitLog({
      sessionId: ctx.sessionId,
      line: `启动 SteamCMD 安装 appId=${request.appId}`,
      level: 'info',
    })
    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 15,
      stage: 'steamcmd',
      message: 'SteamCMD 运行中',
    })

    const child = spawn(steamcmdPath, ['+runscript', scriptPath], {
      cwd: path.dirname(steamcmdPath),
      env: process.env,
    })

    const onAbort = () => {
      child.kill('SIGTERM')
    }
    ctx.signal.addEventListener('abort', onAbort, { once: true })

    await new Promise<void>((resolve, reject) => {
      child.stdout?.on('data', (buf: Buffer) => {
        const line = buf.toString('utf8')
        for (const piece of line.split(/\r?\n/)) {
          if (piece.trim()) {
            ctx.bus.emitLog({ sessionId: ctx.sessionId, line: piece, level: 'info' })
          }
        }
        const match = line.match(/progress:\s*(\d+)/i)
        if (match) {
          ctx.bus.emitProgress({
            sessionId: ctx.sessionId,
            percent: Math.min(90, Number(match[1])),
            stage: 'steamcmd',
          })
        }
      })
      child.stderr?.on('data', (buf: Buffer) => {
        const line = buf.toString('utf8').trim()
        if (line) {
          ctx.bus.emitLog({ sessionId: ctx.sessionId, line, level: 'warn' })
        }
      })
      child.on('error', reject)
      child.on('close', (code) => {
        ctx.signal.removeEventListener('abort', onAbort)
        if (ctx.signal.aborted) {
          reject(new Error('部署已取消'))
          return
        }
        if (code === 0) resolve()
        else reject(new Error(`SteamCMD 退出码 ${code}`))
      })
    })

    await fs.unlink(scriptPath).catch(() => undefined)

    const startCommand =
      request.startCommand ||
      (process.platform === 'win32' ? 'start.bat' : './start.sh')

    ctx.bus.emitProgress({
      sessionId: ctx.sessionId,
      percent: 95,
      stage: 'finalize',
      message: 'Steam 安装完成',
    })

    return { startCommand }
  },
}
