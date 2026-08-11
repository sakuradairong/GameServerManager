import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CreateInstanceBodySchema,
  InstanceSchema,
  UpdateInstanceBodySchema,
  type CreateInstanceBody,
  type Instance,
  type InstanceSteamMeta,
  type InstanceType,
  type UpdateInstanceBody,
} from '@gsm4/shared'
import { isFileNotFoundError, writeJsonAtomic } from '../../lib/atomicJson.js'
import { configManager } from '../config/ConfigManager.js'
import { terminalService } from '../terminal/TerminalService.js'

export class InstanceService {
  private instances = new Map<string, Instance>()
  private locks = new Set<string>()
  private loaded = false
  private persistQueue: Promise<void> = Promise.resolve()

  private filePath() {
    return path.join(configManager.getDataDir(), 'instances.json')
  }

  async init() {
    if (this.loaded) return
    let raw: string
    try {
      raw = await fs.readFile(this.filePath(), 'utf8')
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw new Error('data/instances.json 无法读取', { cause: error })
      }
      await this.persist()
      this.loaded = true
      return
    }

    try {
      const parsed = JSON.parse(raw) as { instances?: Array<Record<string, unknown>> }
      if (!Array.isArray(parsed.instances)) {
        throw new Error('instances 字段必须是数组')
      }
      let migratedLegacyCloudType = false
      const restored = parsed.instances.map((item) => {
        let instanceType = item.instanceType
        if (instanceType === 'cloud') {
          migratedLegacyCloudType = true
          instanceType = 'generic'
        }
        return InstanceSchema.parse({
          ...item,
          // 云构建能力已删除；保留已有实例，但迁移为普通实例。
          instanceType,
          // 进程随面板重启结束
          status: item.status === 'running' || item.status === 'starting' ? 'stopped' : item.status,
          pid: undefined,
          terminalSessionId: undefined,
        })
      })
      for (const instance of restored) {
        this.instances.set(instance.id, instance)
      }
      if (migratedLegacyCloudType) await this.persist()
    } catch (error) {
      throw new Error('data/instances.json 损坏，已拒绝覆盖原文件', { cause: error })
    }
    this.loaded = true
  }

  list(): Instance[] {
    return [...this.instances.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
  }

  get(id: string): Instance | undefined {
    return this.instances.get(id)
  }

  async create(body: CreateInstanceBody): Promise<Instance> {
    const parsed = CreateInstanceBodySchema.parse(body)
    await this.assertDirectory(parsed.workingDirectory)

    const instance: Instance = {
      id: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description || '',
      workingDirectory: parsed.workingDirectory,
      startCommand: parsed.startCommand,
      stopCommand: parsed.stopCommand || 'ctrl+c',
      autoStart: parsed.autoStart || false,
      status: 'stopped',
      instanceType: 'generic',
      createdAt: new Date().toISOString(),
    }

    this.instances.set(instance.id, instance)
    await this.persist()
    return instance
  }

  async createFromDeploy(input: {
    name: string
    workingDirectory: string
    startCommand: string
    description?: string
    instanceType?: InstanceType
    steam?: InstanceSteamMeta
  }): Promise<Instance> {
    await fs.mkdir(input.workingDirectory, { recursive: true })
    const instance: Instance = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description || '',
      workingDirectory: input.workingDirectory,
      startCommand: input.startCommand,
      stopCommand: 'ctrl+c',
      autoStart: false,
      status: 'stopped',
      instanceType: input.instanceType || 'generic',
      steam: input.steam,
      createdAt: new Date().toISOString(),
    }
    this.instances.set(instance.id, instance)
    this.locks.add(instance.id)
    await this.persist()
    return instance
  }

  async finalizeDeploy(id: string, patch?: Partial<Instance>): Promise<Instance> {
    const current = this.require(id)
    const next = { ...current, ...patch, status: 'stopped' as const }
    this.instances.set(id, next)
    this.locks.delete(id)
    await this.persist()
    return next
  }

  async rollbackDeploy(id: string): Promise<void> {
    this.locks.delete(id)
    this.instances.delete(id)
    await this.persist()
  }

  isLocked(id: string) {
    return this.locks.has(id)
  }

  /**
   * 获取维护锁（备份/恢复等）。调用方必须在 finally 中 releaseLock。
   * 要求实例已停止且未被其它操作锁定。
   */
  acquireLock(id: string): Instance {
    const instance = this.require(id)
    if (this.locks.has(id)) {
      throw Object.assign(new Error('实例正在执行其它操作'), { statusCode: 409 })
    }
    if (instance.status === 'running' || instance.status === 'starting') {
      throw Object.assign(new Error('请先停止实例'), { statusCode: 409 })
    }
    this.locks.add(id)
    return instance
  }

  releaseLock(id: string) {
    this.locks.delete(id)
  }

  /** 开始一次 Steam 更新/分支切换：校验为 Steam 实例且空闲，加锁。 */
  beginSteamUpdate(id: string): Instance {
    const instance = this.require(id)
    if (instance.instanceType !== 'steam' || !instance.steam?.appId) {
      throw Object.assign(new Error('该实例不是 Steam 实例，无法更新'), { statusCode: 400 })
    }
    if (this.locks.has(id) || instance.status === 'running' || instance.status === 'starting') {
      throw Object.assign(new Error('实例运行中或操作锁定，无法更新'), { statusCode: 409 })
    }
    this.locks.add(id)
    return instance
  }

  /** Steam 更新成功：持久化新分支，解锁；不改动启动命令。 */
  async commitSteamUpdate(id: string, patch: { branch?: string }): Promise<Instance> {
    const current = this.require(id)
    const next: Instance = {
      ...current,
      status: 'stopped',
      errorMessage: undefined,
      steam: current.steam
        ? { ...current.steam, branch: patch.branch ?? current.steam.branch }
        : current.steam,
    }
    this.instances.set(id, next)
    this.locks.delete(id)
    await this.persist()
    return next
  }

  /** Steam 更新失败/取消：解锁并保留实例，记录错误信息。 */
  async releaseSteamUpdate(id: string, errorMessage?: string): Promise<void> {
    this.locks.delete(id)
    const current = this.instances.get(id)
    if (current) {
      current.errorMessage = errorMessage
      await this.persist()
    }
  }

  async update(id: string, body: UpdateInstanceBody): Promise<Instance> {
    const current = this.require(id)
    if (this.locks.has(id) || current.status === 'running' || current.status === 'starting') {
      throw Object.assign(new Error('实例运行中或操作锁定，无法编辑'), { statusCode: 409 })
    }

    const parsed = UpdateInstanceBodySchema.parse(body)
    if (parsed.workingDirectory) {
      await this.assertDirectory(parsed.workingDirectory)
    }

    const next: Instance = {
      ...current,
      ...parsed,
      description: parsed.description ?? current.description,
    }
    this.instances.set(id, next)
    await this.persist()
    return next
  }

  async remove(id: string): Promise<void> {
    const current = this.require(id)
    if (current.status === 'running' || current.status === 'starting' || this.locks.has(id)) {
      throw Object.assign(new Error('请先停止实例再删除'), { statusCode: 409 })
    }
    this.instances.delete(id)
    await this.persist()
  }

  async start(id: string): Promise<Instance> {
    const instance = this.require(id)
    if (this.locks.has(id)) {
      throw Object.assign(new Error('实例正在执行其它操作'), { statusCode: 409 })
    }

    this.locks.add(id)
    try {
      return await this.startLocked(instance)
    } finally {
      this.locks.delete(id)
    }
  }

  async stop(id: string): Promise<Instance> {
    const instance = this.require(id)
    if (this.locks.has(id)) {
      throw Object.assign(new Error('实例正在执行其它操作'), { statusCode: 409 })
    }
    if (instance.status !== 'running' && instance.status !== 'starting') {
      return instance
    }

    this.locks.add(id)
    try {
      return await this.stopLocked(instance)
    } finally {
      this.locks.delete(id)
    }
  }

  async restart(id: string): Promise<Instance> {
    const instance = this.require(id)
    if (this.locks.has(id)) {
      throw Object.assign(new Error('实例正在执行其它操作'), { statusCode: 409 })
    }
    this.locks.add(id)
    try {
      await this.stopLocked(instance)
      return await this.startLocked(instance)
    } finally {
      this.locks.delete(id)
    }
  }

  /** 终端退出时同步实例状态 */
  async handleTerminalExit(sessionId: string) {
    for (const instance of this.instances.values()) {
      if (instance.terminalSessionId !== sessionId) continue
      if (instance.status === 'stopping') continue
      instance.status = 'stopped'
      instance.pid = undefined
      instance.terminalSessionId = undefined
      instance.lastStopped = new Date().toISOString()
      await this.persist()
    }
  }

  private async waitForSessionExit(sessionId: string, timeoutMs: number) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (!terminalService.getSession(sessionId)) return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  private async startLocked(instance: Instance): Promise<Instance> {
    if (instance.status === 'running' || instance.status === 'starting') {
      throw Object.assign(new Error('实例已在运行'), { statusCode: 409 })
    }

    try {
      await this.assertDirectory(instance.workingDirectory)
      instance.status = 'starting'
      instance.errorMessage = undefined
      // 不立即落盘 starting，等会话创建成功后一次写 running

      const session = await terminalService.createSession({
        name: `实例 · ${instance.name}`,
        cwd: instance.workingDirectory,
        instanceId: instance.id,
        cols: 100,
        rows: 30,
      })

      instance.terminalSessionId = session.sessionId
      instance.pid = session.pid
      instance.status = 'running'
      instance.lastStarted = new Date().toISOString()
      await this.persist()

      // 延迟注入启动命令，给 shell 初始化时间
      setTimeout(() => {
        try {
          terminalService.write(session.sessionId, `${instance.startCommand}\r`)
        } catch {
          // session may have closed
        }
      }, 400)

      return instance
    } catch (error) {
      instance.status = 'error'
      instance.errorMessage = error instanceof Error ? error.message : '启动失败'
      instance.terminalSessionId = undefined
      instance.pid = undefined
      await this.persist()
      throw error
    }
  }

  private async stopLocked(instance: Instance): Promise<Instance> {
    if (instance.status !== 'running' && instance.status !== 'starting') {
      return instance
    }

    try {
      instance.status = 'stopping'

      const sessionId = instance.terminalSessionId
      if (sessionId && terminalService.getSession(sessionId)) {
        if (instance.stopCommand === 'ctrl+c') {
          terminalService.write(sessionId, '\u0003')
        } else {
          terminalService.write(sessionId, `${instance.stopCommand}\r`)
        }

        await this.waitForSessionExit(sessionId, 8000)
        if (terminalService.getSession(sessionId)) {
          terminalService.close(sessionId)
          await this.waitForSessionExit(sessionId, 3000)
        }
        if (terminalService.getSession(sessionId)) {
          terminalService.close(sessionId, true)
          await this.waitForSessionExit(sessionId, 2000)
        }
        if (terminalService.getSession(sessionId)) {
          throw new Error('实例进程未能停止')
        }
      }

      instance.status = 'stopped'
      instance.pid = undefined
      instance.terminalSessionId = undefined
      instance.lastStopped = new Date().toISOString()
      await this.persist()
      return instance
    } catch (error) {
      instance.status = 'error'
      instance.errorMessage = error instanceof Error ? error.message : '停止失败'
      await this.persist()
      throw error
    }
  }

  private require(id: string): Instance {
    const instance = this.instances.get(id)
    if (!instance) {
      throw Object.assign(new Error('实例不存在'), { statusCode: 404 })
    }
    return instance
  }

  private async assertDirectory(dir: string) {
    try {
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) {
        throw new Error('工作目录不是文件夹')
      }
    } catch {
      throw Object.assign(new Error(`工作目录不存在: ${dir}`), { statusCode: 400 })
    }
  }

  private async persist() {
    const scheduled = this.persistQueue.catch(() => undefined).then(async () => {
      await writeJsonAtomic(this.filePath(), { instances: [...this.instances.values()] }, {
        compact: true,
      })
    })
    this.persistQueue = scheduled
    await scheduled
  }
}

export const instanceService = new InstanceService()
