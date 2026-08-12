import type { FastifyPluginAsync } from 'fastify'
import { CreateBackupBodySchema, RestoreBackupBodySchema } from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { backupService } from '../modules/backup/BackupService.js'

function sendError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
  fallback: string,
) {
  const err = error as Error & { statusCode?: number }
  return reply.code(err.statusCode ?? 500).send({
    success: false,
    error: fallback,
    message: err.message || '操作失败',
  })
}

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/api/v1/instances/:id/backups', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const data = await backupService.list(id)
      return { success: true, data }
    } catch (error) {
      return sendError(reply, error, 'LIST_FAILED')
    }
  })

  app.post('/api/v1/instances/:id/backups', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = CreateBackupBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '备份参数无效',
        details: parsed.error.flatten(),
      })
    }
    try {
      const data = await backupService.create(id, parsed.data)
      return { success: true, data, message: '备份已创建' }
    } catch (error) {
      return sendError(reply, error, 'CREATE_FAILED')
    }
  })

  app.post('/api/v1/instances/:id/backups/restore', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = RestoreBackupBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '恢复参数无效',
        details: parsed.error.flatten(),
      })
    }
    try {
      const data = await backupService.restore(id, parsed.data)
      return { success: true, data, message: '备份已恢复' }
    } catch (error) {
      return sendError(reply, error, 'RESTORE_FAILED')
    }
  })

  app.delete('/api/v1/instances/:id/backups/:fileName', async (request, reply) => {
    const { id, fileName } = request.params as { id: string; fileName: string }
    try {
      const data = await backupService.deleteFile(id, decodeURIComponent(fileName))
      return { success: true, data, message: '备份文件已删除' }
    } catch (error) {
      return sendError(reply, error, 'DELETE_FAILED')
    }
  })

  app.delete('/api/v1/instances/:id/backups', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await backupService.deleteSet(id)
      return { success: true, data: { id }, message: '备份集已清空' }
    } catch (error) {
      return sendError(reply, error, 'DELETE_SET_FAILED')
    }
  })
}
