import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySession } from '../hooks/useDeploySession'
import { DeployConsole } from '../components/DeployConsole'

export function TmodloaderDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySession()
  const [instanceName, setInstanceName] = useState('tmod-demo')
  const [installName, setInstallName] = useState('tmodloader-demo')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await deploy.start({
        type: 'tmodloader',
        instanceName,
        installName,
      })
      push('tModLoader 部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '启动失败', 'error')
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>tModLoader</h3>
        <p className="page-desc">
          从 GitHub Releases 下载最新服务端压缩包并解压，自动探测启动脚本。
        </p>
        <div className="form-grid">
          <label className="field">
            <span>实例名</span>
            <input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} required />
          </label>
          <label className="field">
            <span>安装目录名</span>
            <input value={installName} onChange={(e) => setInstallName(e.target.value)} required />
          </label>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" type="submit" disabled={deploy.submitting}>
            {deploy.submitting ? '提交中…' : '一键部署'}
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
