import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { MrpackLoader } from '@gsm4/shared'
import { downloadFile } from '../../../../adapters/download/HttpDownloader.js'

export interface LoaderInstallContext {
  installPath: string
  minecraftVersion: string
  /** dependencies 中声明的加载器版本（可选） */
  loaderVersion?: string
  /** 用户自定义 Java 启动命令（含内存参数），缺省时按加载器生成 */
  javaCommand?: string
  signal: AbortSignal
  log: (line: string, level?: 'info' | 'warn' | 'error') => void
  progress: (percent: number, message?: string) => void
}

export interface LoaderInstallResult {
  startCommand: string
  loaderVersion?: string
}

const isWindows = process.platform === 'win32'

function defaultJavaCommand(jarName: string, javaCommand?: string): string {
  if (javaCommand && javaCommand.trim()) return javaCommand
  return `java -Xms1G -Xmx2G -jar ${jarName} nogui`
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'GSM4-Deploy', Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`请求失败 ${url}: HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

/** 运行一个进程（java 安装器/启动脚本），把输出转发到部署日志，支持取消。 */
function runProcess(
  command: string,
  args: string[],
  cwd: string,
  ctx: LoaderInstallContext,
  timeoutMs = 15 * 60 * 1000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ctx.signal.aborted) {
      reject(new Error('部署已取消'))
      return
    }

    const child = spawn(command, args, { cwd, env: process.env })
    let timedOut = false

    const onAbort = () => child.kill('SIGTERM')
    ctx.signal.addEventListener('abort', onAbort, { once: true })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    const forward = (buf: Buffer, level: 'info' | 'warn') => {
      for (const piece of buf.toString('utf8').split(/\r?\n/)) {
        if (piece.trim()) ctx.log(piece, level)
      }
    }
    child.stdout?.on('data', (buf: Buffer) => forward(buf, 'info'))
    child.stderr?.on('data', (buf: Buffer) => forward(buf, 'warn'))

    child.on('error', (error) => {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onAbort)
      if (ctx.signal.aborted) {
        reject(new Error('部署已取消'))
        return
      }
      if (timedOut) {
        reject(new Error(`${command} 执行超时`))
        return
      }
      if (code === 0) resolve()
      else reject(new Error(`${command} 退出码 ${code}`))
    })
  })
}

async function ensureJavaAvailable(ctx: LoaderInstallContext): Promise<void> {
  try {
    await runProcess('java', ['-version'], ctx.installPath, ctx, 30 * 1000)
  } catch {
    throw new Error('未检测到 Java 环境，无法安装该加载器；请在「环境」中安装 Java 后重试')
  }
}

// ==================== Fabric ====================
// Fabric 提供可直接下载的服务端启动器 jar，无需本地 Java 参与安装。

interface FabricLoaderEntry {
  loader: { version: string; stable: boolean }
}
interface FabricInstallerEntry {
  version: string
  stable: boolean
}

async function installFabric(ctx: LoaderInstallContext): Promise<LoaderInstallResult> {
  let loaderVersion = ctx.loaderVersion
  if (!loaderVersion) {
    const loaders = await fetchJson<FabricLoaderEntry[]>(
      `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(ctx.minecraftVersion)}`,
      ctx.signal,
    )
    loaderVersion = (loaders.find((item) => item.loader.stable) || loaders[0])?.loader.version
    if (!loaderVersion) throw new Error(`Fabric 无匹配 ${ctx.minecraftVersion} 的加载器版本`)
  }

  const installers = await fetchJson<FabricInstallerEntry[]>(
    'https://meta.fabricmc.net/v2/versions/installer',
    ctx.signal,
  )
  const installerVersion = (installers.find((item) => item.stable) || installers[0])?.version
  if (!installerVersion) throw new Error('Fabric 无可用安装器版本')

  ctx.log(`Fabric 加载器 ${loaderVersion} / 安装器 ${installerVersion}`, 'info')
  ctx.progress(78, '下载 Fabric 服务端')

  const jarName = 'fabric-server-launch.jar'
  const url = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(
    ctx.minecraftVersion,
  )}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`

  await downloadFile({
    url,
    destination: path.join(ctx.installPath, jarName),
    signal: ctx.signal,
    onProgress: (percent) => {
      if (percent != null) ctx.progress(Math.min(92, 78 + percent * 0.14), '下载 Fabric 服务端')
    },
  })

  return { startCommand: defaultJavaCommand(jarName, ctx.javaCommand), loaderVersion }
}

// ==================== Quilt ====================
// Quilt 通过官方安装器 jar 生成服务端，需要本地 Java。

