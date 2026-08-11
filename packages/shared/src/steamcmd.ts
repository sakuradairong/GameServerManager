import { z } from 'zod'

export const SteamAppIdSchema = z
  .string()
  .trim()
  .regex(/^\d+$/u, 'AppID 必须是数字')
  .refine((value) => value.length <= 10 && Number(value) <= 0xffffffff, {
    message: 'AppID 超出有效范围',
  })

export const SteamCommandTextSchema = z
  .string()
  .max(256)
  .refine((value) => !/[\x00-\x1f\x7f]/u.test(value), {
    message: '不能包含控制字符',
  })

export const SteamBranchNameSchema = z
  .string()
  .trim()
  .min(1, '分支名不能为空')
  .max(128)
  .refine((value) => !/[\x00-\x1f\x7f]/u.test(value), {
    message: '分支名包含无效控制字符',
  })

export const SteamBranchInfoSchema = z.object({
  name: SteamBranchNameSchema,
  description: z.string().optional(),
  buildId: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  requiresPassword: z.boolean(),
  isDefault: z.boolean(),
})
export type SteamBranchInfo = z.infer<typeof SteamBranchInfoSchema>

export const SteamBranchQueryBodySchema = z
  .object({
    forceRefresh: z.boolean().optional(),
    steamUsername: SteamCommandTextSchema.optional(),
    steamPassword: SteamCommandTextSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const username = value.steamUsername?.trim() || ''
    const password = value.steamPassword || ''
    if (Boolean(username) !== Boolean(password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: username ? ['steamPassword'] : ['steamUsername'],
        message: 'Steam 账号和密码必须同时填写',
      })
    }
  })
export type SteamBranchQueryBody = z.infer<typeof SteamBranchQueryBodySchema>

export const SteamcmdStatusSchema = z.object({
  isInstalled: z.boolean(),
  executablePath: z.string().nullable(),
  installDir: z.string().nullable(),
  supported: z.boolean(),
  unsupportedReason: z.string().nullable(),
  platform: z.string(),
  arch: z.string(),
  installing: z.boolean(),
  progress: z.number().nullable(),
  statusMessage: z.string().nullable(),
  defaultInstallPath: z.string(),
})
export type SteamcmdStatus = z.infer<typeof SteamcmdStatusSchema>

export const SteamcmdInstallBodySchema = z.object({
  installPath: z.string().min(1).optional(),
})
export type SteamcmdInstallBody = z.infer<typeof SteamcmdInstallBodySchema>

export const SteamcmdDetectBodySchema = z.object({
  installPath: z.string().min(1),
  apply: z.boolean().optional(),
})
export type SteamcmdDetectBody = z.infer<typeof SteamcmdDetectBodySchema>

export const SteamcmdInstallProgressSchema = z.object({
  progress: z.number(),
  status: z.string(),
  installing: z.boolean(),
})
export type SteamcmdInstallProgress = z.infer<typeof SteamcmdInstallProgressSchema>

export const SteamcmdInstallCompleteSchema = z.object({
  success: z.literal(true),
  executablePath: z.string(),
  installDir: z.string(),
  message: z.string(),
})
export type SteamcmdInstallComplete = z.infer<typeof SteamcmdInstallCompleteSchema>

export const SteamcmdInstallErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})
export type SteamcmdInstallError = z.infer<typeof SteamcmdInstallErrorSchema>
