import { useEffect, type RefObject } from 'react'
import type { PluginInfo, PublicUser } from '@gsm4/shared'
import { apiClient } from '../../shared/api/client'

type PluginRequest = {
  type: 'gsm4:plugin:request'
  channel: string
  requestId: string
  action: string
  payload?: unknown
}

type ToastKind = 'info' | 'success' | 'error'

function isPluginRequest(value: unknown): value is PluginRequest {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    message.type === 'gsm4:plugin:request' &&
    typeof message.channel === 'string' &&
    typeof message.requestId === 'string' &&
    typeof message.action === 'string'
  )
}

function instanceIdFrom(payload: unknown): string {
  const id =
    payload && typeof payload === 'object' && 'id' in payload
      ? String((payload as { id: unknown }).id)
      : ''
  if (!id || id.length > 100) throw new Error('实例标识无效')
  return id
}

function notificationFrom(value: unknown): { message: string; kind: ToastKind } | null {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const message = String(payload.message || '').slice(0, 500)
  if (!message) return null
  const kind = payload.tone === 'success' || payload.tone === 'error' ? payload.tone : 'info'
  return { message, kind }
}

function executePluginAction(
  action: string,
  payload: unknown,
  plugin: PluginInfo,
  user: PublicUser | null,
) {
  switch (action) {
    case 'context.get':
      return {
        product: 'GSM4',
        plugin: { name: plugin.name, displayName: plugin.displayName },
        user: { username: user?.username || '', role: user?.role || 'user' },
      }
    case 'system.info':
      return apiClient.get('/api/v1/system/info')
    case 'system.stats':
      return apiClient.get('/api/v1/system/stats')
    case 'instances.list':
      return apiClient.get('/api/v1/instances')
    case 'instances.start':
    case 'instances.stop':
    case 'instances.restart': {
      const id = instanceIdFrom(payload)
      const operation = action.slice('instances.'.length)
      return apiClient.post(`/api/v1/instances/${encodeURIComponent(id)}/${operation}`)
    }
    default:
      throw new Error(`插件接口不支持操作：${action}`)
  }
}

function postResponse(
  target: Window | null,
  channel: string,
  requestId: string,
  result: { ok: true; data: unknown } | { ok: false; error: string },
) {
  target?.postMessage(
    {
      type: 'gsm4:plugin:response',
      channel,
      requestId,
      ...result,
    },
    '*',
  )
}

export function usePluginBridge({
  frameRef,
  channel,
  plugin,
  user,
  onClose,
  push,
}: {
  frameRef: RefObject<HTMLIFrameElement | null>
  channel: string
  plugin: PluginInfo
  user: PublicUser | null
  onClose: () => void
  push: (message: string, kind?: ToastKind) => void
}) {
  useEffect(() => {
    async function respond(request: PluginRequest) {
      try {
        const data = await executePluginAction(request.action, request.payload, plugin, user)
        postResponse(frameRef.current?.contentWindow || null, channel, request.requestId, {
          ok: true,
          data,
        })
      } catch (error) {
        postResponse(frameRef.current?.contentWindow || null, channel, request.requestId, {
          ok: false,
          error: error instanceof Error ? error.message : '插件请求失败',
        })
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !event.data) return
      const message = event.data as Record<string, unknown>
      if (message.channel !== channel) return
      if (message.type === 'gsm4:plugin:close') return onClose()
      if (message.type === 'gsm4:plugin:notify') {
        const notification = notificationFrom(message.payload)
        if (notification) push(notification.message, notification.kind)
        return
      }
      if (!isPluginRequest(event.data) || event.data.requestId.length > 100) return
      void respond(event.data)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [channel, frameRef, onClose, plugin, push, user])
}
