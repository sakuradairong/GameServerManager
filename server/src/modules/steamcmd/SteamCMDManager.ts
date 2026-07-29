import fs from 'fs/promises'
import path from 'path'
import https from 'https'
import { createWriteStream } from 'fs'
import * as tar from 'tar'
import winston from 'winston'
import os from 'os'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { parse as parseVdf } from 'vdf-parser'
import { ConfigManager } from '../config/ConfigManager.js'
import { createTarSecurityFilter } from '../../utils/tarSecurityFilter.js'
import { zipToolsManager } from '../../utils/zipToolsManager.js'

export interface SteamCMDInstallOptions {
  installPath: string
  onProgress?: (progress: number) => void
  onStatusChange?: (status: string) => void
}

export interface SteamCMDStatus {
  isInstalled: boolean
  version?: string
  installPath?: string
  lastChecked?: string
}

export interface SteamBranchInfo {
  name: string
  description?: string
  buildId?: string
  updatedAt?: string
  requiresPassword: boolean
  isDefault: boolean
}

export class SteamCMDManager {
  private logger: winston.Logger
  private configManager: ConfigManager
  private branchCache = new Map<string, { expiresAt: number; branches: SteamBranchInfo[] }>()
  private branchRequests = new Map<string, Promise<SteamBranchInfo[]>>()
  private readonly WINDOWS_DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'
  private readonly LINUX_DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'

  constructor(logger: winston.Logger, configManager: ConfigManager) {
    this.logger = logger
    this.configManager = configManager
  }

  /**
   * 获取当前SteamCMD状态
   */
  async getStatus(): Promise<SteamCMDStatus> {
    const config = this.configManager.getSteamCMDConfig()

    if (config.installMode === 'manual' && config.installPath) {
      const isInstalled = await this.checkSteamCMDExists(config.installPath)
      return {
        isInstalled,
        installPath: config.installPath,
        lastChecked: new Date().toISOString()
      }
    }

    return {
      isInstalled: config.isInstalled,
      version: config.version,
      installPath: config.installPath,
      lastChecked: config.lastChecked
    }
  }

  /**
   * 检查指定路径下是否存在SteamCMD可执行文件
   */
  async checkSteamCMDExists(installPath: string): Promise<boolean> {
    try {
      // 检查 steamcmd.exe (Windows)
      const exePath = path.join(installPath, 'steamcmd.exe')
      try {
        await fs.access(exePath)
        return true
      } catch { }

      // 检查 steamcmd.sh (Linux/Unix)
      const shPath = path.join(installPath, 'steamcmd.sh')
      try {
        await fs.access(shPath)
        return true
      } catch { }

      return false
    } catch {
      return false
    }
  }

  /**
   * 在线安装SteamCMD
   */
  async installOnline(options: SteamCMDInstallOptions): Promise<void> {
    const { installPath, onProgress, onStatusChange } = options

    try {
      onStatusChange?.('正在准备安装目录...')

      // 确保安装目录存在
      await fs.mkdir(installPath, { recursive: true })

      const isWindows = os.platform() === 'win32'
      const downloadUrl = isWindows ? this.WINDOWS_DOWNLOAD_URL : this.LINUX_DOWNLOAD_URL
      const fileName = isWindows ? 'steamcmd.zip' : 'steamcmd_linux.tar.gz'
      const downloadPath = path.join(installPath, fileName)

      onStatusChange?.('正在下载SteamCMD...')
      this.logger.info(`开始下载SteamCMD: ${downloadUrl}`)

      // 下载文件
      await this.downloadFile(downloadUrl, downloadPath, onProgress)

      // 验证下载的文件是否存在
      try {
        await fs.access(downloadPath)
        const stats = await fs.stat(downloadPath)
        this.logger.info(`下载完成，文件大小: ${stats.size} bytes`)

        if (stats.size === 0) {
          throw new Error('下载的文件为空')
        }
      } catch (error) {
        throw new Error(`下载的文件验证失败: ${error}`)
      }

      onStatusChange?.('正在解压文件...')
      this.logger.info('开始解压SteamCMD')

      // 解压文件
      try {
        if (isWindows) {
          await this.extractZip(downloadPath, installPath)
        } else {
          await this.extractTarGz(downloadPath, installPath)
        }
      } catch (error) {
        this.logger.error('解压过程中发生错误:', error)
        throw new Error(`解压失败: ${error}`)
      }

      // 删除下载的压缩包
      await fs.unlink(downloadPath)

      // 验证安装
      const isInstalled = await this.checkSteamCMDExists(installPath)
      if (!isInstalled) {
        throw new Error('SteamCMD安装验证失败')
      }

      // 更新配置
      await this.configManager.updateSteamCMDConfig({
        installMode: 'online',
        installPath,
        isInstalled: true,
        lastChecked: new Date().toISOString()
      })

      onStatusChange?.('安装完成')
      this.logger.info(`SteamCMD安装完成: ${installPath}`)

    } catch (error) {
      this.logger.error('SteamCMD安装失败:', error)
      throw error
    }
  }

