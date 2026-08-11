import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RealtimeEvents } from '@gsm4/shared'
import { getSocket } from '../../shared/realtime/socket'
import { useToast } from '../../shared/ui/Toast'

interface SessionMeta {
  sessionId: string
  name: string
  cwd: string
  pid: number
}

const SessionItem = memo(function SessionItem({
  session,
  active,
  onSelect,
}: {
  session: SessionMeta
  active: boolean
  onSelect: (sessionId: string) => void
}) {
  return (
    <button
      type="button"
      className={`session-item${active ? ' active' : ''}`}
      onClick={() => onSelect(session.sessionId)}
    >
      <div>{session.name}</div>
      <div className="muted">{session.cwd}</div>
    </button>
  )
})

export function TerminalPage() {
  const { push } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSessionRef = useRef(searchParams.get('sessionId'))
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(initialSessionRef.current)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeIdRef = useRef<string | null>(activeId)
  const outputBufferRef = useRef('')
  const outputRafRef = useRef<number | null>(null)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const socket = useMemo(() => getSocket(), [])

  useEffect(() => {
    if (!hostRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      scrollback: 1000,
      theme: {
        background: '#0b1016',
        foreground: '#e7eef7',
        cursor: '#3d9cf0',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const onData = (data: string) => {
      const sessionId = activeIdRef.current
      if (!sessionId) return
      socket.emit(RealtimeEvents.terminalInput, { sessionId, data })
    }
    term.onData(onData)

    const onResize = () => {
      fit.fit()
      const sessionId = activeIdRef.current
      if (!sessionId) return
      socket.emit(RealtimeEvents.terminalResize, {
        sessionId,
        cols: term.cols,
        rows: term.rows,
      })
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (outputRafRef.current != null) {
        cancelAnimationFrame(outputRafRef.current)
        outputRafRef.current = null
      }
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [socket])

  useEffect(() => {
    const initialId = initialSessionRef.current
    if (!initialId) return
    socket.emit(RealtimeEvents.reconnectSession, { sessionId: initialId })
  }, [socket])

  useEffect(() => {
    const flushOutput = () => {
      outputRafRef.current = null
      const chunk = outputBufferRef.current
      if (!chunk) return
      outputBufferRef.current = ''
      termRef.current?.write(chunk)
    }

    const onList = (list: SessionMeta[]) => setSessions(list)
    const onCreated = (payload: SessionMeta & { buffer?: string }) => {
      setSessions((prev) => {
        if (prev.some((item) => item.sessionId === payload.sessionId)) return prev
        return [...prev, payload]
      })
      setActiveId(payload.sessionId)
      setSearchParams({ sessionId: payload.sessionId })
      termRef.current?.reset()
      if (payload.buffer) termRef.current?.write(payload.buffer)
    }
    const onOutput = (payload: { sessionId: string; data: string }) => {
      if (payload.sessionId !== activeIdRef.current) return
      outputBufferRef.current += payload.data
      if (outputRafRef.current == null) {
        outputRafRef.current = requestAnimationFrame(flushOutput)
      }
    }
    const onClosed = (payload: { sessionId: string }) => {
      setSessions((prev) => prev.filter((item) => item.sessionId !== payload.sessionId))
      if (activeIdRef.current === payload.sessionId) {
        setActiveId(null)
        termRef.current?.writeln('\r\n[会话已关闭]')
      }
    }
    const onReconnected = (payload: { session: SessionMeta; buffer: string }) => {
      setActiveId(payload.session.sessionId)
      termRef.current?.reset()
      termRef.current?.write(payload.buffer || '')
      push('已重连终端会话', 'success')
    }
    const onReconnectFailed = () => {
      push('重连失败：会话不存在', 'error')
    }
    const onError = (payload: { message?: string }) => {
      push(payload.message || '终端错误', 'error')
    }

    socket.emit(RealtimeEvents.listSessions)
    socket.on(RealtimeEvents.sessionList, onList)
    socket.on(RealtimeEvents.ptyCreated, onCreated)
    socket.on(RealtimeEvents.terminalOutput, onOutput)
    socket.on(RealtimeEvents.ptyClosed, onClosed)
    socket.on(RealtimeEvents.sessionReconnected, onReconnected)
    socket.on(RealtimeEvents.sessionReconnectFailed, onReconnectFailed)
    socket.on(RealtimeEvents.terminalError, onError)

    return () => {
      socket.off(RealtimeEvents.sessionList, onList)
      socket.off(RealtimeEvents.ptyCreated, onCreated)
      socket.off(RealtimeEvents.terminalOutput, onOutput)
      socket.off(RealtimeEvents.ptyClosed, onClosed)
      socket.off(RealtimeEvents.sessionReconnected, onReconnected)
      socket.off(RealtimeEvents.sessionReconnectFailed, onReconnectFailed)
      socket.off(RealtimeEvents.terminalError, onError)
    }
  }, [socket, push, setSearchParams])

  function createSession() {
    const term = termRef.current
    fitRef.current?.fit()
    socket.emit(RealtimeEvents.createPty, {
      cols: term?.cols || 80,
      rows: term?.rows || 24,
      name: `终端 ${new Date().toLocaleTimeString()}`,
    })
  }

  function selectSession(sessionId: string) {
    setActiveId(sessionId)
    setSearchParams({ sessionId })
    termRef.current?.reset()
    socket.emit(RealtimeEvents.reconnectSession, { sessionId })
  }

  function closeActive() {
    if (!activeId) return
    socket.emit(RealtimeEvents.closePty, { sessionId: activeId })
  }

  return (
    <div className="stack terminal-layout">
      <div className="page-card">
        <div className="topbar" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="page-title">终端</h2>
            <p className="page-desc">多会话 PTY（node-pty）。可与实例启动会话互相跳转。</p>
          </div>
          <div className="row-actions">
            <button type="button" className="btn" onClick={createSession}>
              新建会话
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeActive} disabled={!activeId}>
              关闭当前
            </button>
          </div>
        </div>
      </div>

      <div className="terminal-body">
        <aside className="page-card session-list">
          <h3 style={{ marginTop: 0 }}>会话</h3>
          {sessions.length === 0 ? (
            <p className="muted">暂无会话</p>
          ) : (
            sessions.map((session) => (
              <SessionItem
                key={session.sessionId}
                session={session}
                active={activeId === session.sessionId}
                onSelect={selectSession}
              />
            ))
          )}
        </aside>
        <div className="page-card terminal-panel">
          <div ref={hostRef} className="xterm-host" />
        </div>
      </div>
    </div>
  )
}
