export interface GameConfigFieldOption {
  value: string | number | boolean
  label?: string
}

export interface GameConfigFieldSchema {
  name: string
  display?: string
  type: string
  default?: unknown
  description?: string
  required?: boolean
  options?: GameConfigFieldOption[]
  min?: number
  max?: number
  nested_fields?: GameConfigFieldSchema[]
  item_fields?: GameConfigFieldSchema[]
  /** array 项卡片标题使用的字段名，默认 name */
  item_label_field?: string
  /** array 为空时的提示文案 */
  empty_text?: string
  /** array 添加按钮文案，默认「添加{display}」 */
  add_button_label?: string
}

export interface GameConfigSectionSchema {
  key: string
  display_name?: string
  description?: string
  fields?: GameConfigFieldSchema[]
}

export interface GameConfigTemplateSchema {
  meta: {
    game_name: string
    config_file: string
    parser?: string
  }
  sections: GameConfigSectionSchema[]
}

export const GAME_CONFIG_SCALAR_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
  'enum',
  'select',
  'float',
  'double'
] as const

export function buildDefaultArrayItem(itemFields: GameConfigFieldSchema[] = []): Record<string, unknown> {
  const item: Record<string, unknown> = {}

  for (const itemField of itemFields) {
    if (itemField.type === 'nested' && itemField.nested_fields) {
      item[itemField.name] = buildDefaultArrayItem(itemField.nested_fields)
    } else if (itemField.type === 'array') {
      item[itemField.name] = Array.isArray(itemField.default)
        ? JSON.parse(JSON.stringify(itemField.default))
        : itemField.item_fields?.length
          ? [buildDefaultArrayItem(itemField.item_fields)]
          : []
    } else {
      item[itemField.name] = itemField.default
    }
  }

  return item
}

export function getArrayItemLabel(
  item: unknown,
  index: number,
  field: Pick<GameConfigFieldSchema, 'display' | 'name' | 'item_label_field'>
): string {
  const labelField = field.item_label_field || 'name'

  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>
    const labelValue = record[labelField]
    if (labelValue !== undefined && labelValue !== null && String(labelValue).trim() !== '') {
      return String(labelValue)
    }
  }

  return `${field.display || field.name} #${index + 1}`
}
