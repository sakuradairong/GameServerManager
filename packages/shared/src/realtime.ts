/** Socket.IO 事件名（前后端共用） */
export const RealtimeEvents = {
  // system
  subscribeSystemStats: 'subscribe-system-stats',
  unsubscribeSystemStats: 'unsubscribe-system-stats',
  systemStats: 'system-stats',

  // terminal
  createPty: 'create-pty',
  terminalInput: 'terminal-input',
  terminalResize: 'terminal-resize',
  closePty: 'close-pty',
  reconnectSession: 'reconnect-session',
  listSessions: 'list-sessions',

  ptyCreated: 'pty-created',
  terminalOutput: 'terminal-output',
  terminalResized: 'terminal-resized',
  ptyClosed: 'pty-closed',
  terminalExit: 'terminal-exit',
  terminalError: 'terminal-error',
  sessionList: 'session-list',
  sessionReconnected: 'session-reconnected',
  sessionReconnectFailed: 'session-reconnect-failed',
} as const

export type RealtimeEvent = (typeof RealtimeEvents)[keyof typeof RealtimeEvents]
