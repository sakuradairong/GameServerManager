import { z } from 'zod'

export const PublicConfigSchema = z.object({
  game: z.object({
    defaultInstallPath: z.string(),
  }),
  steamcmd: z.object({
    configured: z.boolean(),
    path: z.string(),
  }),
  server: z.object({
    port: z.number(),
  }),
})
export type PublicConfig = z.infer<typeof PublicConfigSchema>

export const UpdateSettingsBodySchema = z.object({
  game: z
    .object({
      defaultInstallPath: z.string().min(1).optional(),
    })
    .optional(),
  steamcmd: z
    .object({
      path: z.string().optional(),
    })
    .optional(),
})
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>
