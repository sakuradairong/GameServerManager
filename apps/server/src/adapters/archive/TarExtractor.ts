import * as tar from 'tar'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  createSafeTarExtractOptions,
  maxExtractedBytes,
} from '../../utils/tarSecurityFilter.js'

async function extractSafeTar(archivePath: string, destination: string) {
  let limitExceeded = false
  let rejectedEntry: string | undefined
  await tar.extract(
    createSafeTarExtractOptions(
      archivePath,
      destination,
      {
        onLimitExceeded: () => {
          limitExceeded = true
        },
        onEntryRejected: (filePath) => {
          rejectedEntry ||= filePath
        },
      },
    ),
  )
  if (limitExceeded) {
    throw new Error(`归档解压后超过 ${maxExtractedBytes()} 字节限制`)
  }
  if (rejectedEntry) throw new Error(`归档包含不安全条目: ${rejectedEntry}`)
}

export async function extractTarGzArchive(archivePath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  await extractSafeTar(archivePath, destination)
}

/**
 * 解压 .tar.xz：Node 原生不支持 xz，先用系统 `xz -dc` 解压为临时 .tar，
 * 再复用统一 TAR 安全解压器（缓解符号/硬链接投毒与目录穿越）。
 */
export async function extractTarXzArchive(
  archivePath: string,
  destination: string,
  signal?: AbortSignal,
) {
  await fs.mkdir(destination, { recursive: true })
  const tarPath = path.join(
    path.dirname(archivePath),
    `${path.basename(archivePath)}.decompressed.tar`,
  )

  const xz = spawn('xz', ['-dc', archivePath], { stdio: ['ignore', 'pipe', 'pipe'] })
  let decompressedBytes = 0
  const byteLimit = maxExtractedBytes()
  const sizeLimiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      decompressedBytes += chunk.length
      if (decompressedBytes > byteLimit) {
        callback(new Error(`归档解压后超过 ${byteLimit} 字节限制`))
        return
      }
      callback(null, chunk)
    },
  })
  let stderr = ''
  xz.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })

  const onAbort = () => xz.kill('SIGKILL')
  signal?.addEventListener('abort', onAbort, { once: true })

  const exitCode = new Promise<number>((resolve, reject) => {
    xz.on('error', reject)
    xz.on('close', (code) => resolve(code ?? 0))
  })

  try {
    await pipeline(xz.stdout, sizeLimiter, createWriteStream(tarPath))
    const code = await exitCode
    if (code !== 0) {
      throw new Error(`xz 解压失败（退出码 ${code}）: ${stderr.trim() || '未知错误'}`)
    }
    await extractSafeTar(tarPath, destination)
  } finally {
    signal?.removeEventListener('abort', onAbort)
    xz.kill('SIGKILL')
    await fs.rm(tarPath, { force: true }).catch(() => undefined)
  }
}
