import fs from 'node:fs/promises'
import path from 'node:path'
import type { SteamGameInfo } from '@gsm4/shared'
import { resolveDataDir } from '../../lib/paths.js'

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

  async listGames(): Promise<Record<string, SteamGameInfo>> {
    const filePath = await this.getCatalogPath()
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as Record<string, SteamGameInfo>
  }

  async getGame(gameKey: string): Promise<SteamGameInfo | null> {
    const games = await this.listGames()
    return games[gameKey] || null
  }

  async syncFromRemote(remoteUrl?: string): Promise<{ count: number; path: string }> {
    const url =
      remoteUrl ||
      'http://api.gsm.xiaozhuhouses.asia:8082/disk1/GSM3/installgame.json'
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GSM4/4.0' },
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      throw new Error(`同步失败: HTTP ${response.status}`)
    }
    const data = (await response.json()) as Record<string, SteamGameInfo>
    if (!data || typeof data !== 'object') {
      throw new Error('远程目录格式无效')
    }
    const filePath = await this.getCatalogPath()
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    return { count: Object.keys(data).length, path: filePath }
  }
}

export const catalogService = new CatalogService()
