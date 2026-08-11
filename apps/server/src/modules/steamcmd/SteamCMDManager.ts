import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  SteamAppIdSchema,
  type SteamBranchInfo,
  type SteamBranchQueryBody,
  type SteamcmdStatus,
} from '@gsm4/shared'
import { downloadFile } from '../../adapters/download/HttpDownloader.js'
import { extractZipArchive } from '../../adapters/archive/ZipExtractor.js'
import { extractTarGzArchive } from '../../adapters/archive/TarExtractor.js'
import { configManager } from '../config/ConfigManager.js'
import { parseSteamAppBranches } from './SteamAppInfoParser.js'
import { steamcmdInstallBus } from './SteamcmdInstallBus.js'

const WINDOWS_DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'
const LINUX_DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'
const BRANCH_CACHE_TTL_MS = 5 * 60 * 1000
const BRANCH_QUERY_TIMEOUT_MS = 60 * 1000
const BRANCH_QUERY_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const BRANCH_QUERY_MAX_PENDING = 3

function steamcmdError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode })
}

function quoteSteamCommandArg(value: string): string {
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

function redactSecrets(value: string, secrets: Array<string | undefined>): string {
  return secrets.reduce<string>(
    (result, secret) => (secret ? result.split(secret).join('******') : result),
    value,
  )
}

function detectSteamLoginError(
  output: string,
  accountLogin: boolean,
): (Error & { statusCode: number }) | null {
  if (/RateLimitExceeded|rate limit exceeded|too many login failures/iu.test(output)) {
    return steamcmdError(429, 'Steam 登录尝试过于频繁，请稍后重试')
  }
  if (!accountLogin) return null
  if (
    /Steam Guard|two[- ]factor|Account Logon Denied|Invalid Login Auth Code/iu.test(output)
  ) {
    return steamcmdError(
      401,
      'Steam 登录需要 Steam Guard 验证，请先在本机 SteamCMD 完成验证并保留机器授权状态',
    )
  }
  if (/Invalid Password|InvalidPassword|Invalid Login|Login Failure|LogonFailure/iu.test(output)) {
    return steamcmdError(401, 'Steam 账号或密码错误')
  }
  return null
}

export class SteamCMDManager {
  private installing = false
  private progress: number | null = null
  private statusMessage: string | null = null
  private readonly branchCache = new Map<
    string,
    { expiresAt: number; branches: SteamBranchInfo[] }
  >()
  private readonly branchRequests = new Map<string, Promise<SteamBranchInfo[]>>()
  private branchQueryQueue: Promise<void> = Promise.resolve()
  private pendingBranchQueries = 0

  getDefaultInstallPath(): string {
    return path.join(configManager.getDataDir(), 'steamcmd')
  }

  isPlatformSupported(): { supported: boolean; reason: string | null } {
    const platform = os.platform()
    const arch = os.arch()
    if (platform !== 'win32' && platform !== 'linux') {
      return { supported: false, reason: `当前平台 ${platform} 不支持 SteamCMD 在线安装` }
    }
    if (arch === 'arm' || arch === 'arm64') {
      return {
        supported: false,
        reason: 'ARM 架构暂不支持 SteamCMD 官方包一键安装，请手动配置可执行文件路径',
      }
    }
    return { supported: true, reason: null }
  }

  async resolveExecutableInDir(installDir: string): Promise<string | null> {
    const isWindows = os.platform() === 'win32'
    const primary = path.join(installDir, isWindows ? 'steamcmd.exe' : 'steamcmd.sh')
    const alternative = path.join(installDir, isWindows ? 'steamcmd.sh' : 'steamcmd.exe')
    for (const candidate of [primary, alternative]) {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // continue
      }
    }
    return null
  }

  async getStatus(): Promise<SteamcmdStatus> {
    const support = this.isPlatformSupported()
    const configuredPath = configManager.getConfig().steamcmd.path.trim()
    let executablePath: string | null = configuredPath || null
    let installDir: string | null = null
    let isInstalled = false

    if (executablePath) {
      try {
        await fs.access(executablePath)
        isInstalled = true
        installDir = path.dirname(executablePath)
      } catch {
        isInstalled = false
      }
    }

    if (!isInstalled) {
      const defaultDir = this.getDefaultInstallPath()
      const found = await this.resolveExecutableInDir(defaultDir)
      if (found) {
        executablePath = found
        installDir = defaultDir
        isInstalled = true
        // 默认目录已有安装包但配置为空时自动回填，避免重复下载
        if (!configuredPath) {
          await configManager.updateSettings({ steamcmd: { path: found } })
        }
      }
    }

    return {
      isInstalled,
      executablePath,
      installDir,
      supported: support.supported,
      unsupportedReason: support.reason,
      platform: os.platform(),
      arch: os.arch(),
      installing: this.installing,
      progress: this.progress,
      statusMessage: this.statusMessage,
      defaultInstallPath: this.getDefaultInstallPath(),
    }
  }

  async detectAndOptionallyApply(installPath: string, apply = false) {
    const resolved = path.resolve(installPath)
    let executablePath: string | null = null

    try {
      const stat = await fs.stat(resolved)
      if (stat.isFile()) {
        executablePath = resolved
      } else if (stat.isDirectory()) {
        executablePath = await this.resolveExecutableInDir(resolved)
      }
    } catch {
      executablePath = null
    }

    if (apply && executablePath) {
      await configManager.updateSettings({ steamcmd: { path: executablePath } })
    }

    return {
      exists: Boolean(executablePath),
      executablePath,
      installPath: resolved,
      applied: Boolean(apply && executablePath),
    }
  }

  async getAppBranches(
    appId: string,
    options: SteamBranchQueryBody = {},
  ): Promise<SteamBranchInfo[]> {
    const parsedAppId = SteamAppIdSchema.safeParse(appId)
    if (!parsedAppId.success) {
      throw steamcmdError(400, parsedAppId.error.issues[0]?.message || 'AppID 格式无效')
    }

    const username = options.steamUsername?.trim() || ''
    const password = options.steamPassword || ''
    if (Boolean(username) !== Boolean(password)) {
      throw steamcmdError(400, 'Steam 账号和密码必须同时填写')
    }
    const credentials = username && password ? { username, password } : undefined
    if (credentials) {
      return this.enqueueBranchQuery(() => this.fetchAppBranches(parsedAppId.data, credentials))
    }

    const now = Date.now()
    for (const [cachedAppId, entry] of this.branchCache) {
      if (entry.expiresAt <= now) this.branchCache.delete(cachedAppId)
    }

    const cached = this.branchCache.get(parsedAppId.data)
    if (!options.forceRefresh && cached && cached.expiresAt > now) {
      return cached.branches.map((branch) => ({ ...branch }))
    }

    const existingRequest = this.branchRequests.get(parsedAppId.data)
    if (existingRequest) {
      return existingRequest.then((branches) => branches.map((branch) => ({ ...branch })))
    }

    const request = this.enqueueBranchQuery(() => this.fetchAppBranches(parsedAppId.data))
    this.branchRequests.set(parsedAppId.data, request)
    try {
      const branches = await request
      this.branchCache.set(parsedAppId.data, {
        expiresAt: Date.now() + BRANCH_CACHE_TTL_MS,
        branches,
      })
      return branches.map((branch) => ({ ...branch }))
    } finally {
      this.branchRequests.delete(parsedAppId.data)
    }
  }

  async startOnlineInstall(installPath?: string): Promise<{ installPath: string }> {
    if (this.installing) {
      throw new Error('SteamCMD 正在安装中，请稍候')
    }
    if (this.pendingBranchQueries > 0) {
      throw new Error('SteamCMD 正在查询分支，请稍候再安装')
    }

    const support = this.isPlatformSupported()
    if (!support.supported) {
      throw new Error(support.reason || '当前平台不支持一键安装')
    }

    const targetDir = path.resolve(installPath?.trim() || this.getDefaultInstallPath())
    this.installing = true
    this.progress = 0
    this.statusMessage = '准备安装…'
    steamcmdInstallBus.emitProgress({
      progress: 0,
      status: this.statusMessage,
      installing: true,
    })

    void this.runInstall(targetDir).catch(() => undefined)
    return { installPath: targetDir }
  }

  private setStatus(status: string, progress?: number) {
    this.statusMessage = status
    if (typeof progress === 'number') this.progress = progress
    steamcmdInstallBus.emitProgress({
      progress: this.progress ?? 0,
      status,
      installing: true,
    })
  }

  private enqueueBranchQuery<T>(query: () => Promise<T>): Promise<T> {
    if (this.pendingBranchQueries >= BRANCH_QUERY_MAX_PENDING) {
      return Promise.reject(steamcmdError(429, 'Steam 分支查询任务过多，请稍后重试'))
    }
    this.pendingBranchQueries += 1
    const result = this.branchQueryQueue.then(query, query)
    this.branchQueryQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result.finally(() => {
      this.pendingBranchQueries -= 1
    })
  }

  private async fetchAppBranches(
    appId: string,
    credentials?: { username: string; password: string },
  ): Promise<SteamBranchInfo[]> {
    if (this.installing) {
      throw steamcmdError(409, 'SteamCMD 正在安装中，请稍后查询分支')
    }
    const status = await this.getStatus()
    if (!status.isInstalled || !status.executablePath) {
      throw steamcmdError(400, 'SteamCMD 未配置，请先完成安装或填写可执行文件路径')
    }

    const loginCommand = credentials
      ? `login ${quoteSteamCommandArg(credentials.username)} ${quoteSteamCommandArg(credentials.password)}`
      : 'login anonymous'
    const attempts = [
      [
        loginCommand,
        `app_info_print ${appId}`,
        `app_info_print ${appId}`,
        'logoff',
        'quit',
      ],
      [
        loginCommand,
        `app_info_request ${appId}`,
        `app_info_print ${appId}`,
        `app_info_print ${appId}`,
        `app_info_print ${appId}`,
        'logoff',
        'quit',
      ],
      [
        loginCommand,
        'app_info_update 1',
        `app_info_print ${appId}`,
        `app_info_print ${appId}`,
        'logoff',
        'quit',
      ],
    ]

    let lastError: unknown
    for (let attempt = 0; attempt < attempts.length; attempt += 1) {
      try {
        const output = await this.runSteamCMDForOutput(
          status.executablePath,
          attempts[attempt],
          [credentials?.password],
        )
        const loginError = detectSteamLoginError(output, Boolean(credentials))
        if (loginError) throw loginError
        const branches = parseSteamAppBranches(output, appId)
        if (branches.length > 0) return branches
        lastError = new Error('SteamCMD 未返回有效分支数据')
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 401 || statusCode === 429 || statusCode === 504) throw error
        const loginError = detectSteamLoginError(
          error instanceof Error ? error.message : String(error),
          Boolean(credentials),
        )
        if (loginError) throw loginError
        lastError = error
      }
      if (attempt < attempts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 750))
      }
    }

    const fallback = credentials
      ? '未获取到 Steam 分支信息，请检查账号权限或 Steam Guard 状态'
      : '未获取到 Steam 分支信息，部分游戏需要使用拥有该游戏的 Steam 账号查询'
    if (lastError && (lastError as { statusCode?: number }).statusCode === 504) throw lastError
    throw steamcmdError(502, fallback)
  }

  private async runSteamCMDForOutput(
    executablePath: string,
    commands: string[],
    secrets: Array<string | undefined>,
  ): Promise<string> {
    const scriptDir = path.join(configManager.getDataDir(), 'tmp', 'steamcmd')
    await fs.mkdir(scriptDir, { recursive: true })
    const scriptPath = path.join(scriptDir, `branches-${crypto.randomUUID()}.txt`)
    const script = [
      '@ShutdownOnFailedCommand 1',
      '@NoPromptForPassword 1',
      ...commands,
      '',
    ].join('\n')
    await fs.writeFile(scriptPath, script, { encoding: 'utf8', mode: 0o600 })

    try {
      return await new Promise<string>((resolve, reject) => {
        const child = spawn(executablePath, ['+runscript', scriptPath], {
          cwd: path.dirname(executablePath),
          env: process.env,
        })
        let stdout = ''
        let stderr = ''
        let outputBytes = 0
        let settled = false
        let terminationError: Error | null = null
        let forceKillTimer: NodeJS.Timeout | null = null

        const timeout = setTimeout(() => {
          terminate(steamcmdError(504, '查询 Steam 分支超时'))
        }, BRANCH_QUERY_TIMEOUT_MS)
        timeout.unref?.()

        const finish = (callback: () => void) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          if (forceKillTimer) clearTimeout(forceKillTimer)
          callback()
        }

        const terminate = (error: Error) => {
          if (settled || terminationError) return
          terminationError = error
          try {
            child.kill('SIGTERM')
          } catch {
            // close/error handlers settle the promise.
          }
          forceKillTimer = setTimeout(() => {
            if (settled) return
            try {
              child.kill('SIGKILL')
            } catch {
              // Keep waiting for close/error.
            }
          }, 5000)
          forceKillTimer.unref?.()
        }

        const appendOutput = (target: 'stdout' | 'stderr', chunk: Buffer) => {
          if (settled || terminationError) return
          outputBytes += chunk.length
          if (outputBytes > BRANCH_QUERY_MAX_OUTPUT_BYTES) {
            terminate(steamcmdError(502, 'Steam 分支查询输出过大'))
            return
          }
          if (target === 'stdout') stdout += chunk.toString('utf8')
          else stderr += chunk.toString('utf8')
        }

        child.stdout?.on('data', (chunk: Buffer) => appendOutput('stdout', chunk))
        child.stderr?.on('data', (chunk: Buffer) => appendOutput('stderr', chunk))
        child.on('error', (error) => {
          finish(() => reject(steamcmdError(502, `SteamCMD 启动失败: ${error.message}`)))
        })
        child.on('close', (code) => {
          if (terminationError) {
            finish(() => reject(terminationError))
            return
          }
          if (code === 0) {
            finish(() => resolve(`${stdout}\n${stderr}`))
            return
          }
          const detail = redactSecrets(`${stdout}\n${stderr}`.trim(), secrets).slice(-2000)
          finish(() =>
            reject(
              steamcmdError(
                502,
                detail ? `SteamCMD 查询失败: ${detail}` : `SteamCMD 退出码 ${code ?? '未知'}`,
              ),
            ),
          )
        })
      })
    } finally {
      await fs.unlink(scriptPath).catch(() => undefined)
    }
  }

  private async runInstall(installPath: string): Promise<void> {
    try {
      this.setStatus('正在准备安装目录…', 0)
      await fs.mkdir(installPath, { recursive: true })

      const isWindows = os.platform() === 'win32'
      const downloadUrl = isWindows ? WINDOWS_DOWNLOAD_URL : LINUX_DOWNLOAD_URL
      const fileName = isWindows ? 'steamcmd.zip' : 'steamcmd_linux.tar.gz'
      const downloadPath = path.join(installPath, fileName)

      this.setStatus('正在下载 SteamCMD…', 1)
      await downloadFile({
        url: downloadUrl,
        destination: downloadPath,
        onProgress: (percent) => {
          if (typeof percent === 'number') {
            // 下载占 0-85
            this.setStatus('正在下载 SteamCMD…', Math.min(85, Math.round(percent * 0.85)))
          }
        },
      })

      const stats = await fs.stat(downloadPath)
      if (stats.size === 0) {
        throw new Error('下载的文件为空')
      }

      this.setStatus('正在解压文件…', 88)
      if (isWindows) {
        await extractZipArchive(downloadPath, installPath)
      } else {
        await extractTarGzArchive(downloadPath, installPath)
      }

      await fs.unlink(downloadPath).catch(() => undefined)

      const executablePath = await this.resolveExecutableInDir(installPath)
      if (!executablePath) {
        throw new Error('SteamCMD 安装验证失败：未找到可执行文件')
      }

      if (!isWindows) {
        await fs.chmod(executablePath, 0o755).catch(() => undefined)
      }

      this.setStatus('正在写入配置…', 96)
      await configManager.updateSettings({ steamcmd: { path: executablePath } })

      this.installing = false
      this.progress = 100
      this.statusMessage = '安装完成'
      steamcmdInstallBus.emitComplete({
        success: true,
        executablePath,
        installDir: installPath,
        message: 'SteamCMD 安装完成',
      })
      steamcmdInstallBus.emitProgress({
        progress: 100,
        status: '安装完成',
        installing: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SteamCMD 安装失败'
      this.installing = false
      this.progress = null
      this.statusMessage = message
      steamcmdInstallBus.emitError({ success: false, message })
      steamcmdInstallBus.emitProgress({
        progress: 0,
        status: message,
        installing: false,
      })
    }
  }
}

export const steamCMDManager = new SteamCMDManager()
