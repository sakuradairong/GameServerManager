import os from 'node:os'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import type { SystemInfo, SystemStats } from '@gsm4/shared'

const DISK_SAMPLE_INTERVAL_MS = 30_000
const MEMINFO_SAMPLE_INTERVAL_MS = 1_000

type CpuSample = { idle: number; total: number }

export class SystemService {
  private prevCpu: CpuSample | null = null
  private cachedDisk: SystemStats['disk'] | undefined
  private diskSampleAt = 0
  private diskSampleInFlight: Promise<SystemStats['disk'] | undefined> | null = null

  private cachedCpuMeta: { model: string; cores: number } | null = null
  private cachedMemAvailable: { free: number; total: number; at: number } | null = null
  private staticInfo: Omit<SystemInfo, 'uptimeSec' | 'totalMemory' | 'freeMemory'> | null = null

  private cpuMeta() {
    if (this.cachedCpuMeta) return this.cachedCpuMeta
    const cpus = os.cpus()
    this.cachedCpuMeta = {
      model: cpus[0]?.model || 'unknown',
      cores: cpus.length || 1,
    }
    return this.cachedCpuMeta
  }

  getInfo(): SystemInfo {
    const mem = this.sampleMemory()
    if (!this.staticInfo) {
      const cpu = this.cpuMeta()
      this.staticInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        cpuModel: cpu.model,
        cpuCount: cpu.cores,
        nodeVersion: process.version,
      }
    }
    return {
      ...this.staticInfo,
      uptimeSec: os.uptime(),
      totalMemory: mem.total,
      freeMemory: mem.free,
    }
  }

  getStats(): SystemStats {
    const cpu = this.cpuMeta()
    const usage = this.sampleCpuUsage()
    const mem = this.sampleMemory()
    const used = Math.max(0, mem.total - mem.free)
    const load = os.loadavg()

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage,
        cores: cpu.cores,
        model: cpu.model,
      },
      memory: {
        total: mem.total,
        used,
        free: mem.free,
        usage: mem.total > 0 ? (used / mem.total) * 100 : 0,
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
    stats.disk = await this.getDiskUsage()
    return stats
  }

  /** 与首页推送阈值一致，供 realtime 跳过无意义广播。 */
  statsMeaningfullyChanged(prev: SystemStats | null, next: SystemStats): boolean {
    if (!prev) return true
    if (Math.abs(prev.cpu.usage - next.cpu.usage) >= 0.5) return true
    if (Math.abs(prev.memory.usage - next.memory.usage) >= 0.5) return true
    if (Math.abs(prev.memory.used - next.memory.used) >= 8 * 1024 * 1024) return true
    if (Math.abs(prev.load.avg1 - next.load.avg1) >= 0.05) return true
    const prevDisk = prev.disk?.usage
    const nextDisk = next.disk?.usage
    if ((prevDisk == null) !== (nextDisk == null)) return true
    if (prevDisk != null && nextDisk != null && Math.abs(prevDisk - nextDisk) >= 0.5) return true
    return false
  }

  private sampleCpuUsage(): number {
    const current = this.readCpuSample()
    const prev = this.prevCpu
    this.prevCpu = current
    if (!prev) return 0
    const totalDiff = current.total - prev.total
    const idleDiff = current.idle - prev.idle
    if (totalDiff <= 0) return 0
    return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100))
  }

  private readCpuSample(): CpuSample {
    // Linux：读 /proc/stat 一行聚合，避免 os.cpus() 逐核开销
    if (process.platform === 'linux') {
      try {
        const raw = fsSync.readFileSync('/proc/stat', 'utf8')
        const line = raw.split('\n').find((row) => row.startsWith('cpu '))
        if (line) {
          const parts = line.trim().split(/\s+/).slice(1).map(Number)
          if (parts.length >= 4 && parts.every((n) => Number.isFinite(n))) {
            const idle = parts[3]! + (parts[4] || 0) // idle + iowait
            const total = parts.reduce((a, b) => a + b, 0)
            return { idle, total }
          }
        }
      } catch {
        // fall through
      }
    }

    const cpus = os.cpus()
    let idle = 0
    let total = 0
    for (const cpu of cpus) {
      const t = cpu.times
      idle += t.idle
      total += t.user + t.nice + t.sys + t.idle + t.irq
    }
    return { idle, total }
  }

  private sampleMemory(): { total: number; free: number } {
    const total = os.totalmem()
    if (process.platform !== 'linux') {
      return { total, free: os.freemem() }
    }

    const now = Date.now()
    if (
      this.cachedMemAvailable &&
      now - this.cachedMemAvailable.at < MEMINFO_SAMPLE_INTERVAL_MS
    ) {
      return { total: this.cachedMemAvailable.total, free: this.cachedMemAvailable.free }
    }

    try {
      const raw = fsSync.readFileSync('/proc/meminfo', 'utf8')
      let memTotalKb: number | undefined
      let memAvailableKb: number | undefined
      for (const line of raw.split('\n')) {
        if (line.startsWith('MemTotal:')) {
          memTotalKb = Number(line.replace(/\D+/g, ''))
        } else if (line.startsWith('MemAvailable:')) {
          memAvailableKb = Number(line.replace(/\D+/g, ''))
        }
        if (memTotalKb != null && memAvailableKb != null) break
      }
      if (
        memTotalKb != null &&
        memAvailableKb != null &&
        Number.isFinite(memTotalKb) &&
        Number.isFinite(memAvailableKb)
      ) {
        const result = {
          total: memTotalKb * 1024,
          free: memAvailableKb * 1024,
          at: now,
        }
        this.cachedMemAvailable = result
        return { total: result.total, free: result.free }
      }
    } catch {
      // fall through
    }

    return { total, free: os.freemem() }
  }

  private async getDiskUsage(): Promise<SystemStats['disk'] | undefined> {
    const now = Date.now()
    if (this.cachedDisk !== undefined && now - this.diskSampleAt < DISK_SAMPLE_INTERVAL_MS) {
      return this.cachedDisk
    }
    if (this.diskSampleInFlight) return this.diskSampleInFlight

    this.diskSampleInFlight = this.sampleDisk().finally(() => {
      this.diskSampleInFlight = null
    })
    const disk = await this.diskSampleInFlight
    this.cachedDisk = disk
    this.diskSampleAt = Date.now()
    return disk
  }

  private async sampleDisk(): Promise<SystemStats['disk'] | undefined> {
    try {
      // Node 18.7+：无子进程，比 df 更轻
      const stat = await fs.statfs('/')
      const total = Number(stat.blocks) * Number(stat.bsize)
      const free = Number(stat.bavail) * Number(stat.bsize)
      const used = Math.max(0, total - Number(stat.bfree) * Number(stat.bsize))
      if (!Number.isFinite(total) || total <= 0) return undefined
      return {
        total,
        used,
        free,
        usage: (used / total) * 100,
      }
    } catch {
      return undefined
    }
  }
}

export const systemService = new SystemService()
