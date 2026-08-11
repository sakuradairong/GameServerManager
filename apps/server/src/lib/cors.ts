export function getConfiguredCorsOrigins(): string[] {
  return (process.env.GSM4_CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function isAllowedRealtimeOrigin(
  origin: string | undefined,
  requestHost: string | undefined,
  configuredOrigins = getConfiguredCorsOrigins(),
): boolean {
  if (!origin) return true
  if (configuredOrigins.includes(origin)) return true

  try {
    return Boolean(requestHost && new URL(origin).host === requestHost)
  } catch {
    return false
  }
}
