export * from './instance.js'
export * from './system.js'
export * from './realtime.js'
export * from './deploy.js'
export * from './settings.js'
export * from './files.js'
export * from './steamcmd.js'

import { z } from 'zod'

export const TOKEN_STORAGE_KEY = 'gsm4_token'
export const LEGACY_TOKEN_STORAGE_KEY = 'gsm3_token'
export const USER_STORAGE_KEY = 'gsm4_user'

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
})

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    message: z.string().optional(),
  })

export const UserRoleSchema = z.enum(['admin', 'user'])
export type UserRole = z.infer<typeof UserRoleSchema>

export const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: UserRoleSchema,
})
export type PublicUser = z.infer<typeof PublicUserSchema>

export const RegisterBodySchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
})
export type RegisterBody = z.infer<typeof RegisterBodySchema>

export const LoginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})
export type LoginBody = z.infer<typeof LoginBodySchema>

export const AuthTokenPayloadSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: UserRoleSchema,
})
export type AuthTokenPayload = z.infer<typeof AuthTokenPayloadSchema>

export const LoginResultSchema = z.object({
  token: z.string(),
  user: PublicUserSchema,
})
export type LoginResult = z.infer<typeof LoginResultSchema>

export const HealthDataSchema = z.object({
  status: z.literal('ok'),
  product: z.literal('gsm4'),
  version: z.string(),
  schemaVersion: z.number(),
})
export type HealthData = z.infer<typeof HealthDataSchema>

export const DataManifestSchema = z.object({
  schemaVersion: z.number(),
  product: z.string(),
  createdAt: z.string(),
  migratedFrom: z
    .object({
      product: z.string(),
      sourcePath: z.string().optional(),
      migratedAt: z.string(),
    })
    .nullable(),
})
export type DataManifest = z.infer<typeof DataManifestSchema>

export const NAV_ITEMS = [
  { id: 'home', path: '/', label: '首页' },
  { id: 'terminal', path: '/terminal', label: '终端' },
  { id: 'instances', path: '/instances', label: '实例' },
  { id: 'deploy', path: '/deploy', label: '游戏部署' },
  { id: 'scheduled', path: '/scheduled-tasks', label: '定时任务' },
  { id: 'files', path: '/files', label: '文件' },
  { id: 'environment', path: '/environment', label: '环境' },
  { id: 'plugins', path: '/plugins', label: '插件' },
  { id: 'settings', path: '/settings', label: '设置' },
  { id: 'about', path: '/about', label: '关于' },
] as const

export type NavItemId = (typeof NAV_ITEMS)[number]['id']
