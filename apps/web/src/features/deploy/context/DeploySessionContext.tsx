import { createContext, useContext, type ReactNode } from 'react'
import { useDeploySession } from '../hooks/useDeploySession'

type DeploySessionValue = ReturnType<typeof useDeploySession>

const DeploySessionContext = createContext<DeploySessionValue | null>(null)

export function DeploySessionProvider({ children }: { children: ReactNode }) {
  const deploy = useDeploySession()
  return <DeploySessionContext.Provider value={deploy}>{children}</DeploySessionContext.Provider>
}

export function useDeploySessionContext(): DeploySessionValue {
  const value = useContext(DeploySessionContext)
  if (!value) {
    throw new Error('useDeploySessionContext 必须在 DeploySessionProvider 内使用')
  }
  return value
}
