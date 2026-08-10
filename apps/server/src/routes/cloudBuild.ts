import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { CloudBuildParamsSchema } from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { cloudBuildClient } from '../modules/deploy/cloud/CloudBuildClient.js'

const CatalogQuerySchema = z.object({
  coreType: z.string().trim().min(1).max(64).optional(),
})

const BuildStatusParamsSchema = z.object({
  requestId: z.string().min(1).max(256),
})

const BuildStatusQuerySchema = z.object({
  accessToken: z.string().min(1).max(2048),
})

export const cloudBuildRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/api/cloud-build/catalog', async (request, reply) => {
    const parsed = CatalogQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'coreType 参数无效',
      })
    }
    try {
      const catalog = await cloudBuildClient.getCatalog(parsed.data.coreType)
      return { success: true, data: catalog, message: '获取云构建目录成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 502).send({
        success: false,
        error: 'CLOUD_BUILD_CATALOG_FAILED',
        message: err.message || '获取云构建目录失败',
      })
    }
  })

  app.post('/api/cloud-build/build', async (request, reply) => {
    const parsed = CloudBuildParamsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'coreType、version 和 mcVersion 均为必填项',
      })
    }
    try {
      const task = await cloudBuildClient.createBuild(parsed.data)
      return { success: true, data: task, message: task.message || '云构建任务已提交' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 502).send({
        success: false,
        error: 'CLOUD_BUILD_START_FAILED',
        message: err.message || '创建云构建任务失败',
      })
    }
  })

  app.get('/api/cloud-build/build/:requestId', async (request, reply) => {
    const params = BuildStatusParamsSchema.safeParse(request.params)
    const query = BuildStatusQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'requestId 或 accessToken 参数无效',
      })
    }
    try {
      const status = await cloudBuildClient.getBuildStatus(
        params.data.requestId,
        query.data.accessToken,
      )
      return { success: true, data: status, message: status.message || '查询云构建状态成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 502).send({
        success: false,
        error: 'CLOUD_BUILD_STATUS_FAILED',
        message: err.message || '查询云构建状态失败',
      })
    }
  })
}
