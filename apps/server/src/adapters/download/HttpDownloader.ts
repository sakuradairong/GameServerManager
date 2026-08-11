import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { pipeline } from 'node:stream/promises'

export interface DownloadOptions {
  url: string
  destination: string
  signal?: AbortSignal
  onProgress?: (percent: number | undefined, transferred: number, total?: number) => void
}

export interface FetchTextOptions {
  url: string
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes: number
  requireHttps?: boolean
  headers?: Record<string, string>
}

function assertSafeUrl(urlString: string, requireHttps = false) {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error('下载地址无效')
  }
  if (requireHttps ? url.protocol !== 'https:' : url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http/https 下载')
  }
  if (url.username || url.password) throw new Error('下载地址不能包含认证信息')
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    if (process.env.GSM4_ALLOW_PRIVATE_DOWNLOADS !== '1') {
      throw new Error('禁止下载内网地址')
    }
  }
  return url
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7))
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number)
    const [first, second] = parts
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      first >= 224
    )
  }
  if (isIP(normalized) === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/u.test(normalized) ||
      normalized.startsWith('2001:db8:')
    )
  }
  return true
}

interface ResolvedTarget {
  address: string
  family: 4 | 6
}

async function resolveSafeTarget(url: URL): Promise<ResolvedTarget> {
  if (isIP(url.hostname)) {
    if (
      process.env.GSM4_ALLOW_PRIVATE_DOWNLOADS !== '1' &&
      isPrivateIp(url.hostname)
    ) {
      throw new Error('禁止下载内网地址')
    }
    return { address: url.hostname, family: isIP(url.hostname) as 4 | 6 }
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length) throw new Error('下载域名解析失败')
  if (
    process.env.GSM4_ALLOW_PRIVATE_DOWNLOADS !== '1' &&
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new Error('下载域名解析到内网或无效地址')
  }
  const target = addresses[0]
  return { address: target.address, family: target.family as 4 | 6 }
}

interface SafeRequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
}

function openResponse(
  url: URL,
  target: ResolvedTarget,
  options: SafeRequestOptions,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.get(
      url,
      {
        headers: options.headers,
        signal: options.signal,
        servername: isIP(url.hostname) ? undefined : url.hostname,
        lookup: (_hostname, _options, callback) => {
          callback(null, target.address, target.family)
        },
      },
      resolve,
    )
    request.once('error', reject)
  })
}

async function safeRequest(
  urlString: string,
  options: SafeRequestOptions,
  requireHttps = false,
): Promise<IncomingMessage> {
  let current = urlString
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const url = assertSafeUrl(current, requireHttps)
    const target = await resolveSafeTarget(url)
    // DNS is pinned to the validated address for this connection, preventing rebinding.
    const response = await openResponse(url, target, options)
    const status = response.statusCode ?? 0
    if (status < 300 || status >= 400) return response

    const rawLocation = response.headers.location
    const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation
    response.resume()
    if (!location) throw new Error('下载重定向缺少 Location')
    current = new URL(location, url).toString()
  }
  throw new Error('下载重定向次数超过限制')
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

export async function fetchText(options: FetchTextOptions): Promise<string> {
  assertSafeUrl(options.url, options.requireHttps)
  const response = await safeRequest(options.url, {
    headers: options.headers,
    signal: requestSignal(options.signal, options.timeoutMs ?? 30000),
  }, options.requireHttps)
  const status = response.statusCode ?? 0
  if (status < 200 || status >= 300) {
    response.resume()
    throw new Error(`下载失败: HTTP ${status}`)
  }

  const declaredSize = Number(response.headers['content-length'])
  if (Number.isFinite(declaredSize) && declaredSize > options.maxBytes) {
    response.destroy()
    throw new Error(`下载内容超过 ${options.maxBytes} 字节限制`)
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > options.maxBytes) {
      response.destroy()
      throw new Error(`下载内容超过 ${options.maxBytes} 字节限制`)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

export async function downloadFile(options: DownloadOptions): Promise<void> {
  assertSafeUrl(options.url)
  await fsp.mkdir(path.dirname(options.destination), { recursive: true })

  const response = await safeRequest(options.url, { signal: options.signal })
  const status = response.statusCode ?? 0
  if (status < 200 || status >= 300) {
    response.resume()
    throw new Error(`下载失败: HTTP ${status}`)
  }

  const totalHeader = response.headers['content-length']
  const total = totalHeader ? Number(totalHeader) : undefined
  let transferred = 0

  const tmp = `${options.destination}.part`
  const file = fs.createWriteStream(tmp)

  response.on('data', (chunk: Buffer) => {
    transferred += chunk.length
    const percent = total ? Math.min(99, Math.round((transferred / total) * 100)) : undefined
    options.onProgress?.(percent, transferred, total)
  })

  try {
    await pipeline(response, file)
    await fsp.rename(tmp, options.destination)
  } catch (error) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
  options.onProgress?.(100, transferred, total)
}
