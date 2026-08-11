import os from 'node:os'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

export interface PtyLaunchOptions {
  cols: number
  rows: number
  cwd: string
  env?: NodeJS.ProcessEnv
}

export interface PtyHandle {
  pid: number
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
  onData: (listener: (data: string) => void) => void
  onExit: (listener: (exitCode: number, signal?: number) => void) => void
}

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: [] }
  }
  const shell = process.env.SHELL || '/bin/bash'
  return { file: shell, args: ['-l'] }
}

export function spawnPty(options: PtyLaunchOptions): PtyHandle {
  const { file, args } = defaultShell()
  const term: IPty = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...options.env,
    },
  })

  return {
    pid: term.pid,
    write: (data) => term.write(data),
    resize: (cols, rows) => term.resize(cols, rows),
    kill: (signal) => {
      try {
        term.kill(signal)
      } catch {
        // ignore
      }
    },
    onData: (listener) => {
      term.onData(listener)
    },
    onExit: (listener) => {
      term.onExit(({ exitCode, signal }) => {
        listener(exitCode, signal ?? undefined)
      })
    },
  }
}

export function defaultCwd(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir() || process.cwd()
}
