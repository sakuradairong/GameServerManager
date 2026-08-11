import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { FileEntry, FileListResult } from '@gsm4/shared'
import { apiClient, ApiError } from '../../shared/api/client'
import { useToast } from '../../shared/ui/Toast'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'

const FILE_PAGE_SIZE = 200

export function FilesPage() {
  const { push } = useToast()
  const [listing, setListing] = useState<FileListResult | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [editor, setEditor] = useState('')
  const [mkdirName, setMkdirName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [filePage, setFilePage] = useState(0)

  const entryPages = useMemo(() => {
    const entries = listing?.entries ?? []
    const pages: FileEntry[][] = []
    for (let i = 0; i < entries.length; i += FILE_PAGE_SIZE) {
      pages.push(entries.slice(i, i + FILE_PAGE_SIZE))
    }
    return pages.length > 0 ? pages : [[]]
  }, [listing?.entries])

  const visibleEntries = entryPages[filePage] ?? []
  const totalPages = entryPages.length

  const refresh = useCallback(
    async (path = currentPath) => {
      setLoading(true)
      try {
        const data = await apiClient.get<FileListResult>(
          `/api/v1/files?path=${encodeURIComponent(path)}`,
        )
        setListing(data)
        setCurrentPath(data.path)
        setFilePage(0)
      } catch (error) {
        push(error instanceof ApiError ? error.message : '列出文件失败', 'error')
      } finally {
        setLoading(false)
      }
    },
    [currentPath, push],
  )

  useEffect(() => {
    void refresh('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function joinPath(base: string, name: string) {
    return [base, name].filter(Boolean).join('/')
  }

  async function openEntry(entry: FileEntry) {
    if (entry.isDirectory) {
      setSelected(null)
      await refresh(entry.path)
      return
    }
    try {
      const data = await apiClient.get<{ content: string; path: string }>(
        `/api/v1/files/read?path=${encodeURIComponent(entry.path)}`,
      )
      setSelected(entry)
      setEditor(data.content)
    } catch (error) {
      push(error instanceof ApiError ? error.message : '读取失败', 'error')
    }
  }

  async function saveFile() {
    if (!selected) return
    try {
      await apiClient.put('/api/v1/files/write', {
        path: selected.path,
        content: editor,
      })
      push('已保存', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.message : '保存失败', 'error')
    }
  }

  async function createDir(event: FormEvent) {
    event.preventDefault()
    if (!mkdirName.trim()) return
    try {
      await apiClient.post('/api/v1/files/mkdir', {
        path: joinPath(currentPath, mkdirName.trim()),
      })
      setMkdirName('')
      push('目录已创建', 'success')
      await refresh(currentPath)
    } catch (error) {
      push(error instanceof ApiError ? error.message : '创建失败', 'error')
    }
  }

  async function onUpload(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    try {
      await apiClient.upload(
        `/api/v1/files/upload?dir=${encodeURIComponent(currentPath)}`,
        file,
      )
      push('上传成功', 'success')
      await refresh(currentPath)
    } catch (error) {
      push(error instanceof ApiError ? error.message : '上传失败', 'error')
    }
  }

  function goUp() {
    if (!currentPath) return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    void refresh(parts.join('/'))
  }

  return (
    <div className="stack">
      <div className="page-card">
        <h2 className="page-title">文件</h2>
        <p className="page-desc">
          浏览默认安装目录内的文件。根目录：{listing?.root || '加载中…'}
        </p>
        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={goUp} disabled={!currentPath}>
            上级
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => refresh(currentPath)} disabled={loading}>
            刷新
          </button>
          <label className="btn btn-ghost" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            上传
            <input
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                void onUpload(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <form className="form-grid" style={{ marginTop: 16, marginBottom: 0 }} onSubmit={createDir}>
          <label className="field">
            <span>新建目录</span>
            <input
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              placeholder="folder-name"
            />
          </label>
          <div className="field" style={{ justifyContent: 'end' }}>
            <span>&nbsp;</span>
            <button className="btn" type="submit">
              创建
            </button>
          </div>
        </form>
      </div>

      <div className="files-layout">
        <div className="page-card">
          <div className="muted" style={{ marginBottom: 8 }}>
            /{currentPath}
            {listing && listing.entries.length > FILE_PAGE_SIZE
              ? ` · 第 ${filePage + 1}/${totalPages} 页（共 ${listing.entries.length} 项）`
              : ''}
          </div>
          <div className="table">
            {visibleEntries.map((entry) => (
              <div key={entry.path} className="table-row files-row">
                <button type="button" className="file-link" onClick={() => void openEntry(entry)}>
                  <span className="muted">{entry.isDirectory ? '[DIR]' : '[FILE]'}</span> {entry.name}
                </button>
                <div className="muted">
                  {entry.isDirectory ? '目录' : `${entry.size ?? 0} B`}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setPendingDelete(entry.path)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {listing && listing.entries.length === 0 && <p className="muted">空目录</p>}
          </div>
          {totalPages > 1 && (
            <div className="row-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={filePage <= 0}
                onClick={() => setFilePage((page) => Math.max(0, page - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={filePage >= totalPages - 1}
                onClick={() => setFilePage((page) => Math.min(totalPages - 1, page + 1))}
              >
                下一页
              </button>
            </div>
          )}
        </div>

        <div className="page-card">
          <h3 style={{ marginTop: 0 }}>{selected ? selected.name : '编辑器'}</h3>
          {selected ? (
            <>
              <textarea
                className="file-editor"
                value={editor}
                onChange={(e) => setEditor(e.target.value)}
              />
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => void saveFile()}>
                保存
              </button>
            </>
          ) : (
            <p className="muted">选择文本文件以编辑（最大 2MB）。</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除确认"
        message={`确定删除「${pendingDelete}」吗？此操作不可恢复。`}
        confirmText="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await apiClient.post('/api/v1/files/delete', { path: pendingDelete })
            push('已删除', 'success')
            if (selected?.path === pendingDelete) {
              setSelected(null)
              setEditor('')
            }
            setPendingDelete(null)
            await refresh(currentPath)
          } catch (error) {
            push(error instanceof ApiError ? error.message : '删除失败', 'error')
          }
        }}
      />
    </div>
  )
}
