import type {
  SteamcmdInstallComplete,
  SteamcmdInstallError,
  SteamcmdInstallProgress,
} from '@gsm4/shared'

type ProgressListener = (progress: SteamcmdInstallProgress) => void
type CompleteListener = (payload: SteamcmdInstallComplete) => void
type ErrorListener = (payload: SteamcmdInstallError) => void

const PROGRESS_MIN_INTERVAL_MS = 250

export class SteamcmdInstallBus {
  private progressListeners = new Set<ProgressListener>()
  private completeListeners = new Set<CompleteListener>()
  private errorListeners = new Set<ErrorListener>()
  private lastProgressEmit = 0
  private lastProgress = -1

  onProgress(listener: ProgressListener) {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  onComplete(listener: CompleteListener) {
    this.completeListeners.add(listener)
    return () => this.completeListeners.delete(listener)
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  emitProgress(progress: SteamcmdInstallProgress) {
    const now = Date.now()
    if (
      now - this.lastProgressEmit < PROGRESS_MIN_INTERVAL_MS &&
      progress.progress === this.lastProgress
    ) {
      return
    }
    this.lastProgressEmit = now
    this.lastProgress = progress.progress
    for (const listener of this.progressListeners) listener(progress)
  }

  emitComplete(payload: SteamcmdInstallComplete) {
    this.lastProgress = -1
    for (const listener of this.completeListeners) listener(payload)
  }

  emitError(payload: SteamcmdInstallError) {
    this.lastProgress = -1
    for (const listener of this.errorListeners) listener(payload)
  }
}

export const steamcmdInstallBus = new SteamcmdInstallBus()
