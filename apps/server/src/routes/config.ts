import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../plugins/auth.js'
import { configManager } from '../modules/config/ConfigManager.js'

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/config/public', { preHandler: requireAuth }, async () => {
    const config = configManager.getConfig()
    return {
      success: true,
      data: {
        game: {
          defaultInstallPath: config.game.defaultInstallPath,
        },
        steamcmd: {
          configured: Boolean(config.steamcmd.path),
          path: config.steamcmd.path || '',
        },
        server: {
          port: config.server.port,
        },
      },
    }
  })
}
