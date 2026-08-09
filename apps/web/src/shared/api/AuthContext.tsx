import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  USER_STORAGE_KEY,
  type LoginResult,
  type PublicUser,
} from '@gsm4/shared'
import { apiClient, getToken, setToken } from './client'

interface AuthStatus {
  initialized: boolean
  registrationOpen: boolean
}

interface AuthContextValue {
  user: PublicUser | null
  loading: boolean
  status: AuthStatus | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readCachedUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PublicUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(readCachedUser)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<AuthStatus | null>(null)

  const persistUser = useCallback((next: PublicUser | null) => {
    setUser(next)
    if (next) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
    } else {
      localStorage.removeItem(USER_STORAGE_KEY)
    }
  }, [])

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      persistUser(null)
      return
    }
    const me = await apiClient.get<PublicUser>('/api/v1/auth/me')
    persistUser(me)
  }, [persistUser])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const authStatus = await apiClient.get<AuthStatus>('/api/v1/auth/status')
        if (!cancelled) setStatus(authStatus)
        if (getToken()) {
          await refreshMe()
        }
      } catch {
        if (!cancelled) {
          setToken(null)
          persistUser(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [persistUser, refreshMe])

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await apiClient.post<LoginResult>('/api/v1/auth/login', {
        username,
        password,
      })
      setToken(result.token)
      persistUser(result.user)
      setStatus({ initialized: true, registrationOpen: false })
    },
    [persistUser],
  )

  const register = useCallback(
    async (username: string, password: string) => {
      const result = await apiClient.post<LoginResult>('/api/v1/auth/register', {
        username,
        password,
      })
      setToken(result.token)
      persistUser(result.user)
      setStatus({ initialized: true, registrationOpen: false })
    },
    [persistUser],
  )

  const logout = useCallback(() => {
    setToken(null)
    persistUser(null)
  }, [persistUser])

  const value = useMemo(
    () => ({
      user,
      loading,
      status,
      login,
      register,
      logout,
      refreshMe,
    }),
    [user, loading, status, login, register, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}
