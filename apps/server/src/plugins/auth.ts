import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthTokenPayload } from '@gsm4/shared'
import { authService } from '../modules/auth/AuthService.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthTokenPayload
  }
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export async function authenticateToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const token = extractBearer(request)
    if (!token) {
      await reply.code(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少认证令牌',
      })
      return
    }
    request.authUser = authService.verifyToken(token)
  } catch {
    await reply.code(401).send({
      success: false,
      error: 'UNAUTHORIZED',
      message: '认证令牌无效或已过期',
    })
  }
}

/** Fastify preHandler：未认证时中断后续 handler */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  await authenticateToken(request, reply)
  if (!request.authUser) {
    return reply
  }
}
