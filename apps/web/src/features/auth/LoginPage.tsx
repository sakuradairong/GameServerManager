import { useState, type FormEvent } from 'react'
import { useAuth } from '../../shared/api/AuthContext'
import { useToast } from '../../shared/ui/Toast'
import { ApiError } from '../../shared/api/client'

export function LoginPage() {
  const { status, login, register } = useAuth()
  const { push } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const registrationOpen = status?.registrationOpen ?? false

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      if (registrationOpen) {
        await register(username.trim(), password)
        push('管理员注册成功', 'success')
      } else {
        await login(username.trim(), password)
        push('登录成功', 'success')
      }
    } catch (error) {
      setPassword('')
      const message = error instanceof ApiError ? error.message : '操作失败'
      push(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>GSM4</h1>
        <p>
          {registrationOpen
            ? '首次启动：创建管理员账号以初始化面板。'
            : '登录以进入 GameServerManager 4。'}
        </p>
        <label className="field">
          <span>用户名</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={registrationOpen ? 3 : 1}
          />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registrationOpen ? 'new-password' : 'current-password'}
            required
            minLength={registrationOpen ? 6 : 1}
          />
        </label>
        <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? '提交中…' : registrationOpen ? '注册并进入' : '登录'}
        </button>
      </form>
    </div>
  )
}
