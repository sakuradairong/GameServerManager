import { io, type Socket } from 'socket.io-client'
import { getToken } from '../api/client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket && socket.connected) return socket

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
