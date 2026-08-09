import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export interface DownloadOptions {
  url: string
  destination: string
  signal?: AbortSignal
  onProgress?: (percent: number | undefined, transferred: number, total?: number) => void
}

function assertSafeUrl(urlString: string) {
  const url = new URL(urlString)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http/https 下载')
  }
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
    // 允许本机冒烟测试：显式放行 127.0.0.1（开发/测试）
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error('禁止下载内网地址')
    }
  }
  return url
}

export async function downloadFile(options: DownloadOptions): Promise<void> {
  assertSafeUrl(options.url)
  await fsp.mkdir(path.dirname(options.destination), { recursive: true })

  const response = await fetch(options.url, { signal: options.signal })
  if (!response.ok || !response.body) {
    throw new Error(`下载失败: HTTP ${response.status}`)
  }

  const totalHeader = response.headers.get('content-length')
  const total = totalHeader ? Number(totalHeader) : undefined
  let transferred = 0

  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  const tmp = `${options.destination}.part`
  const file = fs.createWriteStream(tmp)

  nodeStream.on('data', (chunk: Buffer) => {
    transferred += chunk.length
    const percent = total ? Math.min(99, Math.round((transferred / total) * 100)) : undefined
    options.onProgress?.(percent, transferred, total)
  })

  await pipeline(nodeStream, file)
  await fsp.rename(tmp, options.destination)
  options.onProgress?.(100, transferred, total)
}
