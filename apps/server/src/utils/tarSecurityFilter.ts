/**
 * TAR 安全过滤器：缓解符号链接投毒、硬链接逃逸与路径穿越。
 */
import path from 'node:path'
import * as tar from 'tar'

type TarExtractOptions = Parameters<typeof tar.extract>[0]
const DEFAULT_MAX_EXTRACTED_BYTES = 64 * 1024 * 1024 * 1024

export function maxExtractedBytes(): number {
  const configured = Number(process.env.GSM4_MAX_EXTRACTED_BYTES)
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_EXTRACTED_BYTES
}

function isAbsolutePortable(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value)
}

function containsParentSegment(value: string): boolean {
  return value.split(/[\\/]+/u).includes('..')
}

function hasUnsafeLinkTarget(entry: tar.ReadEntry): boolean {
  const linkpath = entry.linkpath
  return Boolean(
    linkpath && (isAbsolutePortable(linkpath) || containsParentSegment(linkpath)),
  )
}

function isRejectedLink(
  entry: tar.ReadEntry,
  blockSymbolicLinks: boolean,
  blockHardLinks: boolean,
): boolean {
  if (entry.type === 'SymbolicLink') {
    return blockSymbolicLinks || hasUnsafeLinkTarget(entry)
  }
  if (entry.type === 'Link') {
    return blockHardLinks || hasUnsafeLinkTarget(entry)
  }
  return false
}

function pathEscapesRoot(cwd: string, filePath: string): boolean {
  if (isAbsolutePortable(filePath) || containsParentSegment(filePath)) return true
  const resolvedPath = path.resolve(cwd, filePath)
  const resolvedCwd = path.resolve(cwd)
  return resolvedPath !== resolvedCwd && !resolvedPath.startsWith(resolvedCwd + path.sep)
}

export interface TarSecurityFilterOptions {
  cwd: string
  blockSymbolicLinks?: boolean
  blockHardLinks?: boolean
  onLimitExceeded?: () => void
  onEntryRejected?: (filePath: string) => void
}

export function createTarSecurityFilter(options: TarSecurityFilterOptions) {
  const {
    cwd,
    blockSymbolicLinks = true,
    blockHardLinks = true,
    onLimitExceeded,
    onEntryRejected,
  } = options
  let extractedBytes = 0
  const byteLimit = maxExtractedBytes()
  let limitExceeded = false

  return (filePath: string, entry: tar.ReadEntry): boolean => {
    if (limitExceeded) return false
    const entrySize = Number(entry.size)
    if (Number.isFinite(entrySize) && entrySize > 0) {
      extractedBytes += entrySize
      if (extractedBytes > byteLimit) {
        limitExceeded = true
        onLimitExceeded?.()
        return false
      }
    }

    if (
      isRejectedLink(entry, blockSymbolicLinks, blockHardLinks) ||
      pathEscapesRoot(cwd, filePath)
    ) {
      onEntryRejected?.(filePath)
      return false
    }

    return true
  }
}

export interface SafeTarExtractOptions {
  tarOptions?: Partial<TarExtractOptions>
  onLimitExceeded?: () => void
  onEntryRejected?: (filePath: string) => void
}

export function createSafeTarExtractOptions(
  file: string,
  cwd: string,
  options: SafeTarExtractOptions = {},
): TarExtractOptions {
  const { tarOptions, onLimitExceeded, onEntryRejected } = options
  return {
    ...tarOptions,
    file,
    cwd,
    maxDecompressionRatio: Math.min(tarOptions?.maxDecompressionRatio ?? 100, 100),
    filter: createTarSecurityFilter({ cwd, onLimitExceeded, onEntryRejected }),
  } as TarExtractOptions
}
