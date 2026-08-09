import type { FastifyPluginAsync } from 'fastify'
import { DeployCancelBodySchema, DeployRequestSchema, DEPLOY_CAPABILITIES } from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { deployService } from '../modules/deploy/DeployService.js'

export const deployRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/api/v1/deploy/capabilities', async () => ({
    success: true,
    data: DEPLOY_CAPABILITIES,
  }))

  app.get('/api/v1/deploy/sessions', async () => ({
    success: true,
    data: deployService.list(),
  }))

  app.get('/api/v1/deploy/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = deployService.get(sessionId)
    if (!session) {
      return reply.code(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: '部署会话不存在',
      })
    }
    return { success: true, data: session }
  })

  app.post('/api/v1/deploy', async (request, reply) => {
    const parsed = DeployRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '部署参数无效',
        details: parsed.error.flatten(),
      })
    }

    try {
      const session = await deployService.start(parsed.data)
      return { success: true, data: session, message: '部署已开始' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'DEPLOY_START_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/deploy/cancel', async (request, reply) => {
    const parsed = DeployCancelBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '取消参数无效',
      })
    }
    try {
      const session = deployService.cancel(parsed.data.sessionId)
      return { success: true, data: session, message: '已请求取消' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'DEPLOY_CANCEL_FAILED',
        message: err.message,
      })
    }
  })
}
