import Fastify from 'fastify'
import cors from '@fastify/cors'
import { configManager } from './modules/config/ConfigManager.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { configRoutes } from './routes/config.js'

async function main() {
  await configManager.init()
  const config = configManager.getConfig()

  const app = Fastify({
    logger: true,
  })

  await app.register(cors, {
    origin: true,
    credentials: true,
  })

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(configRoutes)

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    const err = error as { statusCode?: number; message?: string }
    reply.code(err.statusCode ?? 500).send({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || '服务器内部错误',
    })
  })

  await app.listen({
    host: config.server.host,
    port: config.server.port,
  })

  app.log.info(`GSM4 server listening on ${config.server.host}:${config.server.port}`)
}

main().catch((error) => {
  console.error('Failed to start GSM4 server', error)
  process.exit(1)
})
