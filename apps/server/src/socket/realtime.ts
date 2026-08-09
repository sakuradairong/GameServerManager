import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { RealtimeEvents, type AuthTokenPayload } from '@gsm4/shared'
import { authService } from '../modules/auth/AuthService.js'
import { systemService } from '../modules/system/SystemService.js'
import { terminalService } from '../modules/terminal/TerminalService.js'
import { instanceService } from '../modules/instance/InstanceService.js'
import { progressBus } from '../modules/deploy/ProgressBus.js'
import { deployService } from '../modules/deploy/DeployService.js'

declare module 'socket.io' {
  interface SocketData {
    user?: AuthTokenPayload
  }
}

export function setupRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  })

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as
          | string
          | undefined)
      if (!token) {
        next(new Error('UNAUTHORIZED'))
        return
      }
      socket.data.user = authService.verifyToken(token)
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })

  let statsTimer: NodeJS.Timeout | null = null

  const ensureStatsLoop = () => {
    if (statsTimer) return
    statsTimer = setInterval(async () => {
      const room = io.sockets.adapter.rooms.get('system-stats')
      if (!room || room.size === 0) {
        if (statsTimer) {
          clearInterval(statsTimer)
          statsTimer = null
        }
        return
      }
      const stats = await systemService.getStatsWithDisk()
      io.to('system-stats').emit(RealtimeEvents.systemStats, stats)
    }, 2000)
  }

  terminalService.onOutput((sessionId, data) => {
    io.emit(RealtimeEvents.terminalOutput, { sessionId, data })
  })

  terminalService.onExit((sessionId, exitCode) => {
    io.emit(RealtimeEvents.terminalExit, { sessionId, exitCode })
    io.emit(RealtimeEvents.ptyClosed, { sessionId })
    void instanceService.handleTerminalExit(sessionId)
  })

  progressBus.onProgress((progress) => {
    io.emit(RealtimeEvents.deployProgress, progress)
  })
  progressBus.onLog((log) => {
    io.emit(RealtimeEvents.deployLog, log)
  })
  progressBus.onComplete((summary) => {
    io.emit(RealtimeEvents.deployComplete, summary)
  })
  progressBus.onError((payload) => {
    io.emit(RealtimeEvents.deployError, payload)
  })

  io.on('connection', (socket) => {
    socket.emit(RealtimeEvents.sessionList, terminalService.listSessions())

    socket.on(RealtimeEvents.deployCancel, (payload: { sessionId?: string }) => {
      try {
        if (!payload?.sessionId) return
        const session = deployService.cancel(payload.sessionId)
        socket.emit(RealtimeEvents.deployProgress, {
          sessionId: session.sessionId,
          stage: 'cancelling',
          message: '已请求取消',
        })
      } catch (error) {
        socket.emit(RealtimeEvents.deployError, {
          sessionId: payload?.sessionId,
          error: error instanceof Error ? error.message : '取消失败',
        })
      }
    })

    socket.on(RealtimeEvents.subscribeSystemStats, async () => {
      await socket.join('system-stats')
      ensureStatsLoop()
      socket.emit(RealtimeEvents.systemStats, await systemService.getStatsWithDisk())
    })

    socket.on(RealtimeEvents.unsubscribeSystemStats, async () => {
      await socket.leave('system-stats')
    })

    socket.on(RealtimeEvents.listSessions, () => {
      socket.emit(RealtimeEvents.sessionList, terminalService.listSessions())
    })

    socket.on(RealtimeEvents.createPty, (payload: Record<string, unknown> = {}) => {
      try {
        const meta = terminalService.createSession({
          sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
          name: typeof payload.name === 'string' ? payload.name : undefined,
          cols: typeof payload.cols === 'number' ? payload.cols : undefined,
          rows: typeof payload.rows === 'number' ? payload.rows : undefined,
          cwd:
            typeof payload.cwd === 'string'
              ? payload.cwd
              : typeof payload.workingDirectory === 'string'
                ? payload.workingDirectory
                : undefined,
        })
        const buffer = terminalService.attachSocket(meta.sessionId, socket.id)
        socket.emit(RealtimeEvents.ptyCreated, { ...meta, buffer: buffer || '' })
        io.emit(RealtimeEvents.sessionList, terminalService.listSessions())
      } catch (error) {
        socket.emit(RealtimeEvents.terminalError, {
          message: error instanceof Error ? error.message : '创建终端失败',
        })
      }
    })

    socket.on(RealtimeEvents.reconnectSession, (payload: { sessionId?: string }) => {
      const sessionId = payload?.sessionId || ''
      const buffer = terminalService.attachSocket(sessionId, socket.id)
      if (buffer === null) {
        socket.emit(RealtimeEvents.sessionReconnectFailed, { sessionId })
        return
      }
      socket.emit(RealtimeEvents.sessionReconnected, {
        session: terminalService.getSession(sessionId),
        buffer,
      })
    })

    socket.on(
      RealtimeEvents.terminalInput,
      (payload: { sessionId?: string; data?: string }) => {
        try {
          if (!payload.sessionId) return
          terminalService.write(payload.sessionId, payload.data ?? '')
        } catch (error) {
          socket.emit(RealtimeEvents.terminalError, {
            sessionId: payload?.sessionId,
            message: error instanceof Error ? error.message : '写入失败',
          })
        }
      },
    )

    socket.on(
      RealtimeEvents.terminalResize,
      (payload: { sessionId?: string; cols?: number; rows?: number }) => {
        try {
          if (!payload.sessionId || !payload.cols || !payload.rows) return
          terminalService.resize(payload.sessionId, payload.cols, payload.rows)
          socket.emit(RealtimeEvents.terminalResized, {
            sessionId: payload.sessionId,
            cols: payload.cols,
            rows: payload.rows,
          })
        } catch (error) {
          socket.emit(RealtimeEvents.terminalError, {
            sessionId: payload?.sessionId,
            message: error instanceof Error ? error.message : '调整大小失败',
          })
        }
      },
    )

    socket.on(RealtimeEvents.closePty, (payload: { sessionId?: string }) => {
      const sessionId = payload?.sessionId || ''
      terminalService.close(sessionId)
      io.emit(RealtimeEvents.ptyClosed, { sessionId })
      io.emit(RealtimeEvents.sessionList, terminalService.listSessions())
    })

    socket.on('disconnect', () => {
      terminalService.detachSocketFromAll(socket.id)
    })
  })

  return io
}
