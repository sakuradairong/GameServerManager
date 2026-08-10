import { useState, type FormEvent } from 'react'
import type { DeploySource, DeployUploadResult, MrpackLoader } from '@gsm4/shared'
import { apiClient, ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySession } from '../hooks/useDeploySession'
import { DeployConsole } from '../components/DeployConsole'
import { SourcePicker } from '../components/SourcePicker'

type LoaderOption = 'auto' | MrpackLoader

const LOADER_OPTIONS: { value: LoaderOption; label: string }[] = [
  { value: 'auto', label: '自动识别（推荐）' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'quilt', label: 'Quilt' },
  { value: 'forge', label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' },
]

export function MrpackDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySession()
  const [instanceName, setInstanceName] = useState('mrpack-demo')
  const [installName, setInstallName] = useState('mrpack-demo')
  const [source, setSource] = useState<DeploySource>('url')
  const [mrpackUrl, setMrpackUrl] = useState('')
  const [loaderType, setLoaderType] = useState<LoaderOption>('auto')
  const [minecraftVersion, setMinecraftVersion] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadInfo, setUploadInfo] = useState<DeployUploadResult | null>(null)
  const [uploading, setUploading] = useState(false)

  async function ensureUploadId(): Promise<string> {
    if (uploadInfo?.uploadId) return uploadInfo.uploadId
    if (!file) throw new Error('请先选择 .mrpack 文件')
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<DeployUploadResult>(
        '/api/v1/deploy/upload?kind=mrpack',
        file,
      )
      setUploadInfo(uploaded)
      return uploaded.uploadId
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const common = {
        type: 'mrpack' as const,
        instanceName,
        installName,
        ...(loaderType !== 'auto' ? { loaderType } : {}),
        ...(minecraftVersion.trim() ? { minecraftVersion: minecraftVersion.trim() } : {}),
      }
      if (source === 'upload') {
        const uploadId = await ensureUploadId()
        await deploy.start({ ...common, source: 'upload', uploadId })
      } else {
        await deploy.start({ ...common, source: 'url', mrpackUrl })
      }
      push('Modrinth 整合包部署已开始', 'success')
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
        <h3 style={{ marginTop: 0 }}>Modrinth 整合包部署</h3>
        <p className="page-desc">
          支持 .mrpack（Modrinth 整合包）。按 modrinth.index.json 下载 mods 与 overrides，自动安装对应加载器并写入
          eula。
        </p>
        <SourcePicker
          value={source}
          onChange={(next) => {
            setSource(next)
            setUploadInfo(null)
          }}
          urlLabel="URL 下载"
          uploadLabel="本地上传"
        />
        <div className="form-grid" style={{ marginTop: 16 }}>
          <label className="field">
            <span>实例名</span>
            <input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} required />
          </label>
          <label className="field">
            <span>安装目录名</span>
            <input value={installName} onChange={(e) => setInstallName(e.target.value)} required />
          </label>

          {source === 'url' ? (
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>.mrpack 下载 URL</span>
              <input
                value={mrpackUrl}
                onChange={(e) => setMrpackUrl(e.target.value)}
                placeholder="https://.../modpack.mrpack"
                required
              />
            </label>
          ) : (
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>上传 .mrpack 文件</span>
              <input
                type="file"
                accept=".mrpack,application/zip"
                required={!uploadInfo}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null)
                  setUploadInfo(null)
                }}
              />
              <span className="muted" style={{ marginTop: 6 }}>
                {uploadInfo
                  ? `已上传：${uploadInfo.fileName}（${uploadInfo.size} B）`
                  : file
                    ? `已选择：${file.name}`
                    : '选择 .mrpack 整合包文件'}
              </span>
            </label>
          )}

          <label className="field">
            <span>加载器</span>
            <select value={loaderType} onChange={(e) => setLoaderType(e.target.value as LoaderOption)}>
              {LOADER_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Minecraft 版本（可选覆盖）</span>
            <input
              value={minecraftVersion}
              onChange={(e) => setMinecraftVersion(e.target.value)}
              placeholder="留空则按整合包声明"
            />
          </label>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" type="submit" disabled={deploy.submitting || uploading}>
            {uploading ? '上传中…' : deploy.submitting ? '提交中…' : '开始部署'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!deploy.session}
            onClick={() => deploy.cancel().catch((e) => push(e.message, 'error'))}
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
