import type { FastifyPluginAsync } from 'fastify'
import {
  SteamAppIdSchema,
  SteamBranchQueryBodySchema,
  SteamcmdDetectBodySchema,
  SteamcmdInstallBodySchema,
} from '@gsm4/shared'
import { requireAuth } from '../plugins/auth.js'
import { steamCMDManager } from '../modules/steamcmd/SteamCMDManager.js'

export const steamcmdRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/steamcmd/status', { preHandler: requireAuth }, async () => {
    const status = await steamCMDManager.getStatus()
    return { success: true, data: status }
  })

  app.post('/api/v1/steamcmd/install', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = SteamcmdInstallBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '安装参数无效',
        details: parsed.error.flatten(),
      })
    }

    try {
      const result = await steamCMDManager.startOnlineInstall(parsed.data.installPath)
      return {
        success: true,
        data: result,
        message: '已开始一键安装 SteamCMD，进度将通过实时通道推送',
      }
    } catch (error) {
      const err = error as Error
      return reply.code(400).send({
        success: false,
        error: 'STEAMCMD_INSTALL_FAILED',
        message: err.message,
      })
    }
  })

  app.post('/api/v1/steamcmd/detect', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = SteamcmdDetectBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '路径参数无效',
        details: parsed.error.flatten(),
      })
    }

    try {
      const result = await steamCMDManager.detectAndOptionallyApply(
        parsed.data.installPath,
        parsed.data.apply ?? false,
      )
      return {
        success: true,
        data: result,
        message: result.exists
          ? result.applied
            ? '已检测到 SteamCMD 并写入配置'
            : '已检测到 SteamCMD'
          : '未在该路径找到 SteamCMD',
      }
    } catch (error) {
      const err = error as Error
      return reply.code(500).send({
        success: false,
        error: 'STEAMCMD_DETECT_FAILED',
        message: err.message,
      })
    }
  })

  app.post(
    '/api/v1/steamcmd/apps/:appId/branches',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { appId } = request.params as { appId: string }
      const parsedAppId = SteamAppIdSchema.safeParse(appId)
      const parsedBody = SteamBranchQueryBodySchema.safeParse(request.body ?? {})
      if (!parsedAppId.success || !parsedBody.success) {
        return reply.code(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Steam 分支查询参数无效',
          details: {
            appId: parsedAppId.success ? undefined : parsedAppId.error.flatten(),
            body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          },
        })
      }

      try {
        const branches = await steamCMDManager.getAppBranches(
          parsedAppId.data,
          parsedBody.data,
        )
        return { success: true, data: branches }
      } catch (error) {
        const err = error as Error & { statusCode?: number }
        return reply.code(err.statusCode ?? 500).send({
          success: false,
          error: 'STEAM_BRANCH_QUERY_FAILED',
          message: err.message || 'Steam 分支查询失败',
        })
      }
    },
  )
}
