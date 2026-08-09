import { z } from 'zod'

export const SystemInfoSchema = z.object({
  hostname: z.string(),
  platform: z.string(),
  arch: z.string(),
  release: z.string(),
  uptimeSec: z.number(),
  cpuModel: z.string(),
  cpuCount: z.number(),
  totalMemory: z.number(),
  freeMemory: z.number(),
  nodeVersion: z.string(),
})
export type SystemInfo = z.infer<typeof SystemInfoSchema>

export const SystemStatsSchema = z.object({
  timestamp: z.string(),
  cpu: z.object({
    usage: z.number(),
    cores: z.number(),
    model: z.string(),
  }),
  memory: z.object({
    total: z.number(),
    used: z.number(),
    free: z.number(),
    usage: z.number(),
  }),
  load: z.object({
    avg1: z.number(),
    avg5: z.number(),
    avg15: z.number(),
  }),
  disk: z
    .object({
      total: z.number().optional(),
      used: z.number().optional(),
      free: z.number().optional(),
      usage: z.number().optional(),
    })
    .optional(),
})
export type SystemStats = z.infer<typeof SystemStatsSchema>
