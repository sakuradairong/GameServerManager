import {
  LEGACY_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  type ApiErrorBody,
} from '@gsm4/shared'

export class ApiError extends Error {
  status: number
  body: ApiErrorBody | null

  constructor(message: string, status: number, body: ApiErrorBody | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function readToken(): string | null {
  const current = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (current) return current

  const legacy = localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY)
  if (legacy) {
    localStorage.setItem(TOKEN_STORAGE_KEY, legacy)
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY)
    return legacy
  }
  return null
}

export function setToken(token: string | null) {
  if (!token) {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY)
    return
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function getToken() {
  return readToken()
}

const AUTH_EXPIRED_EVENT = 'gsm4:auth-expired'

export function expireAuth() {
  setToken(null)
  apiClient.invalidateGetCache()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
}

export function onAuthExpired(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(AUTH_EXPIRED_EVENT, listener)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, listener)
}

/** 按变更接口失效相关 GET 缓存，避免每次 POST 清空全部缓存。 */
function invalidateForMutation(path: string) {
  if (path.startsWith('/api/v1/config')) {
    apiClient.invalidateGetCache('/api/v1/config')
    return
  }
  if (path.startsWith('/api/v1/plugins')) {
    apiClient.invalidateGetCache('/api/v1/plugins')
    return
  }
  if (path.startsWith('/api/v1/instances')) {
    apiClient.invalidateGetCache('/api/v1/instances')
    return
  }
  if (path.startsWith('/api/v1/catalog')) {
    apiClient.invalidateGetCache('/api/v1/catalog')
    return
  }
  if (path.startsWith('/api/v1/steamcmd')) {
    apiClient.invalidateGetCache('/api/v1/steamcmd')
    apiClient.invalidateGetCache('/api/v1/config')
    return
  }
  if (path.startsWith('/api/v1/files')) {
    apiClient.invalidateGetCache('/api/v1/files')
    return
  }
  // deploy / terminal 等不依赖短 TTL GET 缓存，无需全局清空
}

class ApiClient {
  private getCache = new Map<string, { expires: number; value: unknown }>()
  private inflightGets = new Map<string, Promise<unknown>>()

  invalidateGetCache(pathPrefix?: string) {
    if (!pathPrefix) {
      this.getCache.clear()
      return
    }
    for (const key of this.getCache.keys()) {
      if (key.startsWith(pathPrefix)) this.getCache.delete(key)
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      invalidateForMutation(path)
    }

    const headers = new Headers(init.headers || {})
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json')
    }

    const token = readToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(path, {
      ...init,
      headers,
      cache: 'no-store',
    })

    if (response.status === 401) expireAuth()

    const json = (await response.json().catch(() => null)) as
      | { success: true; data: T; message?: string }
      | ApiErrorBody
      | null

    if (!response.ok || !json || json.success === false) {
      const message =
        json && 'message' in json && json.message
          ? json.message
          : `请求失败 (${response.status})`
      throw new ApiError(
        message,
        response.status,
        json && json.success === false ? json : null,
      )
    }

    return json.data
  }

  get<T>(path: string, options?: { cacheTtlMs?: number }) {
    const ttl = options?.cacheTtlMs
    if (!ttl || ttl <= 0) return this.request<T>(path)

    const cached = this.getCache.get(path)
    if (cached && cached.expires > Date.now()) {
      return Promise.resolve(cached.value as T)
    }

    const inflight = this.inflightGets.get(path)
    if (inflight) return inflight as Promise<T>

    const promise = this.request<T>(path)
      .then((data) => {
        this.getCache.set(path, { value: data, expires: Date.now() + ttl })
        return data
      })
      .finally(() => {
        this.inflightGets.delete(path)
      })
    this.inflightGets.set(path, promise)
    return promise
  }

  post<T>(path: string, body: unknown = {}) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    })
  }

  put<T>(path: string, body: unknown = {}) {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body ?? {}),
    })
  }

  async upload<T>(path: string, file: File, fields?: Record<string, string>) {
    invalidateForMutation(path)
    const form = new FormData()
    form.append('file', file)
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, value)
      }
    }
    const token = getToken()
    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(path, {
      method: 'POST',
      headers,
      body: form,
      cache: 'no-store',
    })
    if (response.status === 401) expireAuth()
    const json = (await response.json().catch(() => null)) as
      | { success: true; data: T; message?: string }
      | ApiErrorBody
      | null
    if (!response.ok || !json || json.success === false) {
      throw new ApiError(
        json && 'message' in json && json.message
          ? json.message
          : `上传失败 (${response.status})`,
        response.status,
        json && json.success === false ? json : null,
      )
    }
    return json.data
  }
}

export const apiClient = new ApiClient()
