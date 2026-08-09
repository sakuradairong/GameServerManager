import { z } from 'zod'

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  size: z.number().optional(),
  modifiedAt: z.string().optional(),
})
export type FileEntry = z.infer<typeof FileEntrySchema>

export const FileListResultSchema = z.object({
  root: z.string(),
  path: z.string(),
  entries: z.array(FileEntrySchema),
})
export type FileListResult = z.infer<typeof FileListResultSchema>

export const FileReadResultSchema = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number(),
})
export type FileReadResult = z.infer<typeof FileReadResultSchema>

export const FileWriteBodySchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})
export type FileWriteBody = z.infer<typeof FileWriteBodySchema>

export const FileMkdirBodySchema = z.object({
  path: z.string().min(1),
})
export type FileMkdirBody = z.infer<typeof FileMkdirBodySchema>

export const FileDeleteBodySchema = z.object({
  path: z.string().min(1),
})
export type FileDeleteBody = z.infer<typeof FileDeleteBodySchema>
