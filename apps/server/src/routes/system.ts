import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../plugins/auth.js'
import { systemService } from '../modules/system/SystemService.js'

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/system/info', { preHandler: requireAuth }, async () => ({
    success: true,
    data: systemService.getInfo(),
  }))

  app.get('/api/v1/system/stats', { preHandler: requireAuth }, async () => ({
    success: true,
    data: await systemService.getStatsWithDisk(),
  }))
}