async function installQuilt(ctx: LoaderInstallContext): Promise<LoaderInstallResult> {
  await ensureJavaAvailable(ctx)

  const installerJar = path.join(ctx.installPath, `_gsm4_quilt_installer_${Date.now()}.jar`)
  ctx.progress(78, '下载 Quilt 安装器')
  await downloadFile({
    url: 'https://quiltmc.org/api/v1/download-latest-installer/java-universal',
    destination: installerJar,
    signal: ctx.signal,
  })

  ctx.log('运行 Quilt 安装器…', 'info')
  ctx.progress(84, '安装 Quilt 服务端')
  const args = [
    '-jar',
    path.basename(installerJar),
    'install',
    'server',
    ctx.minecraftVersion,
    ...(ctx.loaderVersion ? [ctx.loaderVersion] : []),
    '--download-server',
    `--install-dir=${ctx.installPath}`,
  ]
  await runProcess('java', args, ctx.installPath, ctx)
  await fs.unlink(installerJar).catch(() => undefined)

  const jarName = 'quilt-server-launch.jar'
  try {
    await fs.access(path.join(ctx.installPath, jarName))
  } catch {
    throw new Error('Quilt 安装完成但未找到 quilt-server-launch.jar')
  }
  return { startCommand: defaultJavaCommand(jarName, ctx.javaCommand), loaderVersion: ctx.loaderVersion }
}

// ==================== Forge / NeoForge ====================
// 通过官方安装器 --installServer 生成运行脚本/库，需要本地 Java。

async function runForgeLikeInstaller(
  ctx: LoaderInstallContext,
  installerUrl: string,
  label: string,
): Promise<void> {
  await ensureJavaAvailable(ctx)
  const installerJar = path.join(ctx.installPath, `_gsm4_${label}_installer_${Date.now()}.jar`)
  ctx.progress(78, `下载 ${label} 安装器`)
  await downloadFile({ url: installerUrl, destination: installerJar, signal: ctx.signal })

  ctx.log(`运行 ${label} 安装器（--installServer）…`, 'info')
  ctx.progress(84, `安装 ${label} 服务端`)
  await runProcess('java', ['-jar', path.basename(installerJar), '--installServer'], ctx.installPath, ctx)
  await fs.unlink(installerJar).catch(() => undefined)
  await fs.unlink(`${installerJar}.log`).catch(() => undefined)
}

/** 安装器执行后解析启动方式：优先 run.sh/run.bat（现代 Forge/NeoForge），否则回退到 universal jar。 */
async function resolveForgeStartCommand(ctx: LoaderInstallContext): Promise<string> {
  const runScript = isWindows ? 'run.bat' : 'run.sh'
  try {
    await fs.access(path.join(ctx.installPath, runScript))
    if (!isWindows) {
      await fs.chmod(path.join(ctx.installPath, runScript), 0o755).catch(() => undefined)
      return './run.sh nogui'
    }
    return 'run.bat nogui'
  } catch {
    // 旧版 Forge：查找 universal / server jar
    const entries = await fs.readdir(ctx.installPath).catch(() => [] as string[])
    const jar = entries.find(
      (name) =>
        /forge.*\.jar$/i.test(name) ||
        /neoforge.*\.jar$/i.test(name) ||
        /minecraft_server.*\.jar$/i.test(name),
    )
    if (jar) return defaultJavaCommand(jar, ctx.javaCommand)
    throw new Error('安装器执行完成但未找到 run 脚本或服务端 jar')
  }
}

async function installForge(ctx: LoaderInstallContext): Promise<LoaderInstallResult> {
  const forgeVersion = ctx.loaderVersion
  if (!forgeVersion) throw new Error('缺少 Forge 版本')
  // Forge 版本可能是 "47.2.0" 或完整 "1.20.1-47.2.0"
  const full = forgeVersion.includes('-')
    ? forgeVersion
    : `${ctx.minecraftVersion}-${forgeVersion}`
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`
  await runForgeLikeInstaller(ctx, url, 'forge')
  const startCommand = await resolveForgeStartCommand(ctx)
  return { startCommand, loaderVersion: forgeVersion }
}

async function installNeoForge(ctx: LoaderInstallContext): Promise<LoaderInstallResult> {
  const version = ctx.loaderVersion
  if (!version) throw new Error('缺少 NeoForge 版本')
  const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`
  await runForgeLikeInstaller(ctx, url, 'neoforge')
  const startCommand = await resolveForgeStartCommand(ctx)
  return { startCommand, loaderVersion: version }
}

export async function installLoader(
  loader: MrpackLoader,
  ctx: LoaderInstallContext,
): Promise<LoaderInstallResult> {
  switch (loader) {
    case 'fabric':
      return installFabric(ctx)
    case 'quilt':
      return installQuilt(ctx)
    case 'forge':
      return installForge(ctx)
    case 'neoforge':
      return installNeoForge(ctx)
    default:
      throw new Error(`不支持的加载器: ${loader as string}`)
  }
}
