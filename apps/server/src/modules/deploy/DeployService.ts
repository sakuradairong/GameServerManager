import crypto from 'node:crypto'
import type {
  DeployRequest,
  DeploySessionSummary,
  DeployStatus,
  InstanceType,
  SteamDeployRequest,
  SteamUpdateBody,
} from '@gsm4/shared'
import { DeployRequestSchema } from '@gsm4/shared'
import { instanceService } from '../instance/InstanceService.js'
import { progressBus } from './ProgressBus.js'
import { resolveInstallPath } from './pathPolicy.js'
import { assertCapabilityAvailable } from './platform.js'
import { archiveExecutor } from './executors/archiveExecutor.js'
import { minecraftExecutor } from './executors/minecraftExecutor.js'
import { steamcmdExecutor } from './executors/steamcmdExecutor.js'
import { bedrockExecutor } from './executors/bedrockExecutor.js'
import { tmodloaderExecutor } from './executors/tmodloaderExecutor.js'
import { mrpackExecutor } from './executors/mrpackExecutor.js'
import type { DeployExecutor } from './executors/types.js'

interface LiveSession extends DeploySessionSummary {
  controller: AbortController
  request: DeployRequest
  /** create：新建实例部署；update：对已存在 Steam 实例更新/切分支 */
  kind: 'create' | 'update'
  /** update 模式下的目标分支，成功后写回实例 steam.branch */
  steamTargetBranch?: string
}

const executors: Record<DeployRequest['type'], DeployExecutor> = {
  archive: archiveExecutor,
  minecraft: minecraftExecutor,
  steamcmd: steamcmdExecutor,
  bedrock: bedrockExecutor,
  tmodloader: tmodloaderExecutor,
  mrpack: mrpackExecutor,
}

function resolveInstanceType(type: DeployRequest['type']): InstanceType {
  switch (type) {
    case 'steamcmd':
      return 'steam'
    case 'minecraft':
      return 'minecraft'
    case 'archive':
      return 'archive'
    case 'bedrock':
      return 'bedrock'
    case 'tmodloader':
      return 'tmodloader'
    case 'mrpack':
      return 'mrpack'
    default:
      return 'generic'
  }
}

export class DeployService {
  private sessions = new Map<string, LiveSession>()

  list(): DeploySessionSummary[] {
    return [...this.sessions.values()].map((session) => this.toSummary(session))
  }

  get(sessionId: string): DeploySessionSummary | undefined {
    const session = this.sessions.get(sessionId)
    return session ? this.toSummary(session) : undefined
  }

  async start(raw: unknown): Promise<DeploySessionSummary> {
    const request = DeployRequestSchema.parse(raw)
    assertCapabilityAvailable(request.type)

    const installName =
      request.type === 'steamcmd'
        ? request.installName || request.gameKey
        : request.installName

    const installPath = resolveInstallPath({
      installName,
      customInstallPath: request.customInstallPath,
      allowCustomPath: Boolean(request.allowCustomPath),
    })

    const sessionId = crypto.randomUUID()
    const now = new Date().toISOString()

    const draft = await instanceService.createFromDeploy({
      name: request.instanceName,
      workingDirectory: installPath,
      startCommand: 'pending',
      description: `deploy:${request.type}`,
      instanceType: resolveInstanceType(request.type),
      steam:
        request.type === 'steamcmd'
          ? {
              appId: request.appId,
              gameKey: request.gameKey,
              branch: request.branch || 'public',
            }
          : undefined,
    })

    const controller = new AbortController()
    const session: LiveSession = {
      sessionId,
      type: request.type,
      status: 'queued',
      instanceId: draft.id,
      installPath,
      createdAt: now,
      updatedAt: now,
      controller,
      request,
      kind: 'create',
    }
    this.sessions.set(sessionId, session)

    void this.runSession(session)
    return this.toSummary(session)
  }

