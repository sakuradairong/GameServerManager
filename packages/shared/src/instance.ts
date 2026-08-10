import { z } from 'zod'

export const InstanceStatusSchema = z.enum([
  'running',
  'stopped',
  'starting',
  'stopping',
  'error',
])
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>

export const StopCommandSchema = z.enum(['ctrl+c', 'stop', 'exit', 'quit'])
export type StopCommand = z.infer<typeof StopCommandSchema>

export const InstanceTypeSchema = z.enum([
  'generic',
  'steam',
  'minecraft',
  'archive',
  'bedrock',
  'tmodloader',
  'mrpack',
  'factorio',
])
export type InstanceType = z.infer<typeof InstanceTypeSchema>

export const InstanceSteamMetaSchema = z.object({
  appId: z.string(),
  gameKey: z.string().optional(),
  branch: z.string().optional(),
})
export type InstanceSteamMeta = z.infer<typeof InstanceSteamMetaSchema>

export const InstanceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional().default(''),
  workingDirectory: z.string().min(1),
  startCommand: z.string().min(1),
  stopCommand: StopCommandSchema.default('ctrl+c'),
  autoStart: z.boolean().default(false),
  status: InstanceStatusSchema,
  pid: z.number().optional(),
  terminalSessionId: z.string().optional(),
  instanceType: InstanceTypeSchema.optional().default('generic'),
  steam: InstanceSteamMetaSchema.optional(),
  createdAt: z.string(),
  lastStarted: z.string().optional(),
  lastStopped: z.string().optional(),
  errorMessage: z.string().optional(),
})
export type Instance = z.infer<typeof InstanceSchema>

export const CreateInstanceBodySchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  workingDirectory: z.string().min(1),
  startCommand: z.string().min(1),
  stopCommand: StopCommandSchema.optional(),
  autoStart: z.boolean().optional(),
})
export type CreateInstanceBody = z.infer<typeof CreateInstanceBodySchema>

export const UpdateInstanceBodySchema = CreateInstanceBodySchema.partial()
export type UpdateInstanceBody = z.infer<typeof UpdateInstanceBodySchema>
