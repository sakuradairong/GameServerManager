import fs from 'node:fs/promises'
import path from 'node:path'
import extractZip from 'extract-zip'
import { resolveRelativePathInside } from '../../lib/safePath.js'
import { maxExtractedBytes } from '../../utils/tarSecurityFilter.js'

const ZIP_FILE_TYPE_MASK = 0o170000
const ZIP_SYMBOLIC_LINK_TYPE = 0o120000

/** zip 解压：extract-zip 会校验路径；再做一层目录逃逸检查 */
export async function extractZipArchive(archivePath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  const resolvedDest = path.resolve(destination)
  const byteLimit = maxExtractedBytes()
  let extractedBytes = 0

  await extractZip(archivePath, {
    dir: resolvedDest,
    onEntry: (entry) => {
      extractedBytes += entry.uncompressedSize
      if (extractedBytes > byteLimit) {
        throw new Error(`归档解压后超过 ${byteLimit} 字节限制`)
      }
      try {
        resolveRelativePathInside(resolvedDest, entry.fileName, { allowRoot: false })
      } catch {
        throw new Error(`检测到路径穿越: ${entry.fileName}`)
      }

      const mode = (entry.externalFileAttributes >> 16) & 0xffff
      if ((mode & ZIP_FILE_TYPE_MASK) === ZIP_SYMBOLIC_LINK_TYPE) {
        throw new Error(`ZIP 中禁止符号链接: ${entry.fileName}`)
      }
    },
  })
}
