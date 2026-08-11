import { useState, type FormEvent } from 'react'
import type { DeploySource, DeployUploadResult } from '@gsm4/shared'
import { apiClient, ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySessionContext } from '../context/DeploySessionContext'
import { DeployConsole } from '../components/DeployConsole'
import { SourcePicker } from '../components/SourcePicker'

export function MinecraftDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySessionContext()
  const [instanceName, setInstanceName] = useState('mc-demo')
  const [installName, setInstallName] = useState('minecraft-demo')
  const [source, setSource] = useState<DeploySource>('upload')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [jarFileName, setJarFileName] = useState('server.jar')
  const [file, setFile] = useState<File | null>(null)
  const [uploadInfo, setUploadInfo] = useState<DeployUploadResult | null>(null)
  const [uploading, setUploading] = useState(false)

  async function ensureUploadId(): Promise<string> {
    if (uploadInfo?.uploadId) return uploadInfo.uploadId
    if (!file) throw new Error('请先选择 jar 文件')
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<DeployUploadResult>(
        '/api/v1/deploy/upload?kind=minecraft',
        file,
      )
      setUploadInfo(uploaded)
      if (!jarFileName || jarFileName === 'server.jar') {
        setJarFileName(uploaded.fileName)
      }
      return uploaded.uploadId
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      if (source === 'upload') {
        const uploadId = await ensureUploadId()
        await deploy.start({
          type: 'minecraft',
          source: 'upload',
          instanceName,
          installName,
          uploadId,
          jarFileName: jarFileName || file?.name || 'server.jar',
          javaCommand: `java -Xms1G -Xmx2G -jar ${jarFileName || file?.name || 'server.jar'} nogui`,
        })
      } else {
        await deploy.start({
          type: 'minecraft',
          source: 'url',
          instanceName,
          installName,
          downloadUrl,
          jarFileName,
          javaCommand: `java -Xms1G -Xmx2G -jar ${jarFileName} nogui`,
        })
      }
      push('Minecraft 部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : error instanceof Error ? error.message : '启动失败', 'error')
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>Minecraft 部署</h3>
        <p className="page-desc">支持本地上传 jar，或通过 URL 下载后创建实例。</p>
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
              <span>Jar 下载 URL</span>
              <input
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="https://.../server.jar"
                required
              />
            </label>
          ) : (
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>上传 Jar 文件</span>
              <input
                type="file"
                accept=".jar,application/java-archive"
                required={!uploadInfo}
                onChange={(e) => {
                  const next = e.target.files?.[0] || null
                  setFile(next)
                  setUploadInfo(null)
                  if (next) setJarFileName(next.name)
                }}
              />
              <span className="muted" style={{ marginTop: 6 }}>
                {uploadInfo
                  ? `已上传：${uploadInfo.fileName}（${uploadInfo.size} B）`
                  : file
                    ? `已选择：${file.name}`
                    : '选择 .jar 服务端核心'}
              </span>
            </label>
          )}

          <label className="field">
            <span>Jar 文件名</span>
            <input value={jarFileName} onChange={(e) => setJarFileName(e.target.value)} required />
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
