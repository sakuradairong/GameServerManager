import * as tar from 'tar'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 将 sourceDir 目录内容打包为 .tar.gz（归档内路径相对 sourceDir）。
 * 创建侧统一走 adapters/archive，禁止业务域直接拼 shell。
 */
export async function createTarGzArchive(sourceDir: string, archivePath: string) {
  const resolvedSource = path.resolve(sourceDir)
  const resolvedArchive = path.resolve(archivePath)

  const stat = await fs.stat(resolvedSource)
  if (!stat.isDirectory()) {
    throw Object.assign(new Error('备份源不是目录'), { statusCode: 400 })
  }

  await fs.mkdir(path.dirname(resolvedArchive), { recursive: true })
  await fs.rm(resolvedArchive, { force: true })

  await tar.create(
    {
      gzip: true,
      file: resolvedArchive,
      cwd: resolvedSource,
      portable: true,
    },
    ['.'],
  )
}
