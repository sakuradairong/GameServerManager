import { z } from 'zod'
import { SteamBranchNameSchema, SteamCommandTextSchema } from './steamcmd.js'

export const DeployTypeSchema = z.enum([
  'steamcmd',
  'minecraft',
  'archive',
  'bedrock',
  'tmodloader',
  'mrpack',
  'factorio',
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
  {
    type: 'mrpack',
    platforms: ['windows', 'linux', 'linux_arm'],
    label: 'Modrinth 整合包',
  },
  {
    // Factorio 官方仅提供 linux64 headless（tar.xz，x86_64）
    type: 'factorio',
    platforms: ['linux'],
    label: 'Factorio',
  },
]

export const MrpackLoaderSchema = z.enum(['fabric', 'quilt', 'forge', 'neoforge'])
export type MrpackLoader = z.infer<typeof MrpackLoaderSchema>

const UploadIdSchema = z.string().uuid()
const SteamUsernameSchema = SteamCommandTextSchema.transform((value) => value.trim())

function validateSteamCredentials(
  value: { anonymous?: boolean; steamUsername?: string; steamPassword?: string },
  ctx: z.RefinementCtx,
) {
  if (value.anonymous !== false) return
  if (!value.steamUsername?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['steamUsername'],
      message: '非匿名登录必须填写 Steam 账号',
    })
  }
  if (!value.steamPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['steamPassword'],
      message: '非匿名登录必须填写 Steam 密码',
    })
  }
}

export const SteamDeployRequestSchema = z
  .object({
    type: z.literal('steamcmd'),
    gameKey: z.string().min(1),
    appId: z.string().regex(/^\d+$/u, 'appId 必须是数字'),
    instanceName: z.string().min(1).max(128),
    installName: z.string().min(1).max(128).optional(),
    customInstallPath: z.string().optional(),
    allowCustomPath: z.boolean().optional(),
    branch: SteamBranchNameSchema.optional(),
    betaPassword: SteamCommandTextSchema.optional(),
    anonymous: z.boolean().optional(),
    steamUsername: SteamUsernameSchema.optional(),
    steamPassword: SteamCommandTextSchema.optional(),
    startCommand: z.string().optional(),
  })
  .superRefine(validateSteamCredentials)
export type SteamDeployRequest = z.infer<typeof SteamDeployRequestSchema>

/** 对已存在的 Steam 实例执行更新 / 分支切换（复用 steamcmd 执行器与 deploy:* 进度） */
export const SteamUpdateBodySchema = z
  .object({
    /** 目标分支；缺省时沿用实例当前分支或 public */
    branch: SteamBranchNameSchema.optional(),
    betaPassword: SteamCommandTextSchema.optional(),
    anonymous: z.boolean().optional(),
    steamUsername: SteamUsernameSchema.optional(),
    steamPassword: SteamCommandTextSchema.optional(),
  })
  .superRefine(validateSteamCredentials)
export type SteamUpdateBody = z.infer<typeof SteamUpdateBodySchema>

export const MinecraftDeployRequestSchema = z
  .object({
    type: z.literal('minecraft'),
    instanceName: z.string().min(1).max(128),
    installName: z.string().min(1).max(128),
    source: DeploySourceSchema.optional(),
    downloadUrl: z.string().url().optional(),
    uploadId: UploadIdSchema.optional(),
    jarFileName: z
      .string()
      .min(1)
      .refine((value) => !/[\\/<>:"|?*\x00-\x1F]/u.test(value) && value !== '.' && value !== '..', {
        message: 'jarFileName 必须是安全的单个文件名',
      })
      .optional(),
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
    uploadId: UploadIdSchema.optional(),
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

export const MrpackDeployRequestSchema = z
  .object({
    type: z.literal('mrpack'),
    instanceName: z.string().min(1).max(128),
    installName: z.string().min(1).max(128),
    source: DeploySourceSchema.optional(),
    mrpackUrl: z.string().url().optional(),
    uploadId: UploadIdSchema.optional(),
    /** 覆盖自动检测的加载器；缺省时按 modrinth.index.json 的 dependencies 推断 */
    loaderType: MrpackLoaderSchema.optional(),
    /** 覆盖整合包声明的 Minecraft 版本 */
    minecraftVersion: z.string().min(1).optional(),
    /** 自定义 Java 启动命令（含内存参数）；缺省时按加载器生成 */
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
    } else if (!value.mrpackUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL 部署需要 mrpackUrl',
        path: ['mrpackUrl'],
      })
    }
  })
export type MrpackDeployRequest = z.infer<typeof MrpackDeployRequestSchema>

export const FactorioDeployRequestSchema = z.object({
  type: z.literal('factorio'),
  instanceName: z.string().min(1).max(128),
  installName: z.string().min(1).max(128),
  /** stable / latest / 具体版本号（如 1.1.110）；缺省 stable */
  version: z.string().min(1).max(64).optional(),
  customInstallPath: z.string().optional(),
  allowCustomPath: z.boolean().optional(),
})
export type FactorioDeployRequest = z.infer<typeof FactorioDeployRequestSchema>

export const DeployRequestSchema = z.union([
  SteamDeployRequestSchema,
  MinecraftDeployRequestSchema,
  ArchiveDeployRequestSchema,
  BedrockDeployRequestSchema,
  TmodloaderDeployRequestSchema,
  MrpackDeployRequestSchema,
  FactorioDeployRequestSchema,
])
export type DeployRequest = z.infer<typeof DeployRequestSchema>

export const DeployUploadKindSchema = z.enum(['minecraft', 'archive', 'mrpack'])
export type DeployUploadKind = z.infer<typeof DeployUploadKindSchema>

export const DeployUploadResultSchema = z.object({
  uploadId: UploadIdSchema,
  kind: DeployUploadKindSchema,
  fileName: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
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
  appid: z
    .union([z.string().regex(/^\d+$/u), z.number().int().nonnegative()])
    .optional(),
  tip: z.string().optional(),
  image: z.string().url().optional(),
  system: z.union([z.string(), z.array(z.string())]).optional(),
  system_info: z.array(z.string()).optional(),
  start_command: z.unknown().optional(),
  login_anonymous: z.boolean().optional(),
}).passthrough()
export type SteamGameInfo = z.infer<typeof SteamGameInfoSchema>

export const SteamCatalogSchema = z
  .record(SteamGameInfoSchema)
  .refine((catalog) => Object.keys(catalog).length <= 2000, {
    message: 'Steam 目录条目数量超过限制',
  })
export type SteamCatalog = z.infer<typeof SteamCatalogSchema>
