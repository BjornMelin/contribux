/**
 * React Configuration Provider Components
 * Provides React context for configuration access
 */

'use client'

import type React from 'react'
import { createContext, useContext } from 'react'
import type { ConfigProvider } from './provider'

const ConfigContext = createContext<ConfigProvider | null>(null)

export function ConfigProviderComponent({
  children,
  provider,
}: {
  children: React.ReactNode
  provider: ConfigProvider
}) {
  return <ConfigContext.Provider value={provider}>{children}</ConfigContext.Provider>
}

export function useConfig(): ConfigProvider {
  const provider = useContext(ConfigContext)
  if (!provider) {
    throw new Error('useConfig must be used within ConfigProviderComponent')
  }
  return provider
}

// Configuration hooks for specific sections
export function useAppConfig() {
  return useConfig().getSection('app')
}

export function useDatabaseConfig() {
  return useConfig().getSection('database')
}

export function useAuthConfig() {
  return useConfig().getSection('auth')
}

export function useGitHubConfig() {
  return useConfig().getSection('github')
}

export function useFeatureFlags() {
  return useConfig().getSection('features')
}
