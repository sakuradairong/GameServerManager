/**
 * TAR 安全过滤器：缓解符号链接投毒、硬链接逃逸与路径穿越。
 */
import path from 'node:path'
import * as tar from 'tar'

type TarExtractOptions = Parameters<typeof tar.extract>[0]

export interface TarSecurityFilterOptions {
  cwd: string
  blockSymbolicLinks?: boolean
  blockHardLinks?: boolean
  verbose?: boolean
}

export function createTarSecurityFilter(options: TarSecurityFilterOptions) {
  const {
    cwd,
    blockSymbolicLinks = true,
    blockHardLinks = true,
    verbose = false,
  } = options

  return (filePath: string, entry: tar.ReadEntry): boolean => {
    if (entry.type === 'SymbolicLink') {
      if (blockSymbolicLinks) {
        if (verbose) console.warn(`[TAR安全过滤] 阻止符号链接: ${filePath}`)
        return false
      }
      const linkpath = (entry as { linkpath?: string }).linkpath
      if (linkpath && (path.isAbsolute(linkpath) || linkpath.includes('..'))) {
        if (verbose) console.warn(`[TAR安全过滤] 阻止危险符号链接: ${filePath} -> ${linkpath}`)
        return false
      }
    }

    if (entry.type === 'Link') {
      if (blockHardLinks) {
        if (verbose) console.warn(`[TAR安全过滤] 阻止硬链接: ${filePath}`)
        return false
      }
      const linkpath = (entry as { linkpath?: string }).linkpath
      if (linkpath && (path.isAbsolute(linkpath) || linkpath.includes('..'))) {
        if (verbose) console.warn(`[TAR安全过滤] 阻止危险硬链接: ${filePath} -> ${linkpath}`)
        return false
      }
    }

    if (path.isAbsolute(filePath)) {
      if (verbose) console.warn(`[TAR安全过滤] 阻止绝对路径: ${filePath}`)
      return false
    }

    if (filePath.includes('..')) {
      if (verbose) console.warn(`[TAR安全过滤] 阻止路径遍历: ${filePath}`)
      return false
    }

    const resolvedPath = path.resolve(cwd, filePath)
    const resolvedCwd = path.resolve(cwd)
    if (
      resolvedPath !== resolvedCwd &&
      !resolvedPath.startsWith(resolvedCwd + path.sep)
    ) {
      if (verbose) console.warn(`[TAR安全过滤] 阻止目录逃逸: ${filePath}`)
      return false
    }

    return true
  }
}

export function createSafeTarExtractOptions(
  file: string,
  cwd: string,
  additionalOptions?: Partial<TarExtractOptions>,
): TarExtractOptions {
  return {
    file,
    cwd,
    filter: createTarSecurityFilter({ cwd }),
    ...additionalOptions,
  } as TarExtractOptions
}
