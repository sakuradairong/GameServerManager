import * as tar from 'tar'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createSafeTarExtractOptions } from '../../utils/tarSecurityFilter.js'

export async function extractTarGzArchive(archivePath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  await tar.extract(createSafeTarExtractOptions(archivePath, destination))
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
    await pipeline(xz.stdout, createWriteStream(tarPath))
    const code = await exitCode
    if (code !== 0) {
      throw new Error(`xz 解压失败（退出码 ${code}）: ${stderr.trim() || '未知错误'}`)
    }
    await tar.extract(createSafeTarExtractOptions(tarPath, destination))
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await fs.rm(tarPath, { force: true }).catch(() => undefined)
  }
}
