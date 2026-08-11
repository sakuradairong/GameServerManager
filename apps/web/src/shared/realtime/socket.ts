import { io, type Socket } from 'socket.io-client'
import { expireAuth, getToken } from '../api/client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket?.connected) return socket

  if (socket) {
    socket.auth = { token: getToken() }
    if (!socket.connected) socket.connect()
    return socket
  }

  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    auth: {
      token: getToken(),
    },
  })
  socket.on('connect_error', (error) => {
    if (error.message === 'UNAUTHORIZED') {
      disconnectSocket()
      expireAuth()
    }
  })

  return socket
}

export function disconnectSocket() {
  if (!socket) return
  socket.disconnect()
  socket = null
}

export function refreshSocketAuth() {
  if (!socket) return
  socket.auth = { token: getToken() }
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()
}
