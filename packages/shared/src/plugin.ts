import { z } from 'zod'

export const PluginNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, '插件标识只能包含字母、数字、下划线和连字符')

export const PluginManifestSchema = z
  .object({
    name: PluginNameSchema,
    displayName: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    version: z.string().trim().min(1).max(32).default('1.0.0'),
    author: z.string().trim().max(80).default('未知'),
    enabled: z.boolean().default(false),
    hasWebInterface: z.boolean().default(false),
    entryPoint: z.string().trim().min(1).max(240).default('index.html'),
    icon: z.string().trim().max(40).default('puzzle'),
    category: z.string().trim().max(40).default('其他'),
    apiVersion: z.literal(1).default(1),
  })
  .passthrough()

export type PluginManifest = z.infer<typeof PluginManifestSchema>

export const PluginInfoSchema = PluginManifestSchema.pick({
  name: true,
  displayName: true,
  description: true,
  version: true,
  author: true,
  enabled: true,
  hasWebInterface: true,
  entryPoint: true,
  icon: true,
  category: true,
  apiVersion: true,
}).extend({
  source: z.enum(['local', 'official']),
  webAvailable: z.boolean(),
  warning: z.string().nullable(),
})

export type PluginInfo = z.infer<typeof PluginInfoSchema>

export const PluginIssueSchema = z.object({
  directory: z.string(),
  message: z.string(),
})
export type PluginIssue = z.infer<typeof PluginIssueSchema>

export const PluginListResultSchema = z.object({
  plugins: z.array(PluginInfoSchema),
  issues: z.array(PluginIssueSchema),
})
export type PluginListResult = z.infer<typeof PluginListResultSchema>

export const SetPluginEnabledBodySchema = z.object({
  enabled: z.boolean(),
})
export type SetPluginEnabledBody = z.infer<typeof SetPluginEnabledBodySchema>
