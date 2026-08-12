import { z } from 'zod'

export const BackupFileSchema = z.object({
  fileName: z.string().min(1),
  size: z.number().nonnegative(),
  modifiedAt: z.string(),
})
export type BackupFile = z.infer<typeof BackupFileSchema>

export const BackupSetSchema = z.object({
  instanceId: z.string().uuid(),
  sourcePath: z.string(),
  files: z.array(BackupFileSchema),
  totalSize: z.number().nonnegative(),
})
export type BackupSet = z.infer<typeof BackupSetSchema>

export const CreateBackupBodySchema = z.object({
  /** 运行中时是否先停止实例；默认 true */
  stopInstance: z.boolean().optional().default(true),
  /** 保留份数；默认 10，范围 1–100 */
  maxKeep: z.number().int().min(1).max(100).optional().default(10),
})
export type CreateBackupBody = z.infer<typeof CreateBackupBodySchema>

export const RestoreBackupBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  /** 运行中时是否先停止；默认 true */
  stopInstance: z.boolean().optional().default(true),
})
export type RestoreBackupBody = z.infer<typeof RestoreBackupBodySchema>
