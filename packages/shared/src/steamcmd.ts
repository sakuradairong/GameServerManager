import { z } from 'zod'

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
