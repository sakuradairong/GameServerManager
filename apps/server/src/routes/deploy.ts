import type { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import {
  DeployCancelBodySchema,
  DeployRequestSchema,
  DeployUploadKindSchema,
} from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { deployService } from '../modules/deploy/DeployService.js'
import { deployUploadService } from '../modules/deploy/DeployUploadService.js'
import { getDeployPlatform, listAvailableCapabilities } from '../modules/deploy/platform.js'

export const deployRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize: 512 * 1024 * 1024,
    },
  })

  app.addHook('preHandler', requireAuth)

  app.get('/api/v1/deploy/capabilities', async () => ({
    success: true,
    data: {
      platform: getDeployPlatform(),
      capabilities: listAvailableCapabilities(),
    },
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

  app.post('/api/v1/deploy/upload', async (request, reply) => {
    try {
      const query = request.query as { kind?: string }
      const kindParsed = DeployUploadKindSchema.safeParse(query.kind)
      if (!kindParsed.success) {
        return reply.code(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'kind 必须是 minecraft、archive 或 mrpack',
        })
      }

      const file = await request.file()
      if (!file) {
        return reply.code(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: '缺少上传文件',
        })
      }

      const buffer = await file.toBuffer()
      const uploaded = await deployUploadService.save(kindParsed.data, file.filename, buffer)
      return { success: true, data: uploaded, message: '上传成功，可开始部署' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'DEPLOY_UPLOAD_FAILED',
        message: err.message,
      })
    }
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
