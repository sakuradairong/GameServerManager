import fs from 'node:fs/promises'
import path from 'node:path'
import { SteamCatalogSchema, type SteamCatalog, type SteamGameInfo } from '@gsm4/shared'
import { fetchText } from '../../adapters/download/HttpDownloader.js'
import { writeJsonAtomic } from '../../lib/atomicJson.js'
import { resolveDataDir } from '../../lib/paths.js'

const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/sakuradairong/GameServerManager/main/server/data/games/installgame.json'
const MAX_CATALOG_BYTES = 5 * 1024 * 1024

const SAMPLE_CATALOG: Record<string, SteamGameInfo> = {
  palworld: {
    game_nameCN: '幻兽帕鲁',
    appid: '2394010',
    tip: '示例目录项（M2）',
    system_info: ['Windows', 'Linux'],
    login_anonymous: true,
    start_command: {
      Windows: 'PalServer.exe',
      Linux: './PalServer.sh',
    },
  },
  valheim: {
    game_nameCN: '英灵神殿',
    appid: '896660',
    tip: '示例目录项（M2）',
    system_info: ['Windows', 'Linux'],
    login_anonymous: true,
    start_command: {
      Windows: 'valheim_server.exe',
      Linux: './valheim_server.x86_64',
    },
  },
}

export class CatalogService {
  private async catalogPaths(): Promise<string[]> {
    const dataDir = await resolveDataDir()
    const base = process.cwd()
    return [
      path.join(dataDir, 'games', 'installgame.json'),
      path.join(base, 'data', 'games', 'installgame.json'),
      path.join(base, 'server', 'data', 'games', 'installgame.json'),
    ]
  }

  async getCatalogPath(): Promise<string> {
    for (const candidate of await this.catalogPaths()) {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // continue
      }
    }
    const dataDir = await resolveDataDir()
    const target = path.join(dataDir, 'games', 'installgame.json')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, JSON.stringify(SAMPLE_CATALOG, null, 2), 'utf8')
    return target
  }

  async listGames(): Promise<SteamCatalog> {
    const filePath = await this.getCatalogPath()
    const raw = await fs.readFile(filePath, 'utf8')
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch {
      throw new Error('本地 Steam 目录不是有效 JSON')
    }
    return SteamCatalogSchema.parse(parsedJson)
  }

  async getGame(gameKey: string): Promise<SteamGameInfo | null> {
    const games = await this.listGames()
    return games[gameKey] || null
  }

  async syncFromRemote(remoteUrl?: string): Promise<{ count: number; path: string }> {
    const url =
      remoteUrl ||
      process.env.GSM4_STEAM_CATALOG_URL ||
      DEFAULT_CATALOG_URL
    const raw = await fetchText({
      url,
      headers: { 'User-Agent': 'GSM4/4.0' },
      timeoutMs: 30000,
      maxBytes: MAX_CATALOG_BYTES,
      requireHttps: true,
    })
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch {
      throw new Error('远程目录不是有效 JSON')
    }
    const parsed = SteamCatalogSchema.safeParse(parsedJson)
    if (!parsed.success) {
      throw new Error(`远程目录格式无效: ${parsed.error.issues[0]?.message || '未知错误'}`)
    }
    const filePath = await this.getCatalogPath()
    await writeJsonAtomic(filePath, parsed.data)
    return { count: Object.keys(parsed.data).length, path: filePath }
  }
}

export const catalogService = new CatalogService()
