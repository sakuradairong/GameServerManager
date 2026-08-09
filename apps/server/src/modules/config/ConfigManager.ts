import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DataManifestSchema, type DataManifest } from '@gsm4/shared'
import { resolveDataDir } from '../../lib/paths.js'

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
  security: {
    resetTokenOnStartup: boolean
  }
}

const DEFAULT_CONFIG = (): Gsm4Config => ({
  jwt: {
    secret: crypto.randomBytes(32).toString('hex'),
    expiresIn: '7d',
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3001,
  },
  game: {
    defaultInstallPath: path.join(process.cwd(), 'games'),
  },
  security: {
    resetTokenOnStartup: false,
  },
})

export class ConfigManager {
  private config: Gsm4Config | null = null
  private dataDir: string | null = null

  async init(): Promise<void> {
    this.dataDir = await resolveDataDir()
    await fs.mkdir(this.dataDir, { recursive: true })
    await this.ensureManifest()
    this.config = await this.loadOrCreateConfig()
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

  private async loadOrCreateConfig(): Promise<Gsm4Config> {
    const configPath = path.join(this.dataDir!, 'config.json')
    try {
      const raw = await fs.readFile(configPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<Gsm4Config>
      const merged: Gsm4Config = {
        ...DEFAULT_CONFIG(),
        ...parsed,
        jwt: { ...DEFAULT_CONFIG().jwt, ...parsed.jwt },
        server: { ...DEFAULT_CONFIG().server, ...parsed.server },
        game: { ...DEFAULT_CONFIG().game, ...parsed.game },
        security: { ...DEFAULT_CONFIG().security, ...parsed.security },
      }
      return merged
    } catch {
      const config = DEFAULT_CONFIG()
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
      return config
    }
  }
}

export const configManager = new ConfigManager()