  /**
   * 设置手动安装路径
   */
  async setManualPath(installPath: string): Promise<boolean> {
    try {
      const isInstalled = await this.checkSteamCMDExists(installPath)

      await this.configManager.updateSteamCMDConfig({
        installMode: 'manual',
        installPath,
        isInstalled,
        lastChecked: new Date().toISOString()
      })

      this.logger.info(`SteamCMD手动路径设置: ${installPath}, 状态: ${isInstalled ? '已安装' : '未找到'}`)
      return isInstalled
    } catch (error) {
      this.logger.error('设置SteamCMD手动路径失败:', error)
      throw error
    }
  }

  /**
   * 下载文件
   */
  private async downloadFile(url: string, filePath: string, onProgress?: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(filePath)

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedSize = 0

        response.on('data', (chunk) => {
          downloadedSize += chunk.length
          if (totalSize > 0 && onProgress) {
            const progress = Math.round((downloadedSize / totalSize) * 100)
            onProgress(progress)
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          resolve()
        })

        file.on('error', (error) => {
          fs.unlink(filePath).catch(() => { })
          reject(error)
        })
      }).on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * 解压ZIP文件
   */
  private async extractZip(zipPath: string, extractPath: string): Promise<void> {
    this.logger.info(`开始解压ZIP文件: ${zipPath} -> ${extractPath}`)
    await zipToolsManager.extractZip(zipPath, extractPath)
    this.logger.info('ZIP文件解压完成')
  }

  /**
   * 解压tar.gz文件
   */
  private async extractTarGz(tarPath: string, extractPath: string): Promise<void> {
    try {
      this.logger.info(`开始解压tar.gz文件: ${tarPath} -> ${extractPath}`)

      await tar.extract({
        file: tarPath,
        cwd: extractPath,
        filter: createTarSecurityFilter({ cwd: extractPath }),
        onentry: (entry) => {
          this.logger.debug(`解压文件: ${entry.path}`)
        }
      } as any)

      this.logger.info('tar.gz文件解压完成')
    } catch (error) {
      this.logger.error('tar.gz文件解压失败:', error)
      throw error
    }
  }

  /**
   * 获取SteamCMD可执行文件路径
   */
  async getSteamCMDExecutablePath(): Promise<string | null> {
    const config = this.configManager.getSteamCMDConfig()
    this.logger.info('Getting SteamCMD executable path with config:', { config })

    if (!config.isInstalled || !config.installPath) {
      this.logger.warn('SteamCMD not installed or path not set.', {
        isInstalled: config.isInstalled,
        installPath: config.installPath
      })
      return null
    }

    // 优先检查当前平台对应的可执行文件
    const isWindows = os.platform() === 'win32'
    const primaryExecutable = isWindows ? 'steamcmd.exe' : 'steamcmd.sh'
    const primaryPath = path.join(config.installPath, primaryExecutable)

    // 如果主要可执行文件存在，返回它
    try {
      await fs.access(primaryPath)
      return primaryPath
    } catch (error: any) {
      this.logger.warn('Primary executable not found, checking alternative.', {
        primaryPath,
        error: error.message
      })
    }

    // 否则检查另一个可执行文件
    const alternativeExecutable = isWindows ? 'steamcmd.sh' : 'steamcmd.exe'
    const alternativePath = path.join(config.installPath, alternativeExecutable)

    try {
      await fs.access(alternativePath)
      return alternativePath
    } catch (error: any) {
      this.logger.warn('Alternative executable not found.', {
        alternativePath,
        error: error.message
      })
    }

    return null
  }

  /**
   * 查询Steam应用可用分支
   */
  async getAppBranches(appId: string): Promise<SteamBranchInfo[]> {
    const normalizedAppId = appId.trim()
    if (!/^\d+$/.test(normalizedAppId)) {
      throw new Error('Steam AppID格式无效')
    }

    const cached = this.branchCache.get(normalizedAppId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.branches.map(branch => ({ ...branch }))
    }

    const existingRequest = this.branchRequests.get(normalizedAppId)
    if (existingRequest) return existingRequest

    const request = this.fetchAppBranches(normalizedAppId).then(
      branches => branches.map(branch => ({ ...branch }))
    )
    this.branchRequests.set(normalizedAppId, request)
    try {
      const branches = await request
      this.branchCache.set(normalizedAppId, {
        expiresAt: Date.now() + 5 * 60 * 1000,
        branches
      })
      return branches.map(branch => ({ ...branch }))
    } finally {
      this.branchRequests.delete(normalizedAppId)
    }
  }

