import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import {
  AuthTokenPayloadSchema,
  UserRoleSchema,
  type AuthTokenPayload,
  type LoginBody,
  type PublicUser,
  type RegisterBody,
  type UserRole,
} from '@gsm4/shared'
import { isFileNotFoundError, writeJsonAtomic } from '../../lib/atomicJson.js'
import { configManager } from '../config/ConfigManager.js'

interface StoredUser {
  id: string
  username: string
  passwordHash: string
  role: UserRole
  createdAt: string
}

interface UsersFile {
  users: StoredUser[]
}

const StoredUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1),
  passwordHash: z.string().min(1),
  role: UserRoleSchema,
  createdAt: z.string().datetime(),
})

const UsersFileSchema = z.object({
  users: z.array(StoredUserSchema),
})

export class AuthService {
  private registering = false

  private usersPath(): string {
    return path.join(configManager.getDataDir(), 'users.json')
  }

  private async readUsers(): Promise<UsersFile> {
    try {
      const raw = await fs.readFile(this.usersPath(), 'utf8')
      return UsersFileSchema.parse(JSON.parse(raw))
    } catch (error) {
      if (isFileNotFoundError(error)) return { users: [] }
      throw new Error('用户数据损坏或无法读取，已拒绝开放注册', { cause: error })
    }
  }

  private async writeUsers(data: UsersFile): Promise<void> {
    await writeJsonAtomic(this.usersPath(), UsersFileSchema.parse(data))
  }

  async hasUsers(): Promise<boolean> {
    const data = await this.readUsers()
    return data.users.length > 0
  }

  private toPublic(user: StoredUser): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
    }
  }

  async register(body: RegisterBody): Promise<{ token: string; user: PublicUser }> {
    if (this.registering) {
      throw Object.assign(new Error('管理员注册正在进行，请勿重复提交'), { statusCode: 409 })
    }

    this.registering = true
    try {
      if (await this.hasUsers()) {
        const error = new Error('已存在用户，禁止再次开放注册')
        ;(error as Error & { statusCode?: number }).statusCode = 403
        throw error
      }

      const passwordHash = await bcrypt.hash(body.password, 10)
      const user: StoredUser = {
        id: crypto.randomUUID(),
        username: body.username,
        passwordHash,
        role: 'admin',
        createdAt: new Date().toISOString(),
      }

      await this.writeUsers({ users: [user] })
      const token = this.signToken(user)
      return { token, user: this.toPublic(user) }
    } finally {
      this.registering = false
    }
  }

  async login(body: LoginBody): Promise<{ token: string; user: PublicUser }> {
    const data = await this.readUsers()
    const user = data.users.find((item) => item.username === body.username)
    if (!user) {
      const error = new Error('用户名或密码错误')
      ;(error as Error & { statusCode?: number }).statusCode = 401
      throw error
    }

    const ok = await bcrypt.compare(body.password, user.passwordHash)
    if (!ok) {
      const error = new Error('用户名或密码错误')
      ;(error as Error & { statusCode?: number }).statusCode = 401
      throw error
    }

    return {
      token: this.signToken(user),
      user: this.toPublic(user),
    }
  }

  async verifyToken(token: string): Promise<AuthTokenPayload> {
    const { secret } = configManager.getConfig().jwt
    const payload = AuthTokenPayloadSchema.parse(jwt.verify(token, secret))
    const data = await this.readUsers()
    const user = data.users.find((item) => item.id === payload.userId)
    if (!user || user.username !== payload.username || user.role !== payload.role) {
      throw new Error('认证用户不存在或已失效')
    }
    return payload
  }

  private signToken(user: StoredUser): string {
    const { secret, expiresIn } = configManager.getConfig().jwt
    const payload: AuthTokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    }
    return jwt.sign(payload, secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    })
  }
}

export const authService = new AuthService()
