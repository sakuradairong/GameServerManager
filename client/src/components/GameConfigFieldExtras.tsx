import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Code, List } from 'lucide-react'

interface GameConfigFieldOption {
  value: string
  label?: string
}

interface GameConfigFieldDefinition {
  name: string
  display?: string
  type: string
  default?: unknown
  description?: string
  options?: GameConfigFieldOption[]
  min?: number
  max?: number
}

interface GameConfigRawJsonFieldProps {
  value: unknown
  onChange: (value: unknown) => void
  placeholder?: string
}

export const GameConfigRawJsonField: React.FC<GameConfigRawJsonFieldProps> = ({
  value,
  onChange,
  placeholder = '请输入 JSON 内容'
}) => {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (value === undefined || value === null) {
      setText('')
      setError(null)
      return
    }

    try {
      setText(JSON.stringify(value, null, 2))
      setError(null)
    } catch {
      setText(String(value))
    }
  }, [value])

  const handleChange = (nextText: string) => {
    setText(nextText)

    if (!nextText.trim()) {
      setError(null)
      onChange(null)
      return
    }

    try {
      const parsed = JSON.parse(nextText)
      setError(null)
      onChange(parsed)
    } catch {
      setError('JSON 格式无效，修正后才会写入配置')
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={10}
        spellCheck={false}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder}
      />
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

interface GameConfigArrayItemFieldProps {
  itemField: GameConfigFieldDefinition
  itemValue: unknown
  onChange: (value: unknown) => void
}

const GameConfigArrayItemField: React.FC<GameConfigArrayItemFieldProps> = ({
  itemField,
  itemValue,
  onChange
}) => {
  const inputClassName =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  if (itemField.type === 'boolean') {
    const checked = itemValue !== undefined ? Boolean(itemValue) : Boolean(itemField.default)
    return (
      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
        />
        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
          {checked ? '启用' : '禁用'}
        </span>
      </label>
    )
  }

  if (itemField.type === 'select') {
    return (
      <select
        value={itemValue !== undefined && itemValue !== null ? String(itemValue) : String(itemField.default ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
      >
        <option value="">请选择</option>
        {itemField.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label || option.value}
          </option>
        ))}
      </select>
    )
  }

  if (itemField.type === 'number' || itemField.type === 'integer') {
    return (
      <input
        type="number"
        value={itemValue !== undefined && itemValue !== null ? String(itemValue) : String(itemField.default ?? '')}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange(itemField.default ?? 0)
            return
          }
          const numValue = itemField.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw)
          onChange(Number.isNaN(numValue) ? (itemField.default ?? 0) : numValue)
        }}
        step={itemField.type === 'integer' ? '1' : 'any'}
        min={itemField.min}
        max={itemField.max}
        className={inputClassName}
        placeholder="请输入数值"
      />
    )
  }

  return (
    <input
      type="text"
      value={itemValue !== undefined && itemValue !== null ? String(itemValue) : String(itemField.default ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className={inputClassName}
      placeholder="请输入值"
    />
  )
}

interface GameConfigArrayFieldProps {
  field: GameConfigFieldDefinition & { item_fields?: GameConfigFieldDefinition[] }
  value: unknown
  onChange: (value: unknown[]) => void
}

export const GameConfigArrayField: React.FC<GameConfigArrayFieldProps> = ({
  field,
  value,
  onChange
}) => {
  const [jsonMode, setJsonMode] = useState(false)
  const items = useMemo(() => (Array.isArray(value) ? value : []), [value])

  const buildDefaultItem = () => {
    const item: Record<string, unknown> = {}
    field.item_fields?.forEach((itemField) => {
      item[itemField.name] = itemField.default
    })
    return item
  }

  const updateItem = (index: number, itemFieldName: string, itemFieldValue: unknown) => {
    const nextItems = items.map((item, currentIndex) => {
      if (currentIndex !== index || !item || typeof item !== 'object' || Array.isArray(item)) {
        return item
      }

      return {
        ...(item as Record<string, unknown>),
        [itemFieldName]: itemFieldValue
      }
    })
    onChange(nextItems)
  }

  const addItem = () => {
    onChange([...items, buildDefaultItem()])
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setJsonMode((prev) => !prev)}
          className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {jsonMode ? <List className="w-4 h-4" /> : <Code className="w-4 h-4" />}
          <span>{jsonMode ? '表单编辑' : 'JSON 编辑'}</span>
        </button>
      </div>

      {jsonMode ? (
        <GameConfigRawJsonField
          value={items}
          onChange={(nextValue) => {
            if (Array.isArray(nextValue)) {
              onChange(nextValue)
            }
          }}
          placeholder={'请输入 JSON 数组，例如 [{"name":"Admin"}]'}
        />
      ) : (
        <>
          {items.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">暂无分组，点击下方按钮添加。</p>
          )}

          {items.map((item, index) => (
            <div
              key={`${field.name}-${index}`}
              className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3 bg-gray-50/70 dark:bg-gray-800/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {typeof item === 'object' && item !== null && 'name' in item && (item as Record<string, unknown>).name
                    ? String((item as Record<string, unknown>).name)
                    : `${field.display || field.name} #${index + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="inline-flex items-center space-x-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
              </div>

              {field.item_fields?.map((itemField) => {
                const itemRecord = (item && typeof item === 'object' && !Array.isArray(item))
                  ? item as Record<string, unknown>
                  : {}

                return (
                  <div key={`${field.name}-${index}-${itemField.name}`} className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {itemField.display || itemField.name}
                    </label>
                    {itemField.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{itemField.description}</p>
                    )}
                    <GameConfigArrayItemField
                      itemField={itemField}
                      itemValue={itemRecord[itemField.name]}
                      onChange={(nextValue) => updateItem(index, itemField.name, nextValue)}
                    />
                  </div>
                )
              })}
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>添加{field.display || field.name}</span>
          </button>
        </>
      )}
    </div>
  )
}
