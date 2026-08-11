type TrustProxyOption = boolean | number | string | string[]

/** 解析 GSM4_TRUST_PROXY，过滤 undefined/null 等无效字面量。 */
export function resolveTrustProxy(): TrustProxyOption | undefined {
  const raw = process.env.GSM4_TRUST_PROXY?.trim()
  if (!raw) return undefined

  const lowered = raw.toLowerCase()
  if (lowered === 'true') return true
  if (lowered === 'false') return false

  const hopCount = Number(raw)
  if (Number.isInteger(hopCount) && hopCount >= 0) return hopCount

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== 'undefined' && part !== 'null')

  if (parts.length === 0) return undefined
  return parts.length === 1 ? parts[0] : parts
}
