import { useEffect, useState, type FormEvent } from 'react'
import type { CloudBuildCatalog } from '@gsm4/shared'
import { apiClient, ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { DeployConsole } from '../components/DeployConsole'
import { useDeploySession } from '../hooks/useDeploySession'

export function CloudDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySession()
  const [instanceName, setInstanceName] = useState('cloud-mc-demo')
  const [installName, setInstallName] = useState('cloud-minecraft-demo')
  const [coreTypes, setCoreTypes] = useState<string[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [coreType, setCoreType] = useState('')
  const [version, setVersion] = useState('')
  const [mcVersion, setMcVersion] = useState('')
  const [loadingCoreTypes, setLoadingCoreTypes] = useState(true)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const catalog = await apiClient.get<CloudBuildCatalog>('/api/cloud-build/catalog')
        if (cancelled) return
        const nextCoreTypes = catalog.coreTypes || []
        setCoreTypes(nextCoreTypes)
        setCoreType((current) => current || nextCoreTypes[0] || '')
        setCatalogError(null)
      } catch (error) {
        if (cancelled) return
        const message =
          error instanceof Error ? error.message : '加载云构建核心类型失败'
        setCatalogError(message)
        push(message, 'error')
      } finally {
        if (!cancelled) setLoadingCoreTypes(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [push])

  useEffect(() => {
    const selectedCoreType = coreType.trim()
    if (!selectedCoreType) {
      setVersions([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoadingVersions(true)
      apiClient
        .get<CloudBuildCatalog>(
          `/api/cloud-build/catalog?coreType=${encodeURIComponent(selectedCoreType)}`,
        )
        .then((catalog) => {
          if (cancelled) return
          const nextVersions = catalog.versions || []
          setVersions(nextVersions)
          if (nextVersions.length > 0) {
            setVersion(nextVersions[0])
            setMcVersion(nextVersions[0])
          }
          setCatalogError(null)
        })
        .catch((error) => {
          if (cancelled) return
          const message = error instanceof Error ? error.message : '加载云构建版本失败'
          setCatalogError(message)
          push(message, 'error')
        })
        .finally(() => {
          if (!cancelled) setLoadingVersions(false)
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [coreType, push])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await deploy.start({
        type: 'cloud',
        instanceName,
        installName,
        coreType: coreType.trim(),
        version: version.trim(),
        mcVersion: mcVersion.trim(),
      })
      push('云构建部署已开始', 'success')
    } catch (error) {
      push(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : '启动失败',
        'error',
      )
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>云构建部署</h3>
        <p className="page-desc">
          从云构建目录选择 Minecraft Java 核心，服务端统一提交构建、轮询状态、下载并安全解压，进度复用
          deploy:* 会话。
        </p>

        <datalist id="cloud-core-types">
          {coreTypes.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <datalist id="cloud-core-versions">
          {versions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>

        <div className="form-grid">
          <label className="field">
            <span>实例名</span>
            <input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} required />
          </label>
          <label className="field">
            <span>安装目录名</span>
            <input value={installName} onChange={(e) => setInstallName(e.target.value)} required />
          </label>
          <label className="field">
            <span>核心类型</span>
            <input
              list="cloud-core-types"
              value={coreType}
              onChange={(e) => setCoreType(e.target.value)}
              placeholder={loadingCoreTypes ? '正在加载目录…' : '例如 paper'}
              required
            />
          </label>
          <label className="field">
            <span>核心版本</span>
            <input
              list="cloud-core-versions"
              value={version}
              onChange={(e) => {
                setVersion(e.target.value)
                setMcVersion(e.target.value)
              }}
              placeholder={loadingVersions ? '正在加载版本…' : '例如 1.21.1'}
              required
            />
          </label>
          <label className="field">
            <span>Minecraft 版本</span>
            <input
              value={mcVersion}
              onChange={(e) => setMcVersion(e.target.value)}
              placeholder="默认与核心版本一致"
              required
            />
          </label>
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          {catalogError
            ? `目录服务暂不可用，仍可手动填写：${catalogError}`
            : loadingCoreTypes || loadingVersions
              ? '正在同步云构建目录…'
              : `已加载 ${coreTypes.length} 个核心类型，当前核心有 ${versions.length} 个版本。`}
        </p>

        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" type="submit" disabled={deploy.submitting}>
            {deploy.submitting ? '提交中…' : '开始云构建'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!deploy.session}
            onClick={() => deploy.cancel().catch((error) => push(error.message, 'error'))}
          >
            取消
          </button>
        </div>
      </form>

      <DeployConsole
        session={deploy.session}
        progress={deploy.progress}
        logs={deploy.logs}
        error={deploy.error}
      />
    </div>
  )
}
