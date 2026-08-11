import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RealtimeEvents,
  type DeployLog,
  type DeployProgress,
  type DeployRequest,
  type DeploySessionSummary,
} from '@gsm4/shared'
import { apiClient } from '../../../shared/api/client'
import { getSocket } from '../../../shared/realtime/socket'

const LOG_FLUSH_MS = 100

export function useDeploySession() {
  const [session, setSession] = useState<DeploySessionSummary | null>(null)
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const watchedSessionIdRef = useRef<string | null>(null)
  const pendingLogsRef = useRef<string[]>([])
  const logFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    sessionIdRef.current = session?.sessionId ?? null
  }, [session])

  const flushPendingLogs = useCallback(() => {
    if (pendingLogsRef.current.length === 0) return
    const batch = pendingLogsRef.current
    pendingLogsRef.current = []
    setLogs((prev) => [...prev.slice(-200), ...batch].slice(-200))
  }, [])

  const watchSession = useCallback((sessionId: string) => {
    const socket = getSocket()
    const previous = watchedSessionIdRef.current
    if (previous && previous !== sessionId) {
      socket.emit(RealtimeEvents.deployUnwatch, { sessionId: previous })
    }
    watchedSessionIdRef.current = sessionId
    socket.emit(RealtimeEvents.deployWatch, { sessionId })
  }, [])

  useEffect(() => {
    const socket = getSocket()

    const match = (sessionId?: string) =>
      Boolean(sessionIdRef.current && sessionId && sessionId === sessionIdRef.current)

    const onProgress = (payload: DeployProgress) => {
      if (!match(payload.sessionId)) return
      setProgress(payload)
    }
    const onLog = (payload: DeployLog) => {
      if (!match(payload.sessionId)) return
      pendingLogsRef.current.push(payload.line)
      if (logFlushTimerRef.current) return
      logFlushTimerRef.current = setTimeout(() => {
        logFlushTimerRef.current = null
        flushPendingLogs()
      }, LOG_FLUSH_MS)
    }
    const onComplete = (payload: DeploySessionSummary) => {
      if (!match(payload.sessionId)) return
      flushPendingLogs()
      setSession(payload)
      setProgress({
        sessionId: payload.sessionId,
        percent: 100,
        stage: 'done',
        message: '完成',
      })
    }
    const onError = (payload: { sessionId?: string; error: string }) => {
      if (!match(payload.sessionId)) return
      flushPendingLogs()
      setError(payload.error)
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'failed',
              error: payload.error,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      )
    }
    const onConnect = async () => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      watchSession(sessionId)
      try {
        const latest = await apiClient.get<DeploySessionSummary>(
          `/api/v1/deploy/sessions/${sessionId}`,
        )
        setSession(latest)
        if (latest.error) setError(latest.error)
      } catch {
        // 会话可能已按保留策略清理；保持当前 UI 状态
      }
    }

    socket.on('connect', onConnect)
    socket.on(RealtimeEvents.deployProgress, onProgress)
    socket.on(RealtimeEvents.deployLog, onLog)
    socket.on(RealtimeEvents.deployComplete, onComplete)
    socket.on(RealtimeEvents.deployError, onError)

    return () => {
      if (logFlushTimerRef.current) {
        clearTimeout(logFlushTimerRef.current)
        logFlushTimerRef.current = null
      }
      const watched = watchedSessionIdRef.current
      if (watched) {
        socket.emit(RealtimeEvents.deployUnwatch, { sessionId: watched })
        watchedSessionIdRef.current = null
      }
      socket.off('connect', onConnect)
      socket.off(RealtimeEvents.deployProgress, onProgress)
      socket.off(RealtimeEvents.deployLog, onLog)
      socket.off(RealtimeEvents.deployComplete, onComplete)
      socket.off(RealtimeEvents.deployError, onError)
    }
  }, [flushPendingLogs, watchSession])

  const start = useCallback(async (request: DeployRequest) => {
    setSubmitting(true)
    setError(null)
    setLogs([])
    pendingLogsRef.current = []
    setProgress(null)
    try {
      const created = await apiClient.post<DeploySessionSummary>('/api/v1/deploy', request)
      sessionIdRef.current = created.sessionId
      watchSession(created.sessionId)
      setSession(created)
      return created
    } finally {
      setSubmitting(false)
    }
  }, [watchSession])

  const cancel = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    await apiClient.post('/api/v1/deploy/cancel', { sessionId })
  }, [])

  const attach = useCallback(
    (created: DeploySessionSummary) => {
      setError(null)
      setLogs([])
      pendingLogsRef.current = []
      setProgress(null)
      sessionIdRef.current = created.sessionId
      watchSession(created.sessionId)
      setSession(created)
    },
    [watchSession],
  )

  return {
    session,
    progress,
    logs,
    error,
    submitting,
    start,
    cancel,
    attach,
  }
}
