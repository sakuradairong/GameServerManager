import { useEffect, useMemo, useRef } from 'react'
import type { PluginInfo } from '@gsm4/shared'
import { useAuth } from '../../shared/api/AuthContext'
import { useToast } from '../../shared/ui/Toast'
import { usePluginBridge } from './usePluginBridge'

export function PluginWebDialog({
  plugin,
  channel,
  open,
  onClose,
  onExited,
}: {
  plugin: PluginInfo
  channel: string
  open: boolean
  onClose: () => void
  onExited: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const { user } = useAuth()
  const { push } = useToast()
  const source = useMemo(() => {
    const entry = plugin.entryPoint
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `/plugin-ui/${encodeURIComponent(plugin.name)}/${entry}?channel=${encodeURIComponent(channel)}`
  }, [channel, plugin.entryPoint, plugin.name])

  usePluginBridge({ frameRef, channel, plugin, user, onClose, push })

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    window.requestAnimationFrame(() => frameRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [onClose, open])

  return (
    <div
      className={`modal-backdrop plugin-modal-backdrop${open ? '' : ' is-closing'}`}
      onClick={onClose}
      onAnimationEnd={(event) => {
        if (!open && event.target === event.currentTarget) onExited()
      }}
    >
      <section
        className="modal-card plugin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${plugin.displayName} 插件界面`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="plugin-modal-header">
          <div>
            <strong>{plugin.displayName}</strong>
            <span className="muted"> · 插件 WebUI</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </header>
        <iframe
          ref={frameRef}
          className="plugin-frame"
          src={source}
          title={`${plugin.displayName} 插件界面`}
          sandbox="allow-scripts allow-forms allow-downloads"
          referrerPolicy="no-referrer"
        />
      </section>
    </div>
  )
}
