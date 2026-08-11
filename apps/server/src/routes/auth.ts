import type { FastifyPluginAsync } from 'fastify'
import { LoginBodySchema, RegisterBodySchema } from '@gsm4/shared'
import { authService } from '../modules/auth/AuthService.js'
import { loginAttemptLimiter } from '../modules/auth/LoginAttemptLimiter.js'
import { resolveClientIp } from '../lib/clientIp.js'
import { requireAuth } from '../plugins/auth.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/auth/status', async () => {
    const hasUsers = await authService.hasUsers()
    return {
      success: true,
      data: {
        initialized: hasUsers,
        registrationOpen: !hasUsers,
      },
    }
  })

  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = RegisterBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '注册参数无效',
        details: parsed.error.flatten(),
      })
    }

    try {
      const result = await authService.register(parsed.data)
      return { success: true, data: result, message: '注册成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'REGISTER_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '登录参数无效',
        details: parsed.error.flatten(),
      })
    }

    const attemptKey = `${resolveClientIp(request)}:${parsed.data.username.trim().toLowerCase()}`
    try {
      loginAttemptLimiter.assertAllowed(attemptKey)
      const result = await authService.login(parsed.data)
      loginAttemptLimiter.clear(attemptKey)
      return { success: true, data: result, message: '登录成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number; retryAfter?: number }
      if (err.statusCode === 401) loginAttemptLimiter.recordFailure(attemptKey)
      if (err.retryAfter) reply.header('Retry-After', String(err.retryAfter))
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'LOGIN_FAILED',
        message: err.message,
      })
    }
  })

  app.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request) => {
    return {
      success: true,
      data: {
        id: request.authUser!.userId,
        username: request.authUser!.username,
        role: request.authUser!.role,
      },
    }
  })
}
