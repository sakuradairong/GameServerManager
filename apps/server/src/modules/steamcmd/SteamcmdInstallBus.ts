import type {
  SteamcmdInstallComplete,
  SteamcmdInstallError,
  SteamcmdInstallProgress,
} from '@gsm4/shared'

type ProgressListener = (progress: SteamcmdInstallProgress) => void
type CompleteListener = (payload: SteamcmdInstallComplete) => void
type ErrorListener = (payload: SteamcmdInstallError) => void

export class SteamcmdInstallBus {
  private progressListeners = new Set<ProgressListener>()
  private completeListeners = new Set<CompleteListener>()
  private errorListeners = new Set<ErrorListener>()

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
    for (const listener of this.progressListeners) listener(progress)
  }

  emitComplete(payload: SteamcmdInstallComplete) {
    for (const listener of this.completeListeners) listener(payload)
  }

  emitError(payload: SteamcmdInstallError) {
    for (const listener of this.errorListeners) listener(payload)
  }
}

export const steamcmdInstallBus = new SteamcmdInstallBus()
