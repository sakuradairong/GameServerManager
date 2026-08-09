import crypto from 'node:crypto'
import fs from 'node:fs'
import { defaultCwd, spawnPty, type PtyHandle } from '../../adapters/pty/NodePtyAdapter.js'

export interface TerminalSessionMeta {
  sessionId: string
  name: string
  pid: number
  cwd: string
  cols: number
  rows: number
  createdAt: string
  instanceId?: string
}

interface LiveSession extends TerminalSessionMeta {
  pty: PtyHandle
  outputBuffer: string
  sockets: Set<string>
}

const MAX_BUFFER = 200_000

export class TerminalService {
  private sessions = new Map<string, LiveSession>()
  private outputListeners = new Set<
    (sessionId: string, data: string) => void
  >()
  private exitListeners = new Set<
    (sessionId: string, exitCode: number) => void
  >()

  onOutput(listener: (sessionId: string, data: string) => void) {
    this.outputListeners.add(listener)
    return () => this.outputListeners.delete(listener)
  }

  onExit(listener: (sessionId: string, exitCode: number) => void) {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  listSessions(): TerminalSessionMeta[] {
    return [...this.sessions.values()].map((session) => this.toMeta(session))
  }

  getSession(sessionId: string): TerminalSessionMeta | undefined {
    const session = this.sessions.get(sessionId)
    return session ? this.toMeta(session) : undefined
  }

  createSession(input: {
    sessionId?: string
    name?: string
    cols?: number
    rows?: number
    cwd?: string
    instanceId?: string
  }): TerminalSessionMeta {
    const sessionId = input.sessionId || crypto.randomUUID()
    if (this.sessions.has(sessionId)) {
      throw Object.assign(new Error('会话已存在'), { statusCode: 409 })
    }

    const cwd = input.cwd || defaultCwd()
    if (!fs.existsSync(cwd)) {
      throw Object.assign(new Error(`工作目录不存在: ${cwd}`), { statusCode: 400 })
    }

    const cols = input.cols || 80
    const rows = input.rows || 24
    const pty = spawnPty({ cols, rows, cwd })

    const session: LiveSession = {
      sessionId,
      name: input.name || `终端 ${sessionId.slice(0, 8)}`,
      pid: pty.pid,
      cwd,
      cols,
      rows,
      createdAt: new Date().toISOString(),
      instanceId: input.instanceId,
      pty,
      outputBuffer: '',
      sockets: new Set(),
    }

    pty.onData((data) => {
      session.outputBuffer += data
      if (session.outputBuffer.length > MAX_BUFFER) {
        session.outputBuffer = session.outputBuffer.slice(-MAX_BUFFER)
      }
      for (const listener of this.outputListeners) {
        listener(sessionId, data)
      }
    })

    pty.onExit((exitCode) => {
      this.sessions.delete(sessionId)
      for (const listener of this.exitListeners) {
        listener(sessionId, exitCode)
      }
    })

    this.sessions.set(sessionId, session)
    return this.toMeta(session)
  }

  attachSocket(sessionId: string, socketId: string): string | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    session.sockets.add(socketId)
    return session.outputBuffer
  }

  detachSocket(sessionId: string, socketId: string) {
    this.sessions.get(sessionId)?.sockets.delete(socketId)
  }

  detachSocketFromAll(socketId: string) {
    for (const session of this.sessions.values()) {
      session.sockets.delete(socketId)
    }
  }

  write(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw Object.assign(new Error('会话不存在'), { statusCode: 404 })
    }
    session.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw Object.assign(new Error('会话不存在'), { statusCode: 404 })
    }
    session.cols = cols
    session.rows = rows
    session.pty.resize(cols, rows)
  }

  close(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.pty.kill()
    this.sessions.delete(sessionId)
  }

  private toMeta(session: LiveSession): TerminalSessionMeta {
    return {
      sessionId: session.sessionId,
      name: session.name,
      pid: session.pid,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      instanceId: session.instanceId,
    }
  }
}

export const terminalService = new TerminalService()
