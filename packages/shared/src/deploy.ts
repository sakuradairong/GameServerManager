import { z } from 'zod'

export const DeployTypeSchema = z.enum(['steamcmd', 'minecraft', 'archive'])
export type DeployType = z.infer<typeof DeployTypeSchema>

export const DeployStatusSchema = z.enum([
  'queued',
  'running',
  'cancelling',
  'cancelled',
  'completed',
  'failed',
])
export type DeployStatus = z.infer<typeof DeployStatusSchema>

export const DeployCapabilitySchema = z.object({
  type: DeployTypeSchema,
  platforms: z.array(z.enum(['windows', 'linux', 'linux_arm'])),
  label: z.string(),
})
export type DeployCapability = z.infer<typeof DeployCapabilitySchema>

export const DEPLOY_CAPABILITIES: DeployCapability[] = [
  {
    type: 'steamcmd',
    platforms: ['windows', 'linux'],
    label: 'SteamCMD',
  },
  {
    type: 'minecraft',
    platforms: ['windows', 'linux', 'linux_arm'],
    label: 'Minecraft',
  },
  {
    type: 'archive',
    platforms: ['windows', 'linux', 'linux_arm'],
    label: '文件归档',
  },
]

export const SteamDeployRequestSchema = z.object({
  type: z.literal('steamcmd'),
  gameKey: z.string().min(1),
  appId: z.string().min(1),
  instanceName: z.string().min(1).max(128),
  installName: z.string().min(1).max(128).optional(),
  customInstallPath: z.string().optional(),
  allowCustomPath: z.boolean().optional(),
  branch: z.string().optional(),
  anonymous: z.boolean().optional(),
  steamUsername: z.string().optional(),
  steamPassword: z.string().optional(),
  startCommand: z.string().optional(),
})
export type SteamDeployRequest = z.infer<typeof SteamDeployRequestSchema>

export const MinecraftDeployRequestSchema = z.object({
  type: z.literal('minecraft'),
  instanceName: z.string().min(1).max(128),
  installName: z.string().min(1).max(128),
  downloadUrl: z.string().url(),
  jarFileName: z.string().min(1).optional(),
  javaCommand: z.string().optional(),
  customInstallPath: z.string().optional(),
  allowCustomPath: z.boolean().optional(),
})
export type MinecraftDeployRequest = z.infer<typeof MinecraftDeployRequestSchema>

export const ArchiveDeployRequestSchema = z.object({
  type: z.literal('archive'),
  instanceName: z.string().min(1).max(128),
  installName: z.string().min(1).max(128),
  archiveUrl: z.string().url(),
  startCommand: z.string().min(1),
  customInstallPath: z.string().optional(),
  allowCustomPath: z.boolean().optional(),
})
export type ArchiveDeployRequest = z.infer<typeof ArchiveDeployRequestSchema>

export const DeployRequestSchema = z.discriminatedUnion('type', [
  SteamDeployRequestSchema,
  MinecraftDeployRequestSchema,
  ArchiveDeployRequestSchema,
])
export type DeployRequest = z.infer<typeof DeployRequestSchema>

export const DeployCancelBodySchema = z.object({
  sessionId: z.string().min(1),
})
export type DeployCancelBody = z.infer<typeof DeployCancelBodySchema>

export const DeploySessionSummarySchema = z.object({
  sessionId: z.string(),
  type: DeployTypeSchema,
  status: DeployStatusSchema,
  instanceId: z.string().optional(),
  installPath: z.string().optional(),
  terminalSessionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
})
export type DeploySessionSummary = z.infer<typeof DeploySessionSummarySchema>

export const DeployProgressSchema = z.object({
  sessionId: z.string(),
  percent: z.number().min(0).max(100).optional(),
  stage: z.string().optional(),
  message: z.string().optional(),
})
export type DeployProgress = z.infer<typeof DeployProgressSchema>

export const DeployLogSchema = z.object({
  sessionId: z.string(),
  line: z.string(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
})
export type DeployLog = z.infer<typeof DeployLogSchema>

export const SteamGameInfoSchema = z.object({
  game_nameCN: z.string().optional(),
  appid: z.union([z.string(), z.number()]).optional(),
  tip: z.string().optional(),
  image: z.string().optional(),
  system: z.string().optional(),
  system_info: z.array(z.string()).optional(),
  start_command: z.unknown().optional(),
  login_anonymous: z.boolean().optional(),
})
export type SteamGameInfo = z.infer<typeof SteamGameInfoSchema>
