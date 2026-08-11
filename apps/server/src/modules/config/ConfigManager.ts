import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DataManifestSchema, type DataManifest } from '@gsm4/shared'
import { z } from 'zod'
import { isFileNotFoundError, writeJsonAtomic } from '../../lib/atomicJson.js'
import { resolveDataDir, resolveRepoRoot } from '../../lib/paths.js'

export interface Gsm4Config {
  jwt: {
    secret: string
    expiresIn: string
  }
  server: {
    host: string
    port: number
  }
  game: {
    defaultInstallPath: string
  }
  steamcmd: {
    path: string
  }
  security: {
    resetTokenOnStartup: boolean
  }
}

const ConfigFileSchema = z
  .object({
    jwt: z
      .object({
        secret: z.string().min(32).optional(),
        expiresIn: z.string().min(1).optional(),
      })
      .optional(),
    server: z
      .object({
        host: z.string().min(1).optional(),
        port: z.number().int().positive().max(65535).optional(),
      })
      .optional(),
    game: z.object({ defaultInstallPath: z.string().min(1).optional() }).optional(),
    steamcmd: z.object({ path: z.string().optional() }).optional(),
    security: z.object({ resetTokenOnStartup: z.boolean().optional() }).optional(),
  })
  .passthrough()

export class ConfigManager {
  private config: Gsm4Config | null = null
  private dataDir: string | null = null
  private manifestCache: DataManifest | null = null

  private async defaultConfig(): Promise<Gsm4Config> {
    const repoRoot = await resolveRepoRoot()
    return {
      jwt: {
        secret: crypto.randomBytes(32).toString('hex'),
        expiresIn: '7d',
      },
      server: {
        host: '0.0.0.0',
        port: Number(process.env.PORT) || 3001,
      },
      game: {
        defaultInstallPath:
          process.env.GSM4_DEFAULT_INSTALL_PATH || path.join(repoRoot, 'games'),
      },
      steamcmd: {
        path: '',
      },
      security: {
        resetTokenOnStartup: false,
      },
    }
  }

  async init(): Promise<void> {
    this.dataDir = await resolveDataDir()
    await fs.mkdir(this.dataDir, { recursive: true })
    await this.ensureManifest()
    this.config = await this.loadOrCreateConfig()
    await fs.mkdir(this.config.game.defaultInstallPath, { recursive: true })
  }

  getConfig(): Gsm4Config {
    if (!this.config) {
      throw new Error('ConfigManager 未初始化')
    }
    return this.config
  }

  getDataDir(): string {
    if (!this.dataDir) {
      throw new Error('ConfigManager 未初始化')
    }
    return this.dataDir
  }

  private async ensureManifest(): Promise<DataManifest> {
    const manifestPath = path.join(this.dataDir!, 'manifest.json')
    try {
      const raw = await fs.readFile(manifestPath, 'utf8')
      this.manifestCache = DataManifestSchema.parse(JSON.parse(raw))
      return this.manifestCache
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw new Error('data/manifest.json 损坏或无法读取', { cause: error })
      }
      const manifest: DataManifest = {
        schemaVersion: 4,
        product: 'gsm4',
        createdAt: new Date().toISOString(),
        migratedFrom: null,
      }
      await writeJsonAtomic(manifestPath, manifest)
      this.manifestCache = manifest
      return manifest
    }
  }

  async getManifest(): Promise<DataManifest> {
    if (this.manifestCache) return this.manifestCache
    const manifestPath = path.join(this.getDataDir(), 'manifest.json')
    const raw = await fs.readFile(manifestPath, 'utf8')
    this.manifestCache = DataManifestSchema.parse(JSON.parse(raw))
    return this.manifestCache
  }

  async updateSettings(input: {
    game?: { defaultInstallPath?: string }
    steamcmd?: { path?: string }
  }): Promise<Gsm4Config> {
    const current = this.getConfig()
    if (input.game?.defaultInstallPath != null) {
      const nextPath = path.resolve(input.game.defaultInstallPath)
      await fs.mkdir(nextPath, { recursive: true })
      current.game.defaultInstallPath = nextPath
    }
    if (input.steamcmd?.path != null) {
      current.steamcmd.path = input.steamcmd.path.trim()
    }
    await this.saveConfig()
    return current
  }

  private async saveConfig(): Promise<void> {
    const configPath = path.join(this.getDataDir(), 'config.json')
    await writeJsonAtomic(configPath, this.getConfig())
  }

  private async loadOrCreateConfig(): Promise<Gsm4Config> {
    const configPath = path.join(this.dataDir!, 'config.json')
    const defaults = await this.defaultConfig()
    let raw: string
    try {
      raw = await fs.readFile(configPath, 'utf8')
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw new Error('data/config.json 无法读取', { cause: error })
      }
      await writeJsonAtomic(configPath, defaults)
      return defaults
    }

    let parsed: z.infer<typeof ConfigFileSchema>
    try {
      parsed = ConfigFileSchema.parse(JSON.parse(raw))
    } catch (error) {
      throw new Error('data/config.json 损坏，已拒绝使用默认配置覆盖', { cause: error })
    }

    const serverHost = parsed.server?.host?.trim()
    const normalizedServer =
      serverHost && serverHost !== 'undefined' && serverHost !== 'null'
        ? { ...defaults.server, ...parsed.server, host: serverHost }
        : { ...defaults.server, ...parsed.server, host: defaults.server.host }

    return {
      ...defaults,
      ...parsed,
      jwt: { ...defaults.jwt, ...parsed.jwt },
      server: normalizedServer,
      game: { ...defaults.game, ...parsed.game },
      steamcmd: { ...defaults.steamcmd, ...parsed.steamcmd },
      security: { ...defaults.security, ...parsed.security },
    }
  }
}

export const configManager = new ConfigManager()
