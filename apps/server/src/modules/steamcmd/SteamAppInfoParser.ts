import { SteamBranchNameSchema, type SteamBranchInfo } from '@gsm4/shared'

type VdfValue = string | VdfObject
interface VdfObject {
  [key: string]: VdfValue
}

function tokenizeVdf(source: string): string[] {
  const tokens: string[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if (/\s/u.test(char)) {
      index += 1
      continue
    }
    if (char === '{' || char === '}') {
      tokens.push(char)
      index += 1
      continue
    }
    if (char === '"') {
      index += 1
      let value = ''
      let escaped = false
      while (index < source.length) {
        const current = source[index]
        index += 1
        if (escaped) {
          value += current === 'n' ? '\n' : current === 't' ? '\t' : current
          escaped = false
          continue
        }
        if (current === '\\') {
          escaped = true
          continue
        }
        if (current === '"') break
        value += current
      }
      tokens.push(value)
      continue
    }

    const start = index
    while (index < source.length && !/[\s{}]/u.test(source[index])) index += 1
    tokens.push(source.slice(start, index))
  }

  return tokens
}

function parseVdfObject(tokens: string[], state: { index: number }, wrapped = false): VdfObject {
  const result: VdfObject = {}

  while (state.index < tokens.length) {
    const key = tokens[state.index]
    if (key === '}') {
      if (!wrapped) throw new Error('VDF 包含多余的结束括号')
      state.index += 1
      return result
    }
    if (key === '{') throw new Error('VDF 键名无效')
    state.index += 1

    const value = tokens[state.index]
    if (value === undefined || value === '}') throw new Error(`VDF 键 ${key} 缺少值`)
    if (value === '{') {
      state.index += 1
      result[key] = parseVdfObject(tokens, state, true)
    } else {
      state.index += 1
      result[key] = value
    }
  }

  if (wrapped) throw new Error('VDF 对象未闭合')
  return result
}

function parseVdf(source: string): VdfObject {
  const tokens = tokenizeVdf(source)
  return parseVdfObject(tokens, { index: 0 })
}

function getObject(value: VdfValue | undefined): VdfObject | null {
  return value && typeof value === 'object' ? value : null
}

function extractAppInfoBlocks(output: string, appId: string): string[] {
  const normalized = output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/\r\n/gu, '\n')
  const key = `"${appId}"`
  const blocks: string[] = []
  let searchIndex = 0

  while (searchIndex < normalized.length) {
    const keyIndex = normalized.indexOf(key, searchIndex)
    if (keyIndex < 0) break
    const braceStart = normalized.indexOf('{', keyIndex + key.length)
    if (braceStart < 0) break

    let depth = 0
    let quoted = false
    let escaped = false
    let blockEnd = -1
    for (let index = braceStart; index < normalized.length; index += 1) {
      const char = normalized[index]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          blockEnd = index + 1
          break
        }
      }
    }

    if (blockEnd < 0) break
    blocks.push(normalized.slice(keyIndex, blockEnd))
    searchIndex = blockEnd
  }

  return blocks
}

export function parseSteamAppBranches(output: string, appId: string): SteamBranchInfo[] {
  const candidates = extractAppInfoBlocks(output, appId)

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = parseVdf(candidates[index])
      const appData = getObject(parsed[appId])
      const depots = getObject(appData?.depots)
      const branches = getObject(depots?.branches)
      if (!branches) continue

      const result = Object.entries(branches)
        .flatMap(([name, value]) => {
          const parsedName = SteamBranchNameSchema.safeParse(name)
          const data = getObject(value)
          if (!parsedName.success || !data) return []

          const timestamp = Number(data.timeupdated ?? data.timebuildupdated)
          const timestampMilliseconds = timestamp * 1000
          return [
            {
              name: parsedName.data,
              description:
                typeof data.description === 'string' ? data.description : undefined,
              buildId: data.buildid === undefined ? undefined : String(data.buildid),
              updatedAt:
                Number.isFinite(timestampMilliseconds) &&
                timestampMilliseconds > 0 &&
                timestampMilliseconds <= 8.64e15
                  ? new Date(timestampMilliseconds).toISOString()
                  : undefined,
              requiresPassword: String(data.pwdrequired || '') === '1',
              isDefault: parsedName.data === 'public',
            } satisfies SteamBranchInfo,
          ]
        })
        .sort((left, right) => {
          if (left.isDefault) return -1
          if (right.isDefault) return 1
          return left.name.localeCompare(right.name)
        })

      if (result.length > 0) return result
    } catch {
      // SteamCMD may print partial app info before the final complete block.
    }
  }

  return []
}
