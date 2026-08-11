const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10
const MAX_BUCKETS = 10_000

interface AttemptBucket {
  failures: number
  resetAt: number
}

export class LoginAttemptLimiter {
  private buckets = new Map<string, AttemptBucket>()

  assertAllowed(key: string): void {
    const bucket = this.currentBucket(key)
    if (!bucket || bucket.failures < MAX_FAILURES) return
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000))
    throw Object.assign(new Error('登录失败次数过多，请稍后再试'), {
      statusCode: 429,
      retryAfter,
    })
  }

  recordFailure(key: string): void {
    const current = this.currentBucket(key)
    this.buckets.set(
      key,
      current
        ? { ...current, failures: current.failures + 1 }
        : { failures: 1, resetAt: Date.now() + FAILURE_WINDOW_MS },
    )
    this.pruneIfNeeded()
  }

  clear(key: string): void {
    this.buckets.delete(key)
  }

  private currentBucket(key: string): AttemptBucket | undefined {
    const bucket = this.buckets.get(key)
    if (bucket && bucket.resetAt <= Date.now()) {
      this.buckets.delete(key)
      return undefined
    }
    return bucket
  }

  private pruneIfNeeded(): void {
    if (this.buckets.size <= MAX_BUCKETS) return
    const now = Date.now()
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
    while (this.buckets.size > MAX_BUCKETS) {
      const oldestKey = this.buckets.keys().next().value as string | undefined
      if (!oldestKey) break
      this.buckets.delete(oldestKey)
    }
  }
}

export const loginAttemptLimiter = new LoginAttemptLimiter()
