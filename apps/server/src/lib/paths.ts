import fs from 'node:fs/promises'
import path from 'node:path'

async function directoryExists(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/** 从 cwd 向上查找已有 data/，兼容根目录启动与 apps/server 启动 */
export async function resolveDataDir(): Promise<string> {
  if (process.env.GSM4_DATA_DIR) {
    await fs.mkdir(process.env.GSM4_DATA_DIR, { recursive: true })
    return process.env.GSM4_DATA_DIR
  }

  let current = process.cwd()
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(current, 'data')
    if (await directoryExists(candidate)) {
      return candidate
    }

    // monorepo 根：存在 workspaces 的 package.json
    try {
      const pkgRaw = await fs.readFile(path.join(current, 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgRaw) as { name?: string; workspaces?: unknown }
      if (pkg.name === 'gsm4' || pkg.workspaces) {
        await fs.mkdir(candidate, { recursive: true })
        return candidate
      }
    } catch {
      // continue walking
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  const fallback = path.join(process.cwd(), 'data')
  await fs.mkdir(fallback, { recursive: true })
  return fallback
}

export async function resolveDataFile(relativePath: string): Promise<string> {
  const dataDir = await resolveDataDir()
  return path.join(dataDir, relativePath)
}

/** 解析 monorepo 根目录（含 name=gsm4 的 package.json） */
export async function resolveRepoRoot(): Promise<string> {
  let current = process.cwd()
  for (let i = 0; i < 5; i += 1) {
    try {
      const pkgRaw = await fs.readFile(path.join(current, 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgRaw) as { name?: string; workspaces?: unknown }
      if (pkg.name === 'gsm4' || pkg.workspaces) {
        return current
      }
    } catch {
      // continue
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return process.cwd()
}
