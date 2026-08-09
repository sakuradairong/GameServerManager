import type { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import {
  FileDeleteBodySchema,
  FileMkdirBodySchema,
  FileWriteBodySchema,
} from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { fileService } from '../modules/files/FileService.js'

export const fileRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024,
    },
  })

  app.addHook('preHandler', requireAuth)

  app.get('/api/v1/files', async (request, reply) => {
    const query = request.query as { path?: string }
    try {
      return { success: true, data: await fileService.list(query.path || '') }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'FILE_LIST_FAILED',
        message: err.message,
      })
    }
  })

  app.get('/api/v1/files/read', async (request, reply) => {
    const query = request.query as { path?: string }
    if (!query.path) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '缺少 path',
      })
    }
    try {
      return { success: true, data: await fileService.read(query.path) }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'FILE_READ_FAILED',
        message: err.message,
      })
    }
  })

  app.put('/api/v1/files/write', async (request, reply) => {
    const parsed = FileWriteBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '写入参数无效',
      })
    }
    try {
      await fileService.write(parsed.data.path, parsed.data.content)
      return { success: true, data: { path: parsed.data.path }, message: '已保存' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'FILE_WRITE_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/files/mkdir', async (request, reply) => {
    const parsed = FileMkdirBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '目录参数无效',
      })
    }
    try {
      await fileService.mkdir(parsed.data.path)
      return { success: true, data: { path: parsed.data.path }, message: '目录已创建' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'FILE_MKDIR_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/files/delete', async (request, reply) => {
    const parsed = FileDeleteBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '删除参数无效',
      })
    }
    try {
      await fileService.remove(parsed.data.path)
      return { success: true, data: { path: parsed.data.path }, message: '已删除' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'FILE_DELETE_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/files/upload', async (request, reply) => {
    try {
      const query = request.query as { dir?: string }
      const file = await request.file()
      if (!file) {
        return reply.code(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: '缺少上传文件',
        })
      }
      const buffer = await file.toBuffer()
      const saved = await fileService.saveUpload(query.dir || '', file.filename, buffer)
      return { success: true, data: saved, message: '上传成功' }
    } catch (error) {
      const err = error as Error & { statusCode?: number }
      return reply.code(err.statusCode ?? 500).send({
        success: false,
        error: 'FILE_UPLOAD_FAILED',
        message: err.message,
      })
    }
  })
}
