import type { FastifyRequest } from 'fastify'

/** 解析请求客户端 IP，避免 trustProxy 未配置时 `request.ip` 为 undefined。 */
export function resolveClientIp(request: FastifyRequest): string {
  const candidates = [request.ip, request.socket?.remoteAddress]
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0 && value !== 'undefined') {
      return value
    }
  }
  return '127.0.0.1'
}
