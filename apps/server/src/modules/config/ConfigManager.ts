import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DataManifestSchema, type DataManifest } from '@gsm4/shared'
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

export class ConfigManager {
  private config: Gsm4Config | null = null
  private dataDir: string | null = null

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
      return DataManifestSchema.parse(JSON.parse(raw))
    } catch {
      const manifest: DataManifest = {
        schemaVersion: 4,
        product: 'gsm4',
        createdAt: new Date().toISOString(),
        migratedFrom: null,
      }
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
      return manifest
    }
  }

  async getManifest(): Promise<DataManifest> {
    const manifestPath = path.join(this.getDataDir(), 'manifest.json')
    const raw = await fs.readFile(manifestPath, 'utf8')
    return DataManifestSchema.parse(JSON.parse(raw))
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
    await fs.writeFile(configPath, JSON.stringify(this.getConfig(), null, 2), 'utf8')
  }

  private async loadOrCreateConfig(): Promise<Gsm4Config> {
    const configPath = path.join(this.dataDir!, 'config.json')
    const defaults = await this.defaultConfig()
    try {
      const raw = await fs.readFile(configPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<Gsm4Config>
      const merged: Gsm4Config = {
        ...defaults,
        ...parsed,
        jwt: { ...defaults.jwt, ...parsed.jwt },
        server: { ...defaults.server, ...parsed.server },
        game: { ...defaults.game, ...parsed.game },
        steamcmd: { ...defaults.steamcmd, ...parsed.steamcmd },
        security: { ...defaults.security, ...parsed.security },
      }
      return merged
    } catch {
      await fs.writeFile(configPath, JSON.stringify(defaults, null, 2), 'utf8')
      return defaults
    }
  }
}

export const configManager = new ConfigManager()
