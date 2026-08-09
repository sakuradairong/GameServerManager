import type { DeployLog, DeployProgress, DeploySessionSummary } from '@gsm4/shared'

type ProgressListener = (progress: DeployProgress) => void
type LogListener = (log: DeployLog) => void
type CompleteListener = (summary: DeploySessionSummary & { instanceId?: string }) => void
type ErrorListener = (payload: { sessionId: string; error: string }) => void

export class ProgressBus {
  private progressListeners = new Set<ProgressListener>()
  private logListeners = new Set<LogListener>()
  private completeListeners = new Set<CompleteListener>()
  private errorListeners = new Set<ErrorListener>()

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
    for (const listener of this.progressListeners) listener(progress)
  }

  emitLog(log: DeployLog) {
    for (const listener of this.logListeners) listener(log)
  }

  emitComplete(summary: DeploySessionSummary & { instanceId?: string }) {
    for (const listener of this.completeListeners) listener(summary)
  }

  emitError(sessionId: string, error: string) {
    for (const listener of this.errorListeners) listener({ sessionId, error })
  }
}

export const progressBus = new ProgressBus()
