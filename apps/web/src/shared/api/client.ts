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

class ApiClient {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    })

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

  get<T>(path: string) {
    return this.request<T>(path)
  }

  post<T>(path: string, body: unknown = {}) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    })
  }
}

export const apiClient = new ApiClient()
