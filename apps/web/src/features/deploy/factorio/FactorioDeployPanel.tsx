import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySessionContext } from '../context/DeploySessionContext'
import { DeployConsole } from '../components/DeployConsole'

export function FactorioDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySessionContext()
  const [instanceName, setInstanceName] = useState('factorio-demo')
  const [installName, setInstallName] = useState('factorio-demo')
  const [version, setVersion] = useState('stable')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await deploy.start({
        type: 'factorio',
        instanceName,
        installName,
        ...(version.trim() ? { version: version.trim() } : {}),
      })
      push('Factorio 部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : error instanceof Error ? error.message : '启动失败', 'error')
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>Factorio 部署</h3>
        <p className="page-desc">
          从官方下载 Factorio headless 服务端（linux64 / tar.xz），解压并生成初始存档，启动命令使用
          --start-server-load-latest。
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
          <label className="field">
            <span>版本</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="stable / latest / 1.1.110"
            />
            <span className="muted" style={{ marginTop: 6 }}>
              stable（默认）/ latest / 具体版本号
            </span>
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