  /**
   * 对已存在的 Steam 实例执行更新 / 分支切换。
   * 复用 steamcmd 执行器与 deploy:* 进度事件，不新建实例、不改动启动命令。
   */
  async startSteamUpdate(instanceId: string, body: SteamUpdateBody): Promise<DeploySessionSummary> {
    const instance = instanceService.get(instanceId)
    if (!instance) {
      throw Object.assign(new Error('实例不存在'), { statusCode: 404 })
    }
    if (instance.instanceType !== 'steam' || !instance.steam?.appId) {
      throw Object.assign(new Error('该实例不是 Steam 实例，无法更新'), { statusCode: 400 })
    }
    assertCapabilityAvailable('steamcmd')

    const targetBranch = (body.branch && body.branch.trim()) || instance.steam.branch || 'public'
    const request: SteamDeployRequest = {
      type: 'steamcmd',
      appId: instance.steam.appId,
      gameKey: instance.steam.gameKey || instance.name,
      instanceName: instance.name,
      branch: targetBranch,
      betaPassword: body.betaPassword,
      anonymous: body.anonymous,
      steamUsername: body.steamUsername,
      steamPassword: body.steamPassword,
    }

    // 加锁（运行中/锁定会抛错），确保不会与启停或另一次更新并发
    instanceService.beginSteamUpdate(instanceId)

    const sessionId = crypto.randomUUID()
    const now = new Date().toISOString()
    const session: LiveSession = {
      sessionId,
      type: 'steamcmd',
      status: 'queued',
      instanceId,
      installPath: instance.workingDirectory,
      createdAt: now,
      updatedAt: now,
      controller: new AbortController(),
      request,
      kind: 'update',
      steamTargetBranch: targetBranch,
    }
    this.sessions.set(sessionId, session)

    void this.runSession(session)
    return this.toSummary(session)
  }

  cancel(sessionId: string): DeploySessionSummary {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw Object.assign(new Error('部署会话不存在'), { statusCode: 404 })
    }
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      return this.toSummary(session)
    }
    session.status = 'cancelling'
    session.updatedAt = new Date().toISOString()
    session.controller.abort()
    progressBus.emitLog({
      sessionId,
      line: '正在取消部署…',
      level: 'warn',
    })
    return this.toSummary(session)
  }

  private async runSession(session: LiveSession) {
    this.patch(session, { status: 'running' })
    progressBus.emitProgress({
      sessionId: session.sessionId,
      percent: 1,
      stage: 'start',
      message: '部署开始',
    })

    try {
      const executor = executors[session.request.type]
      const result = await executor.run({
        sessionId: session.sessionId,
        request: session.request,
        installPath: session.installPath!,
        instanceId: session.instanceId!,
        signal: session.controller.signal,
        bus: progressBus,
        setTerminalSessionId: (terminalSessionId) => {
          this.patch(session, { terminalSessionId })
        },
      })

      if (session.controller.signal.aborted) {
        throw new Error('部署已取消')
      }

      if (session.kind === 'update') {
        // 更新模式：写回分支，保留实例与原启动命令
        await instanceService.commitSteamUpdate(session.instanceId!, {
          branch: session.steamTargetBranch,
        })
        this.patch(session, { status: 'completed' })
      } else {
        if (result.workingDirectory) {
          this.patch(session, { installPath: result.workingDirectory })
        }

        await instanceService.finalizeDeploy(session.instanceId!, {
          startCommand: result.startCommand,
          terminalSessionId: result.terminalSessionId,
          workingDirectory: result.workingDirectory || session.installPath,
        })

        this.patch(session, {
          status: 'completed',
          terminalSessionId: result.terminalSessionId,
        })
      }
      progressBus.emitProgress({
        sessionId: session.sessionId,
        percent: 100,
        stage: 'done',
        message: '部署完成',
      })
      progressBus.emitComplete(this.toSummary(session))
    } catch (error) {
      const message = error instanceof Error ? error.message : '部署失败'
      const cancelled = session.controller.signal.aborted || message.includes('取消')
      const status: DeployStatus = cancelled ? 'cancelled' : 'failed'

      if (session.instanceId) {
        if (session.kind === 'update') {
          // 更新失败/取消：解锁并保留实例（分支不变）
          await instanceService
            .releaseSteamUpdate(session.instanceId, cancelled ? undefined : message)
            .catch(() => undefined)
        } else {
          await instanceService.rollbackDeploy(session.instanceId).catch(() => undefined)
        }
      }

      this.patch(session, {
        status,
        error: message,
        // 更新模式实例仍存在，保留 instanceId；新建模式失败已回滚删除
        instanceId: session.kind === 'update' ? session.instanceId : undefined,
      })
      progressBus.emitError(session.sessionId, message)
      progressBus.emitLog({
        sessionId: session.sessionId,
        line: message,
        level: 'error',
      })
    }
  }

  private patch(session: LiveSession, patch: Partial<DeploySessionSummary>) {
    Object.assign(session, patch, { updatedAt: new Date().toISOString() })
  }

  private toSummary(session: LiveSession): DeploySessionSummary {
    return {
      sessionId: session.sessionId,
      type: session.type,
      status: session.status,
      instanceId: session.instanceId,
      installPath: session.installPath,
      terminalSessionId: session.terminalSessionId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      error: session.error,
    }
  }
}

export const deployService = new DeployService()
