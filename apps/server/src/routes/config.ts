import type { FastifyPluginAsync } from 'fastify'
import { UpdateSettingsBodySchema } from '@gsm4/shared'
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

  app.put('/api/v1/config/settings', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = UpdateSettingsBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '设置参数无效',
        details: parsed.error.flatten(),
      })
    }
    try {
      const config = await configManager.updateSettings(parsed.data)
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
        message: '设置已保存',
      }
    } catch (error) {
      const err = error as Error
      return reply.code(500).send({
        success: false,
        error: 'SETTINGS_SAVE_FAILED',
        message: err.message,
      })
    }
  })
}
