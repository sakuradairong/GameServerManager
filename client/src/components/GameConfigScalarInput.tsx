import React from 'react'
import type { GameConfigFieldSchema } from '@/types/gameConfig'

interface GameConfigScalarInputProps {
  field: GameConfigFieldSchema
  value: unknown
  onChange: (value: unknown) => void
  className?: string
}

const defaultInputClassName =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export const GameConfigScalarInput: React.FC<GameConfigScalarInputProps> = ({
  field,
  value,
  onChange,
  className = defaultInputClassName
}) => {
  if (field.type === 'boolean') {
    const checked = value !== undefined ? Boolean(value) : Boolean(field.default)
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

  if (field.type === 'enum' || field.type === 'select') {
    return (
      <select
        value={value !== undefined && value !== null ? String(value) : String(field.default ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="">请选择</option>
        {field.options?.map((option) => {
          const optionValue = String(option.value)
          return (
            <option key={optionValue} value={optionValue}>
              {option.label || optionValue}
            </option>
          )
        })}
      </select>
    )
  }

  if (field.type === 'integer' || field.type === 'number' || field.type === 'float' || field.type === 'double') {
    const isInteger = field.type === 'integer'
    return (
      <input
        type="number"
        value={value !== undefined && value !== null ? String(value) : (field.default !== undefined ? String(field.default) : '')}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange(field.default !== undefined ? field.default : (isInteger ? 0 : 0))
            return
          }
          const numValue = isInteger ? parseInt(raw, 10) : parseFloat(raw)
          onChange(Number.isNaN(numValue) ? (field.default !== undefined ? field.default : 0) : numValue)
        }}
        step={isInteger ? '1' : 'any'}
        min={field.min}
        max={field.max}
        className={className}
        placeholder="请输入数值"
      />
    )
  }

  return (
    <input
      type="text"
      value={value !== undefined && value !== null ? String(value) : String(field.default ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder="请输入值"
    />
  )
}
