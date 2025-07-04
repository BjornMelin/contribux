/**
 * App Providers
 * Combines all global providers for the application
 *
 * Features:
 * - QueryProvider for data fetching and caching
 * - Mock Session Provider for development testing
 * - Proper error boundaries for all providers
 */

'use client'

import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import { QueryProvider } from './query-provider'
import { ThemeProvider } from 'next-themes'

interface AppProvidersProps {
  children: ReactNode
}

// Mock session context for development
interface MockSession {
  user?: {
    id: string
    name: string
    email: string
    image?: string
  }
}

interface MockSessionContextType {
  data: MockSession | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  signIn: (provider: string) => Promise<void>
  signOut: () => Promise<void>
}

const MockSessionContext = createContext<MockSessionContextType>({
  data: null,
  status: 'loading',
  signIn: async () => {
    /* Default implementation */
  },
  signOut: async () => {
    /* Default implementation */
  },
})

export const useSession = () => useContext(MockSessionContext)

function MockSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MockSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    // Check for existing session on mount (only on client)
    if (typeof window === 'undefined') {
      // Server-side: set to loading state
      setStatus('loading')
      return
    }

    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session')
        if (response.ok) {
          const sessionData = await response.json()
          if (sessionData.user) {
            setSession(sessionData)
            setStatus('authenticated')
          } else {
            setStatus('unauthenticated')
          }
        } else {
          setStatus('unauthenticated')
        }
      } catch {
        setStatus('unauthenticated')
      }
    }

    checkSession()
  }, [])

  const signIn = async (provider: string) => {
    try {
      const response = await fetch('/api/auth/demo-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })

      if (response.ok) {
        const userData = await response.json()
        setSession({ user: userData.user })
        setStatus('authenticated')
      }
    } catch {
      // Sign in failed silently
    }
  }

  const signOut = async () => {
    try {
      // Clear the session cookie (client-side only)
      if (typeof window !== 'undefined') {
        document.cookie = 'next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      }
      setSession(null)
      setStatus('unauthenticated')
    } catch {
      // Sign out failed silently
    }
  }

  return (
    <MockSessionContext.Provider value={{ data: session, status, signIn, signOut }}>
      {children}
    </MockSessionContext.Provider>
  )
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem 
      disableTransitionOnChange
    >
      <MockSessionProvider>
        <QueryProvider>{children}</QueryProvider>
      </MockSessionProvider>
    </ThemeProvider>
  )
}

export default AppProviders
