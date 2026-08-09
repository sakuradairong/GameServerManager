import fs from 'node:fs/promises'
import path from 'node:path'
import extractZip from 'extract-zip'

function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  )
}

/** zip 解压：extract-zip 会校验路径；再做一层目录逃逸检查 */
export async function extractZipArchive(archivePath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  const resolvedDest = path.resolve(destination)

  await extractZip(archivePath, {
    dir: resolvedDest,
    onEntry: (entry) => {
      const target = path.resolve(resolvedDest, entry.fileName)
      if (!isPathInside(resolvedDest, target)) {
        throw new Error(`检测到路径穿越: ${entry.fileName}`)
      }
    },
  })
}
