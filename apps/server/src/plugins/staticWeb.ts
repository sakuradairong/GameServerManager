import fs from 'node:fs'
import path from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import fastifyStatic from '@fastify/static'

function resolveWebDist(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), '../../apps/web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), 'dist/web'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate
    }
  }
  return null
}

export const staticWebPlugin: FastifyPluginAsync = async (app) => {
  const webDist = resolveWebDist()
  if (!webDist) {
    app.log.warn('未找到 apps/web/dist，跳过静态资源托管（开发模式请使用 Vite）')
    return
  }

  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    wildcard: false,
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
      return reply.code(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: '接口不存在',
      })
    }
    return reply.sendFile('index.html')
  })

  app.log.info(`Serving web UI from ${webDist}`)
}
