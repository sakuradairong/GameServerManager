import type { FastifyPluginAsync } from 'fastify'
import { configManager } from '../modules/config/ConfigManager.js'

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/health', async () => {
    const manifest = await configManager.getManifest()
    return {
      success: true,
      data: {
        status: 'ok' as const,
        product: 'gsm4' as const,
        version: '4.0.0-rc.1',
        schemaVersion: manifest.schemaVersion,
      },
    }
  })
}
