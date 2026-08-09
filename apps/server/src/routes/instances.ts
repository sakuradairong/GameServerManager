import type { FastifyPluginAsync } from 'fastify'
import { CreateInstanceBodySchema, UpdateInstanceBodySchema } from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { instanceService } from '../modules/instance/InstanceService.js'

export const instanceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/api/v1/instances', async () => ({
    success: true,
    data: instanceService.list(),
  }))

  app.get('/api/v1/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const instance = instanceService.get(id)
    if (!instance) {
      return reply.code(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: '实例不存在',
      })
    }
    return { success: true, data: instance }
  })

  app.post('/api/v1/instances', async (request, reply) => {
    const parsed = CreateInstanceBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '实例参数无效',
        details: parsed.error.flatten(),
      })
    }
    try {
      const instance = await instanceService.create(parsed.data)
      return { success: true, data: instance, message: '创建成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'CREATE_FAILED',
        message: err.message,
      })
    }
  })

  app.patch('/api/v1/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateInstanceBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '更新参数无效',
        details: parsed.error.flatten(),
      })
    }
    try {
      const instance = await instanceService.update(id, parsed.data)
      return { success: true, data: instance, message: '更新成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'UPDATE_FAILED',
        message: err.message,
      })
    }
  })

  app.delete('/api/v1/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await instanceService.remove(id)
      return { success: true, data: { id }, message: '已删除' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'DELETE_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/instances/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const instance = await instanceService.start(id)
      return { success: true, data: instance, message: '已启动' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'START_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/instances/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const instance = await instanceService.stop(id)
      return { success: true, data: instance, message: '已停止' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'STOP_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/instances/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const instance = await instanceService.restart(id)
      return { success: true, data: instance, message: '已重启' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'RESTART_FAILED',
        message: err.message,
      })
    }
  })
}
