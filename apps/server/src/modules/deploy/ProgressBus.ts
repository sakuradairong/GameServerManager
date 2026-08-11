import type { DeployLog, DeployProgress, DeploySessionSummary } from '@gsm4/shared'

type ProgressListener = (progress: DeployProgress) => void
type LogListener = (log: DeployLog) => void
type CompleteListener = (summary: DeploySessionSummary & { instanceId?: string }) => void
type ErrorListener = (payload: { sessionId: string; error: string }) => void

const PROGRESS_MIN_INTERVAL_MS = 250
const LOG_FLUSH_INTERVAL_MS = 100

export class ProgressBus {
  private progressListeners = new Set<ProgressListener>()
  private logListeners = new Set<LogListener>()
  private completeListeners = new Set<CompleteListener>()
  private errorListeners = new Set<ErrorListener>()

  private lastProgressEmit = new Map<string, { at: number; percent?: number }>()
  private pendingLogs = new Map<string, string[]>()
  private logFlushTimers = new Map<string, NodeJS.Timeout>()

  onProgress(listener: ProgressListener) {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  onLog(listener: LogListener) {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  onComplete(listener: CompleteListener) {
    this.completeListeners.add(listener)
    return () => this.completeListeners.delete(listener)
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  emitProgress(progress: DeployProgress) {
    const sessionId = progress.sessionId
    const now = Date.now()
    const last = this.lastProgressEmit.get(sessionId)
    const percent = progress.percent
    if (
      last &&
      now - last.at < PROGRESS_MIN_INTERVAL_MS &&
      percent != null &&
      last.percent === percent
    ) {
      return
    }
    this.lastProgressEmit.set(sessionId, { at: now, percent })
    for (const listener of this.progressListeners) listener(progress)
  }

  emitLog(log: DeployLog) {
    const sessionId = log.sessionId
    const bucket = this.pendingLogs.get(sessionId) ?? []
    bucket.push(log.line)
    this.pendingLogs.set(sessionId, bucket)

    if (this.logFlushTimers.has(sessionId)) return

    const timer = setTimeout(() => {
      this.logFlushTimers.delete(sessionId)
      const lines = this.pendingLogs.get(sessionId) ?? []
      this.pendingLogs.delete(sessionId)
      for (const line of lines) {
        const payload = { sessionId, line, level: 'info' as const }
        for (const listener of this.logListeners) listener(payload)
      }
    }, LOG_FLUSH_INTERVAL_MS)
    this.logFlushTimers.set(sessionId, timer)
  }

  emitComplete(summary: DeploySessionSummary & { instanceId?: string }) {
    this.clearSessionThrottle(summary.sessionId)
    for (const listener of this.completeListeners) listener(summary)
  }

  emitError(sessionId: string, error: string) {
    this.clearSessionThrottle(sessionId)
    for (const listener of this.errorListeners) listener({ sessionId, error })
  }

  private clearSessionThrottle(sessionId: string) {
    this.lastProgressEmit.delete(sessionId)
    const timer = this.logFlushTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.logFlushTimers.delete(sessionId)
    }
    this.pendingLogs.delete(sessionId)
  }
}

export const progressBus = new ProgressBus()
