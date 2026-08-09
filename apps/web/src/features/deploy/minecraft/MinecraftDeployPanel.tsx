import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySession } from '../hooks/useDeploySession'
import { DeployConsole } from '../components/DeployConsole'

export function MinecraftDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySession()
  const [instanceName, setInstanceName] = useState('mc-demo')
  const [installName, setInstallName] = useState('minecraft-demo')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [jarFileName, setJarFileName] = useState('server.jar')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await deploy.start({
        type: 'minecraft',
        instanceName,
        installName,
        downloadUrl,
        jarFileName,
        javaCommand: `java -Xms1G -Xmx2G -jar ${jarFileName} nogui`,
      })
      push('Minecraft 部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '启动失败', 'error')
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>Minecraft 部署</h3>
        <p className="page-desc">下载 jar 到默认安装目录并创建实例（DeploySession → minecraft 执行器）。</p>
        <div className="form-grid">
          <label className="field">
            <span>实例名</span>
            <input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} required />
          </label>
          <label className="field">
            <span>安装目录名</span>
            <input value={installName} onChange={(e) => setInstallName(e.target.value)} required />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Jar 下载 URL</span>
            <input
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://.../server.jar"
              required
            />
          </label>
          <label className="field">
            <span>Jar 文件名</span>
            <input value={jarFileName} onChange={(e) => setJarFileName(e.target.value)} required />
          </label>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" type="submit" disabled={deploy.submitting}>
            {deploy.submitting ? '提交中…' : '开始部署'}
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
