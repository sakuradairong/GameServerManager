import type { DeployRequest, DeploySessionSummary } from '@gsm4/shared'
import type { ProgressBus } from '../ProgressBus.js'

export interface ExecutorContext {
  sessionId: string
  request: DeployRequest
  installPath: string
  instanceId: string
  signal: AbortSignal
  bus: ProgressBus
  setTerminalSessionId?: (sessionId: string) => void
}

export interface DeployExecutor {
  type: DeployRequest['type']
  run(ctx: ExecutorContext): Promise<{
    startCommand: string
    terminalSessionId?: string
    workingDirectory?: string
  }>
}

export type SessionMutator = (patch: Partial<DeploySessionSummary>) => void
