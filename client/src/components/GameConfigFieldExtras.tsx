import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Code, List } from 'lucide-react'
import { GameConfigScalarInput } from '@/components/GameConfigScalarInput'
import {
  buildDefaultArrayItem,
  getArrayItemLabel,
  type GameConfigFieldSchema
} from '@/types/gameConfig'

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

interface GameConfigArrayFieldProps {
  field: GameConfigFieldSchema
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
  const itemFields = field.item_fields || []
  const maxItems = typeof field.max === 'number' ? field.max : undefined
  const minItems = typeof field.min === 'number' ? field.min : 0
  const canAdd = maxItems === undefined || items.length < maxItems
  const canRemove = items.length > minItems
  const emptyText = field.empty_text || `暂无${field.display || field.name}，点击下方按钮添加。`
  const addButtonLabel = field.add_button_label || `添加${field.display || field.name}`

  const addItem = () => {
    if (!canAdd) {
      return
    }
    onChange([...items, buildDefaultArrayItem(itemFields)])
  }

  const removeItem = (index: number) => {
    if (!canRemove) {
      return
    }
    onChange(items.filter((_, currentIndex) => currentIndex !== index))
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
          placeholder={`请输入 JSON 数组，例如 [{"${field.item_label_field || 'name'}":"示例"}]`}
        />
      ) : (
        <>
          {items.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
          )}

          {items.map((item, index) => (
            <div
              key={`${field.name}-${index}`}
              className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3 bg-gray-50/70 dark:bg-gray-800/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {getArrayItemLabel(item, index, field)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={!canRemove}
                  className="inline-flex items-center space-x-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
              </div>

              {itemFields.map((itemField) => {
                const itemRecord = (item && typeof item === 'object' && !Array.isArray(item))
                  ? item as Record<string, unknown>
                  : {}

                return (
                  <div key={`${field.name}-${index}-${itemField.name}`} className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {itemField.display || itemField.name}
                      {itemField.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {itemField.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{itemField.description}</p>
                    )}
                    <GameConfigScalarInput
                      field={itemField}
                      value={itemRecord[itemField.name]}
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
            disabled={!canAdd}
            className="inline-flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>{addButtonLabel}</span>
          </button>
        </>
      )}
    </div>
  )
}
