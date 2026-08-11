import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RealtimeEvents,
  type SteamcmdInstallComplete,
  type SteamcmdInstallError,
  type SteamcmdInstallProgress,
  type SteamcmdStatus,
} from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { getSocket } from '../../shared/realtime/socket'

export function useSteamcmdInstall(options?: {
  onInstalled?: (executablePath: string) => void
}) {
  const onInstalledRef = useRef(options?.onInstalled)
  onInstalledRef.current = options?.onInstalled

  const [status, setStatus] = useState<SteamcmdStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [installing, setInstalling] = useState(false)

  const refresh = useCallback(async () => {
    const next = await apiClient.get<SteamcmdStatus>('/api/v1/steamcmd/status', {
      cacheTtlMs: 10_000,
    })
    setStatus(next)
    setInstalling(next.installing)
    setProgress(next.progress ?? 0)
    setStatusMessage(next.statusMessage ?? '')
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    const socket = getSocket()

    const onProgress = (payload: SteamcmdInstallProgress) => {
      setInstalling(payload.installing)
      setProgress(payload.progress)
      setStatusMessage(payload.status)
    }
    const onComplete = (payload: SteamcmdInstallComplete) => {
      setInstalling(false)
      setProgress(100)
      setStatusMessage(payload.message)
      apiClient.invalidateGetCache('/api/v1/steamcmd')
      void refresh().then(() => {
        onInstalledRef.current?.(payload.executablePath)
      })
    }
    const onError = (payload: SteamcmdInstallError) => {
      setInstalling(false)
      setStatusMessage(payload.message)
      void refresh()
    }

    socket.on(RealtimeEvents.steamcmdProgress, onProgress)
    socket.on(RealtimeEvents.steamcmdComplete, onComplete)
    socket.on(RealtimeEvents.steamcmdError, onError)
    return () => {
      socket.off(RealtimeEvents.steamcmdProgress, onProgress)
      socket.off(RealtimeEvents.steamcmdComplete, onComplete)
      socket.off(RealtimeEvents.steamcmdError, onError)
    }
  }, [refresh])

  const install = useCallback(async (installPath?: string) => {
    setInstalling(true)
    setProgress(0)
    setStatusMessage('准备安装…')
    try {
      await apiClient.post<{ installPath: string }>('/api/v1/steamcmd/install', {
        installPath: installPath || undefined,
      })
    } catch (error) {
      setInstalling(false)
      throw error instanceof ApiError ? error : new ApiError('安装失败', 500)
    }
  }, [])

  return {
    status,
    loading,
    installing,
    progress,
    statusMessage,
    refresh,
    install,
  }
}
