import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const writeQueues = new Map<string, Promise<void>>()

export function isFileNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/**
 * Serialize writes per file and replace the target atomically so a crash cannot
 * leave a partially-written JSON document behind.
 */
export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
  options: { mode?: number; compact?: boolean } = {},
): Promise<void> {
  const mode = options.mode ?? 0o600
  const compact = options.compact ?? false
  const resolvedPath = path.resolve(filePath)
  const previous = writeQueues.get(resolvedPath) ?? Promise.resolve()
  const scheduled = previous.catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
    const temporaryPath = path.join(
      path.dirname(resolvedPath),
      `.${path.basename(resolvedPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    )

    try {
      await fs.writeFile(
        temporaryPath,
        compact ? JSON.stringify(value) : JSON.stringify(value, null, 2),
        {
          encoding: 'utf8',
          mode,
        },
      )
      await fs.rename(temporaryPath, resolvedPath)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  })

  writeQueues.set(resolvedPath, scheduled)
  try {
    await scheduled
  } finally {
    if (writeQueues.get(resolvedPath) === scheduled) {
      writeQueues.delete(resolvedPath)
    }
  }
}
