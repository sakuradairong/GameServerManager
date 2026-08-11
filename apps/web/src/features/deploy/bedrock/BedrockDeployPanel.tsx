import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../shared/api/client'
import { useToast } from '../../../shared/ui/Toast'
import { useDeploySessionContext } from '../context/DeploySessionContext'
import { DeployConsole } from '../components/DeployConsole'

export function BedrockDeployPanel() {
  const { push } = useToast()
  const deploy = useDeploySessionContext()
  const [instanceName, setInstanceName] = useState('bedrock-demo')
  const [installName, setInstallName] = useState('bedrock-demo')
  const [versionType, setVersionType] = useState<'stable' | 'preview'>('stable')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await deploy.start({
        type: 'bedrock',
        instanceName,
        installName,
        versionType,
      })
      push('基岩版部署已开始', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '启动失败', 'error')
    }
  }

  return (
    <div className="stack">
      <form className="page-card" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>Minecraft 基岩版</h3>
        <p className="page-desc">
          从官方链接拉取最新服务端压缩包并解压，自动写入启动命令。
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
            <span>版本类型</span>
            <select
              value={versionType}
              onChange={(e) => setVersionType(e.target.value as 'stable' | 'preview')}
            >
              <option value="stable">正式版</option>
              <option value="preview">预览版</option>
            </select>
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
