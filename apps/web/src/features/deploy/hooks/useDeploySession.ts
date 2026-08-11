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

export function useDeploySession() {
  const [session, setSession] = useState<DeploySessionSummary | null>(null)
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    sessionIdRef.current = session?.sessionId ?? null
  }, [session])

  useEffect(() => {
    const socket = getSocket()

    /** 仅处理当前会话事件，避免切换 Tab 时误收其它部署的错误/日志 */
    const match = (sessionId?: string) =>
      Boolean(sessionIdRef.current && sessionId && sessionId === sessionIdRef.current)

    const onProgress = (payload: DeployProgress) => {
      if (!match(payload.sessionId)) return
      setProgress(payload)
    }
    const onLog = (payload: DeployLog) => {
      if (!match(payload.sessionId)) return
      setLogs((prev) => [...prev.slice(-200), payload.line])
    }
    const onComplete = (payload: DeploySessionSummary) => {
      if (!match(payload.sessionId)) return
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
      socket.off('connect', onConnect)
      socket.off(RealtimeEvents.deployProgress, onProgress)
      socket.off(RealtimeEvents.deployLog, onLog)
      socket.off(RealtimeEvents.deployComplete, onComplete)
      socket.off(RealtimeEvents.deployError, onError)
    }
  }, [])

  const start = useCallback(async (request: DeployRequest) => {
    setSubmitting(true)
    setError(null)
    setLogs([])
    setProgress(null)
    try {
      const created = await apiClient.post<DeploySessionSummary>('/api/v1/deploy', request)
      sessionIdRef.current = created.sessionId
      setSession(created)
      return created
    } finally {
      setSubmitting(false)
    }
  }, [])

  const cancel = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    await apiClient.post('/api/v1/deploy/cancel', { sessionId })
  }, [])

  /**
   * 绑定一个由其它接口创建的部署会话（如 Steam 更新），复用 deploy:* 进度/日志订阅。
   */
  const attach = useCallback((created: DeploySessionSummary) => {
    setError(null)
    setLogs([])
    setProgress(null)
    sessionIdRef.current = created.sessionId
    setSession(created)
  }, [])

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
