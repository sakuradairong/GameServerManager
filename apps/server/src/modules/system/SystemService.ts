import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SystemInfo, SystemStats } from '@gsm4/shared'

const execFileAsync = promisify(execFile)

export class SystemService {
  private prevCpu = os.cpus()

  getInfo(): SystemInfo {
    const cpus = os.cpus()
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptimeSec: os.uptime(),
      cpuModel: cpus[0]?.model || 'unknown',
      cpuCount: cpus.length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      nodeVersion: process.version,
    }
  }

  getStats(): SystemStats {
    const usage = this.sampleCpuUsage()
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free
    const load = os.loadavg()
    const cpus = os.cpus()

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage,
        cores: cpus.length,
        model: cpus[0]?.model || 'unknown',
      },
      memory: {
        total,
        used,
        free,
        usage: total > 0 ? (used / total) * 100 : 0,
      },
      load: {
        avg1: load[0] ?? 0,
        avg5: load[1] ?? 0,
        avg15: load[2] ?? 0,
      },
    }
  }

  async getStatsWithDisk(): Promise<SystemStats> {
    const stats = this.getStats()
    stats.disk = await this.sampleDisk()
    return stats
  }

  private sampleCpuUsage(): number {
    const current = os.cpus()
    let idleDiff = 0
    let totalDiff = 0

    for (let i = 0; i < current.length; i += 1) {
      const prev = this.prevCpu[i] || current[i]
      const cur = current[i]
      const prevTotal = Object.values(prev.times).reduce((a, b) => a + b, 0)
      const curTotal = Object.values(cur.times).reduce((a, b) => a + b, 0)
      const prevIdle = prev.times.idle
      const curIdle = cur.times.idle
      totalDiff += curTotal - prevTotal
      idleDiff += curIdle - prevIdle
    }

    this.prevCpu = current
    if (totalDiff <= 0) return 0
    return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100))
  }

  private async sampleDisk(): Promise<SystemStats['disk']> {
    try {
      if (process.platform === 'win32') {
        return undefined
      }
      const { stdout } = await execFileAsync('df', ['-kP', '/'])
      const lines = stdout.trim().split('\n')
      const parts = lines[1]?.split(/\s+/)
      if (!parts || parts.length < 5) return undefined
      const total = Number(parts[1]) * 1024
      const used = Number(parts[2]) * 1024
      const free = Number(parts[3]) * 1024
      return {
        total,
        used,
        free,
        usage: total > 0 ? (used / total) * 100 : 0,
      }
    } catch {
      return undefined
    }
  }
}

export const systemService = new SystemService()
