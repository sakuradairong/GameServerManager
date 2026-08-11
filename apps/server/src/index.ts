import type { Server as HttpServer } from 'node:http'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { configManager } from './modules/config/ConfigManager.js'
import { instanceService } from './modules/instance/InstanceService.js'
import { deployUploadService } from './modules/deploy/DeployUploadService.js'
import { pluginManager } from './modules/plugin/PluginManager.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { configRoutes } from './routes/config.js'
import { systemRoutes } from './routes/system.js'
import { instanceRoutes } from './routes/instances.js'
import { terminalRoutes } from './routes/terminal.js'
import { deployRoutes } from './routes/deploy.js'
import { catalogRoutes } from './routes/catalog.js'
import { fileRoutes } from './routes/files.js'
import { steamcmdRoutes } from './routes/steamcmd.js'
import { pluginRoutes } from './routes/plugins.js'
import { staticWebPlugin } from './plugins/staticWeb.js'
import { setupRealtime } from './socket/realtime.js'
import { getConfiguredCorsOrigins } from './lib/cors.js'
import { resolveTrustProxy } from './lib/trustProxy.js'

async function main() {
  await configManager.init()
  await deployUploadService.init()
  await instanceService.init()
  await pluginManager.init()
  const config = configManager.getConfig()

  const trustProxy = resolveTrustProxy()
  const app = Fastify({
    logger: true,
    ...(trustProxy !== undefined ? { trustProxy } : {}),
  })

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    if (!body || body.length === 0) {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  const corsOrigins = getConfiguredCorsOrigins()
  if (corsOrigins.length > 0) {
    await app.register(cors, {
      origin: corsOrigins,
      credentials: true,
    })
  }

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(configRoutes)
  await app.register(systemRoutes)
  await app.register(instanceRoutes)
  await app.register(terminalRoutes)
  await app.register(deployRoutes)
  await app.register(catalogRoutes)
  await app.register(fileRoutes)
  await app.register(steamcmdRoutes)
  await app.register(pluginRoutes)

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    const err = error as { statusCode?: number; message?: string }
    reply.code(err.statusCode ?? 500).send({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || '服务器内部错误',
    })
  })

  // 静态站最后注册，避免挡住 /api
  await app.register(staticWebPlugin)

  await app.listen({
    host: config.server.host,
    port: config.server.port,
  })

  setupRealtime(app.server as HttpServer)

  app.log.info(`GSM4 listening on http://${config.server.host}:${config.server.port}`)
}

main().catch((error) => {
  console.error('Failed to start GSM4 server', error)
  process.exit(1)
})
