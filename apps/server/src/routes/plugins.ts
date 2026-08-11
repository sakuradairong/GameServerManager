import { createReadStream } from 'node:fs'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { SetPluginEnabledBodySchema } from '@gsm4/shared'
import { pluginManager } from '../modules/plugin/PluginManager.js'
import { requireAdmin, requireAuth } from '../plugins/auth.js'

function sendPluginError(reply: FastifyReply, error: unknown, code: string) {
  const err = error as Error & { statusCode?: number }
  return reply.code(err.statusCode ?? 500).send({
    success: false,
    error: code,
    message: err.message || '插件操作失败',
  })
}

export const pluginRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (api) => {
    api.addHook('preHandler', requireAuth)

    api.get('/api/v1/plugins', async () => ({
      success: true,
      data: pluginManager.list(),
    }))

    api.post('/api/v1/plugins/refresh', async () => ({
      success: true,
      data: await pluginManager.refresh(),
      message: '插件目录已重新扫描',
    }))

    api.post(
      '/api/v1/plugins/example',
      { preHandler: requireAdmin },
      async (_request, reply) => {
        try {
          const plugin = await pluginManager.installOfficialExample()
          return { success: true, data: plugin, message: '官方示例插件已安装' }
        } catch (error) {
          return sendPluginError(reply, error, 'PLUGIN_INSTALL_FAILED')
        }
      },
    )

    api.patch(
      '/api/v1/plugins/:name',
      { preHandler: requireAdmin },
      async (request, reply) => {
        const parsed = SetPluginEnabledBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: '插件状态参数无效',
            details: parsed.error.flatten(),
          })
        }
        try {
          const { name } = request.params as { name: string }
          const plugin = await pluginManager.setEnabled(name, parsed.data.enabled)
          return {
            success: true,
            data: plugin,
            message: parsed.data.enabled ? '插件已启用' : '插件已禁用',
          }
        } catch (error) {
          return sendPluginError(reply, error, 'PLUGIN_UPDATE_FAILED')
        }
      },
    )

    api.delete(
      '/api/v1/plugins/:name',
      { preHandler: requireAdmin },
      async (request, reply) => {
        try {
          const { name } = request.params as { name: string }
          await pluginManager.remove(name)
          return { success: true, data: { name }, message: '插件已卸载' }
        } catch (error) {
          return sendPluginError(reply, error, 'PLUGIN_DELETE_FAILED')
        }
      },
    )
  })

  // 插件界面不接触面板 token，并在无同源权限的 sandbox iframe 内运行。
  app.get('/plugin-ui/:name/*', async (request, reply) => {
    try {
      const params = request.params as { name: string; '*': string }
      const asset = await pluginManager.resolveWebAsset(params.name, params['*'])
      reply
        .type(asset.contentType)
        .header('Cache-Control', asset.cacheControl)
        .header('X-Content-Type-Options', 'nosniff')
      if (asset.contentType.startsWith('text/html')) {
        reply.header(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
        )
      }
      return reply.send(createReadStream(asset.path))
    } catch (error) {
      return sendPluginError(reply, error, 'PLUGIN_ASSET_FAILED')
    }
  })
}
