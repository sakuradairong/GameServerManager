import fs from 'node:fs/promises'
import path from 'node:path'

function comparable(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function invalidPath(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 })
}

export function isPathInside(root: string, target: string, allowRoot = true): boolean {
  const resolvedRoot = comparable(root)
  const resolvedTarget = comparable(target)
  return (
    (allowRoot && resolvedTarget === resolvedRoot) ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  )
}

export function pathsOverlap(first: string, second: string): boolean {
  return isPathInside(first, second) || isPathInside(second, first)
}

export function assertSafePathSegment(value: string, label = '路径名称'): string {
  const segment = value.trim()
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    /[\\/<>:"|?*\x00-\x1F]/u.test(segment)
  ) {
    throw invalidPath(`${label}无效`)
  }
  return segment
}

export function resolveRelativePathInside(
  root: string,
  relativePath: string,
  options: { allowRoot?: boolean; singleSegment?: boolean } = {},
): string {
  const normalized = relativePath.replace(/\\/g, '/')
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(relativePath)) {
    throw invalidPath('路径必须是相对路径')
  }

  const segments = normalized.split('/').filter((segment) => segment && segment !== '.')
  if (segments.includes('..')) {
    throw invalidPath('路径包含目录穿越片段')
  }
  if (options.singleSegment && segments.length !== 1) {
    throw invalidPath('路径必须是单个文件名')
  }

  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...segments)
  if (!isPathInside(resolvedRoot, target, options.allowRoot ?? false)) {
    throw invalidPath('路径逃逸出允许目录')
  }
  return target
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let current = path.resolve(candidate)
  while (true) {
    try {
      await fs.lstat(current)
      return current
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      current = parent
    }
  }
}

/**
 * Verify the nearest existing path through realpath so an in-root symlink
 * cannot redirect reads or writes outside the configured sandbox.
 */
export async function assertNoSymlinkEscape(
  root: string,
  target: string,
  options: { followLeaf?: boolean; allowRoot?: boolean } = {},
): Promise<void> {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (!isPathInside(resolvedRoot, resolvedTarget, options.allowRoot ?? true)) {
    throw invalidPath('路径逃逸出允许目录')
  }

  const realRoot = await fs.realpath(resolvedRoot)
  const probe = options.followLeaf === false ? path.dirname(resolvedTarget) : resolvedTarget
  const existing = await nearestExistingPath(probe)
  const realExisting = await fs.realpath(existing)
  const effectiveTarget = path.resolve(realExisting, path.relative(existing, resolvedTarget))
  if (!isPathInside(realRoot, effectiveTarget, options.allowRoot ?? true)) {
    throw invalidPath('路径通过符号链接逃逸出允许目录')
  }
}