  private async fetchAppBranches(appId: string): Promise<SteamBranchInfo[]> {
    const executablePath = await this.getSteamCMDExecutablePath()
    if (!executablePath) {
      throw new Error('SteamCMD未配置')
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const output = await this.runSteamCMDForOutput(executablePath, [
          '+login', 'anonymous',
          '+app_info_request', appId,
          '+app_info_print', appId,
          '+logoff',
          '+quit'
        ])

        const branches = this.parseAppBranches(output, appId)
        if (branches.length > 0) {
          return branches
        }

        this.logger.warn(`第 ${attempt} 次查询Steam应用 ${appId} 分支未返回有效数据`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn(`第 ${attempt} 次查询Steam应用 ${appId} 分支失败: ${message}`)
      }
    }

    throw new Error('未获取到Steam分支信息，部分游戏可能需要使用拥有该游戏的Steam账号查询')
  }

  private async runSteamCMDForOutput(executablePath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child: ChildProcessWithoutNullStreams = spawn(executablePath, args, {
        cwd: path.dirname(executablePath),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let settled = false
      const maxOutputLength = 10 * 1024 * 1024

      const appendOutput = (target: 'stdout' | 'stderr', data: Buffer) => {
        if (target === 'stdout') stdout += data.toString()
        else stderr += data.toString()
        if (stdout.length + stderr.length <= maxOutputLength || settled) return
        settled = true
        clearTimeout(timeout)
        child.kill()
        reject(new Error('Steam分支查询输出过大'))
      }

      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill()
        reject(new Error('查询Steam分支超时'))
      }, 60000)

      child.stdout.on('data', (data: Buffer) => {
        appendOutput('stdout', data)
      })

      child.stderr.on('data', (data: Buffer) => {
        appendOutput('stderr', data)
      })

      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(error)
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)

        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `SteamCMD退出码: ${code}`))
          return
        }

        resolve(stdout)
      })
    })
  }

  private parseAppBranches(output: string, appId: string): SteamBranchInfo[] {
    const appInfoText = this.extractAppInfoVdf(output, appId)
    if (!appInfoText) {
      return []
    }

    try {
      const parsed = parseVdf<Record<string, unknown>>(appInfoText, {
        types: false,
        arrayify: false
      })
      const appData = parsed?.[appId]
      const depots = this.getVdfObject(appData)?.depots
      const branchData = this.getVdfObject(depots)?.branches

      if (!branchData || typeof branchData !== 'object') {
        return []
      }

      return Object.entries(branchData)
        .map(([name, value]) => {
          const data = this.getVdfObject(value) || {}
          const timestamp = Number(data.timeupdated)

          return {
            name,
            description: typeof data.description === 'string' ? data.description : undefined,
            buildId: data.buildid !== undefined ? String(data.buildid) : undefined,
            updatedAt: Number.isFinite(timestamp) && timestamp > 0
              ? new Date(timestamp * 1000).toISOString()
              : undefined,
            requiresPassword: String(data.pwdrequired || '') === '1',
            isDefault: name === 'public'
          }
        })
        .sort((left, right) => {
          if (left.isDefault) return -1
          if (right.isDefault) return 1
          return left.name.localeCompare(right.name)
        })
    } catch (error) {
      this.logger.warn(`解析Steam应用 ${appId} 分支信息失败:`, error)
      return []
    }
  }

  private getVdfObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }

    return value as Record<string, unknown>
  }

  private extractAppInfoVdf(output: string, appId: string): string | null {
    const normalizedOutput = output.replace(/\r\n/g, '\n')
    const key = `"${appId}"`
    let searchIndex = 0

    while (searchIndex < normalizedOutput.length) {
      const keyIndex = normalizedOutput.indexOf(key, searchIndex)
      if (keyIndex === -1) {
        return null
      }

      let cursor = keyIndex + key.length
      while (/\s/.test(normalizedOutput[cursor] || '')) cursor++

      if (normalizedOutput[cursor] !== '{') {
        searchIndex = cursor + 1
        continue
      }

      let depth = 0
      let isQuoted = false
      let isEscaped = false

      for (let index = cursor; index < normalizedOutput.length; index++) {
        const character = normalizedOutput[index]

        if (isQuoted) {
          if (isEscaped) {
            isEscaped = false
          } else if (character === '\\') {
            isEscaped = true
          } else if (character === '"') {
            isQuoted = false
          }
          continue
        }

        if (character === '"') {
          isQuoted = true
        } else if (character === '{') {
          depth++
        } else if (character === '}') {
          depth--
          if (depth === 0) {
            return normalizedOutput.slice(keyIndex, index + 1)
          }
        }
      }

      return null
    }

    return null
  }

  /**
   * 重新检查SteamCMD状态
   */
  async refreshStatus(): Promise<SteamCMDStatus> {
    const config = this.configManager.getSteamCMDConfig()

    if (config.installPath) {
      const isInstalled = await this.checkSteamCMDExists(config.installPath)

      await this.configManager.updateSteamCMDConfig({
        isInstalled,
        lastChecked: new Date().toISOString()
      })

      return {
        isInstalled,
        installPath: config.installPath,
        lastChecked: new Date().toISOString()
      }
    }

    return {
      isInstalled: false
    }
  }
}
