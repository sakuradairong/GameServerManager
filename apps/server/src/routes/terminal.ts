import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../plugins/auth.js'
import { terminalService } from '../modules/terminal/TerminalService.js'

export const terminalRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/terminal/sessions', { preHandler: requireAuth }, async () => ({
    success: true,
    data: terminalService.listSessions(),
  }))
}
