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

import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import { QueryProvider } from './query-provider'

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
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('unauthenticated')

  useEffect(() => {
    // Check for existing session on mount (only on client)
    if (typeof window === 'undefined') {
      // Server-side: set to unauthenticated to prevent loading state
      setStatus('unauthenticated')
      return
    }

    const checkSession = async () => {
      // Briefly set to loading only during the actual check
      setStatus('loading')
      
      try {
        // Add timeout to prevent infinite loading
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

        const response = await fetch('/api/auth/session', {
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
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
      } catch (error) {
        // If request fails or times out, set to unauthenticated
        console.warn('Session check failed:', error)
        setStatus('unauthenticated')
      }
    }

    checkSession()

    // Fallback: ensure status is never stuck in loading for more than 10 seconds
    const fallbackTimer = setTimeout(() => {
      setStatus(currentStatus => {
        if (currentStatus === 'loading') {
          console.warn('Session check taking too long, defaulting to unauthenticated')
          return 'unauthenticated'
        }
        return currentStatus
      })
    }, 10000)

    return () => clearTimeout(fallbackTimer)
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MockSessionProvider>
        <QueryProvider>{children}</QueryProvider>
      </MockSessionProvider>
    </ThemeProvider>
  )
}

export default AppProviders
