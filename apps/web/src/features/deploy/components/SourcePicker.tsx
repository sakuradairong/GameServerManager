import type { DeploySource } from '@gsm4/shared'

export function SourcePicker({
  value,
  onChange,
  urlLabel,
  uploadLabel,
}: {
  value: DeploySource
  onChange: (value: DeploySource) => void
  urlLabel: string
  uploadLabel: string
}) {
  return (
    <div className="source-picker">
      <button
        type="button"
        className={`deploy-tab${value === 'url' ? ' active' : ''}`}
        onClick={() => onChange('url')}
      >
        {urlLabel}
      </button>
      <button
        type="button"
        className={`deploy-tab${value === 'upload' ? ' active' : ''}`}
        onClick={() => onChange('upload')}
      >
        {uploadLabel}
      </button>
    </div>
  )
}
