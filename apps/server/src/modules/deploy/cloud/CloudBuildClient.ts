import {
  CloudBuildCatalogSchema,
  CloudBuildTaskCreatedSchema,
  CloudBuildTaskStatusSchema,
  type CloudBuildCatalog,
  type CloudBuildParams,
  type CloudBuildTaskCreated,
  type CloudBuildTaskStatus,
} from '@gsm4/shared'

export const CLOUD_BUILD_SERVER = 'https://tools.xiaozhuhouses.asia/'
const CLOUD_BUILD_TOOL_KEY = 'minecraft-java-core-assembler'
const DEFAULT_USER_AGENT = 'GSM4-CloudBuild/1.0'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && value.success === true && 'data' in value) {
    return value.data
  }
  return value
}

function readMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.message === 'string' && value.message.trim()) return value.message
  if (typeof value.error === 'string' && value.error.trim()) return value.error
  return undefined
}

async function requestJson(
  url: URL,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': DEFAULT_USER_AGENT,
        ...init.headers,
      },
    })
    const text = await response.text()
    let payload: unknown = text
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        // 非 JSON 错误响应保留为文本，便于给出可读错误。
      }
    }

    if (!response.ok) {
      const message = readMessage(payload) || (typeof payload === 'string' ? payload : '')
      throw Object.assign(
        new Error(message || `云构建上游请求失败: HTTP ${response.status}`),
        { statusCode: response.status },
      )
    }
    return unwrapData(payload)
  } catch (error) {
    if (signal?.aborted) throw new Error('部署已取消')
    if (timedOut) throw new Error('云构建上游请求超时')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export class CloudBuildClient {
  async getCatalog(coreType?: string, signal?: AbortSignal): Promise<CloudBuildCatalog> {
    const url = new URL(`/api/tools/${CLOUD_BUILD_TOOL_KEY}/catalog`, CLOUD_BUILD_SERVER)
    if (coreType?.trim()) url.searchParams.set('coreType', coreType.trim())
    const payload = await requestJson(url, { method: 'GET' }, signal)
    return CloudBuildCatalogSchema.parse(payload)
  }

  async createBuild(
    params: CloudBuildParams,
    signal?: AbortSignal,
  ): Promise<CloudBuildTaskCreated> {
    const url = new URL(`/api/open/tools/${CLOUD_BUILD_TOOL_KEY}/execute`, CLOUD_BUILD_SERVER)
    const payload = await requestJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params }),
      },
      signal,
      60_000,
    )
    return CloudBuildTaskCreatedSchema.parse(payload)
  }

  async getBuildStatus(
    requestId: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<CloudBuildTaskStatus> {
    const url = new URL(
      `/api/open/tools/${CLOUD_BUILD_TOOL_KEY}/tasks/${encodeURIComponent(requestId)}`,
      CLOUD_BUILD_SERVER,
    )
    const payload = await requestJson(
      url,
      {
        method: 'GET',
        headers: { 'X-Task-Access-Token': accessToken },
      },
      signal,
    )
    return CloudBuildTaskStatusSchema.parse(payload)
  }

  resolveDownloadUrl(downloadUrl: string): string {
    return new URL(downloadUrl, CLOUD_BUILD_SERVER).toString()
  }
}

export const cloudBuildClient = new CloudBuildClient()
