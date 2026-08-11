import type { PluginManifest } from '@gsm4/shared'

export const OFFICIAL_EXAMPLE_PLUGIN_NAME = 'gsm4-example'

export const OFFICIAL_EXAMPLE_MANIFEST: PluginManifest = {
  name: OFFICIAL_EXAMPLE_PLUGIN_NAME,
  displayName: 'GSM4 官方示例插件',
  description: '演示安全 iframe 通信、系统信息读取和实例启停操作。',
  version: '1.0.0',
  author: 'GSM4 Team',
  enabled: false,
  hasWebInterface: true,
  entryPoint: 'index.html',
  icon: 'puzzle',
  category: '开发',
  apiVersion: 1,
}

export const OFFICIAL_EXAMPLE_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GSM4 官方示例插件</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0d131b; color: #e7edf5; padding: 22px; }
    .shell { max-width: 960px; margin: 0 auto; }
    .hero, .card { border: 1px solid #2b3949; background: #151f2a; border-radius: 16px; }
    .hero { padding: 22px; margin-bottom: 16px; }
    .hero h1 { margin: 0 0 8px; font-size: 24px; }
    .muted { color: #91a1b4; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .card { padding: 18px; }
    .card h2 { margin: 0 0 12px; font-size: 17px; }
    .instance { border-top: 1px solid #2b3949; padding: 12px 0; }
    .instance:first-child { border-top: 0; padding-top: 0; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 9px; }
    button { border: 1px solid #3b82f6; background: #2563eb; color: white; border-radius: 9px; padding: 8px 12px; cursor: pointer; }
    button.secondary { border-color: #44546a; background: #243243; }
    button:disabled { opacity: .55; cursor: wait; }
    code { color: #83c7ff; }
    .status { display: inline-flex; border-radius: 999px; background: #243243; padding: 3px 8px; font-size: 12px; }
    #error { color: #ff8d9a; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="row">
        <div>
          <h1>GSM4 官方示例插件</h1>
          <div class="muted">插件运行在沙箱 iframe 中，通过受控消息接口调用面板能力。</div>
        </div>
        <button id="close" class="secondary" type="button">关闭</button>
      </div>
    </section>
    <div class="grid">
      <section class="card">
        <h2>运行上下文</h2>
        <div id="context" class="muted">正在读取…</div>
      </section>
      <section class="card">
        <div class="row">
          <h2>实例列表</h2>
          <button id="refresh" class="secondary" type="button">刷新</button>
        </div>
        <div id="instances" class="muted">正在读取…</div>
        <div id="error"></div>
      </section>
    </div>
  </main>
  <script>
    (function () {
      var channel = new URLSearchParams(location.search).get('channel') || ''
      var pending = new Map()

      function request(action, payload) {
        var requestId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random()
        return new Promise(function (resolve, reject) {
          var timeout = setTimeout(function () {
            pending.delete(requestId)
            reject(new Error('面板响应超时'))
          }, 10000)
          pending.set(requestId, { resolve: resolve, reject: reject, timeout: timeout })
          parent.postMessage({
            type: 'gsm4:plugin:request',
            channel: channel,
            requestId: requestId,
            action: action,
            payload: payload || {}
          }, '*')
        })
      }

      function notify(message, tone) {
        parent.postMessage({
          type: 'gsm4:plugin:notify',
          channel: channel,
          payload: { message: message, tone: tone || 'info' }
        }, '*')
      }

      window.addEventListener('message', function (event) {
        var message = event.data
        if (event.source !== parent || !message || message.channel !== channel || message.type !== 'gsm4:plugin:response') return
        var active = pending.get(message.requestId)
        if (!active) return
        clearTimeout(active.timeout)
        pending.delete(message.requestId)
        if (message.ok) active.resolve(message.data)
        else active.reject(new Error(message.error || '请求失败'))
      })

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]
        })
      }

      async function loadContext() {
        var data = await request('context.get')
        document.getElementById('context').innerHTML =
          '<div>面板：<code>' + escapeHtml(data.product) + '</code></div>' +
          '<div>用户：<code>' + escapeHtml(data.user.username) + '</code>（' + escapeHtml(data.user.role) + '）</div>' +
          '<div>插件：<code>' + escapeHtml(data.plugin.name) + '</code></div>'
      }

      async function runInstanceAction(id, action, button) {
        button.disabled = true
        try {
          await request('instances.' + action, { id: id })
          notify('实例操作已提交', 'success')
          await loadInstances()
        } catch (error) {
          notify(error.message, 'error')
        } finally {
          button.disabled = false
        }
      }

      async function loadInstances() {
        var container = document.getElementById('instances')
        var errorBox = document.getElementById('error')
        container.textContent = '正在读取…'
        errorBox.textContent = ''
        try {
          var instances = await request('instances.list')
          if (!instances.length) {
            container.textContent = '当前还没有实例。'
            return
          }
          container.innerHTML = instances.map(function (item) {
            return '<div class="instance" data-id="' + escapeHtml(item.id) + '">' +
              '<div class="row"><strong>' + escapeHtml(item.name) + '</strong><span class="status">' + escapeHtml(item.status) + '</span></div>' +
              '<div class="muted">' + escapeHtml(item.workingDirectory) + '</div>' +
              '<div class="actions"><button data-action="start" type="button">启动</button>' +
              '<button data-action="stop" class="secondary" type="button">停止</button>' +
              '<button data-action="restart" class="secondary" type="button">重启</button></div></div>'
          }).join('')
          container.querySelectorAll('button[data-action]').forEach(function (button) {
            button.addEventListener('click', function () {
              var row = button.closest('[data-id]')
              runInstanceAction(row.dataset.id, button.dataset.action, button)
            })
          })
        } catch (error) {
          container.textContent = ''
          errorBox.textContent = error.message
        }
      }

      document.getElementById('refresh').addEventListener('click', loadInstances)
      document.getElementById('close').addEventListener('click', function () {
        parent.postMessage({ type: 'gsm4:plugin:close', channel: channel }, '*')
      })
      loadContext().catch(function (error) { document.getElementById('context').textContent = error.message })
      loadInstances()
    })()
  </script>
</body>
</html>
`
