import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../plugins/auth.js'
import { catalogService } from '../modules/deploy/CatalogService.js'

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/api/v1/catalog/steam-games', async () => ({
    success: true,
    data: await catalogService.listGames(),
  }))

  app.post('/api/v1/catalog/steam-games/sync', async (request, reply) => {
    try {
      const body = (request.body || {}) as { url?: string }
      const result = await catalogService.syncFromRemote(body.url)
      return { success: true, data: result, message: '目录已同步' }
    } catch (error) {
      const err = error as Error
      return reply.code(500).send({
        success: false,
        error: 'SYNC_FAILED',
        message: err.message,
      })
    }
  })
}
