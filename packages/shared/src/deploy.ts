import { z } from 'zod'

export const DeployTypeSchema = z.enum([
  'steamcmd',
  'minecraft',
  'archive',
  'bedrock',
  'tmodloader',
])
export type DeployType = z.infer<typeof DeployTypeSchema>

export const DeployPlatformSchema = z.enum(['windows', 'linux', 'linux_arm'])
export type DeployPlatform = z.infer<typeof DeployPlatformSchema>

export const DeployStatusSchema = z.enum([
  'queued',
  'running',
  'cancelling',
  'cancelled',
  'completed',
  'failed',
])
export type DeployStatus = z.infer<typeof DeployStatusSchema>

export const DeploySourceSchema = z.enum(['url', 'upload'])
export type DeploySource = z.infer<typeof DeploySourceSchema>

export const DeployCapabilitySchema = z.object({
  type: DeployTypeSchema,
  platforms: z.array(DeployPlatformSchema),
  label: z.string(),
  requiresSponsor: z.boolean().optional(),
  available: z.boolean().optional(),
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
  {
    type: 'bedrock',
    platforms: ['windows', 'linux'],
    label: '基岩版',
  },
  {
    type: 'tmodloader',
    platforms: ['windows', 'linux'],
    label: 'tModLoader',
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

export const MinecraftDeployRequestSchema = z
  .object({
    type: z.literal('minecraft'),
    instanceName: z.string().min(1).max(128),
    installName: z.string().min(1).max(128),
    source: DeploySourceSchema.optional(),
    downloadUrl: z.string().url().optional(),
    uploadId: z.string().min(1).optional(),
    jarFileName: z.string().min(1).optional(),
    javaCommand: z.string().optional(),
    customInstallPath: z.string().optional(),
    allowCustomPath: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const source = value.source || (value.uploadId ? 'upload' : 'url')
    if (source === 'upload') {
      if (!value.uploadId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '上传部署需要 uploadId',
          path: ['uploadId'],
        })
      }
    } else if (!value.downloadUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL 部署需要 downloadUrl',
        path: ['downloadUrl'],
      })
    }
  })
export type MinecraftDeployRequest = z.infer<typeof MinecraftDeployRequestSchema>

export const ArchiveDeployRequestSchema = z
  .object({
    type: z.literal('archive'),
    instanceName: z.string().min(1).max(128),
    installName: z.string().min(1).max(128),
    source: DeploySourceSchema.optional(),
    archiveUrl: z.string().url().optional(),
    uploadId: z.string().min(1).optional(),
    startCommand: z.string().min(1),
    customInstallPath: z.string().optional(),
    allowCustomPath: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const source = value.source || (value.uploadId ? 'upload' : 'url')
    if (source === 'upload') {
      if (!value.uploadId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '上传部署需要 uploadId',
          path: ['uploadId'],
        })
      }
    } else if (!value.archiveUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL 部署需要 archiveUrl',
        path: ['archiveUrl'],
      })
    }
  })
export type ArchiveDeployRequest = z.infer<typeof ArchiveDeployRequestSchema>

export const BedrockDeployRequestSchema = z.object({
  type: z.literal('bedrock'),
  instanceName: z.string().min(1).max(128),
  installName: z.string().min(1).max(128),
  versionType: z.enum(['stable', 'preview']).optional(),
  customInstallPath: z.string().optional(),
  allowCustomPath: z.boolean().optional(),
})
export type BedrockDeployRequest = z.infer<typeof BedrockDeployRequestSchema>

export const TmodloaderDeployRequestSchema = z.object({
  type: z.literal('tmodloader'),
  instanceName: z.string().min(1).max(128),
  installName: z.string().min(1).max(128),
  customInstallPath: z.string().optional(),
  allowCustomPath: z.boolean().optional(),
})
export type TmodloaderDeployRequest = z.infer<typeof TmodloaderDeployRequestSchema>

export const DeployRequestSchema = z.union([
  SteamDeployRequestSchema,
  MinecraftDeployRequestSchema,
  ArchiveDeployRequestSchema,
  BedrockDeployRequestSchema,
  TmodloaderDeployRequestSchema,
])
export type DeployRequest = z.infer<typeof DeployRequestSchema>

export const DeployUploadKindSchema = z.enum(['minecraft', 'archive'])
export type DeployUploadKind = z.infer<typeof DeployUploadKindSchema>

export const DeployUploadResultSchema = z.object({
  uploadId: z.string(),
  kind: DeployUploadKindSchema,
  fileName: z.string(),
  size: z.number(),
  createdAt: z.string(),
})
export type DeployUploadResult = z.infer<typeof DeployUploadResultSchema>

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
