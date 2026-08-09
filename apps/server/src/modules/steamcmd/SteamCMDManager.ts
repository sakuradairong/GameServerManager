import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { SteamcmdStatus } from '@gsm4/shared'
import { downloadFile } from '../../adapters/download/HttpDownloader.js'
import { extractZipArchive } from '../../adapters/archive/ZipExtractor.js'
import { extractTarGzArchive } from '../../adapters/archive/TarExtractor.js'
import { configManager } from '../config/ConfigManager.js'
import { steamcmdInstallBus } from './SteamcmdInstallBus.js'

const WINDOWS_DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'
const LINUX_DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'

export class SteamCMDManager {
  private installing = false
  private progress: number | null = null
  private statusMessage: string | null = null

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

  async startOnlineInstall(installPath?: string): Promise<{ installPath: string }> {
    if (this.installing) {
      throw new Error('SteamCMD 正在安装中，请稍候')
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
