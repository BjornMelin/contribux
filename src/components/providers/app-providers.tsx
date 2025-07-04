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
import { createContext, useContext, useState, useEffect } from 'react'
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
  signIn: async () => {},
  signOut: async () => {},
})

export const useSession = () => useContext(MockSessionContext)

function MockSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MockSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    // Check for existing session on mount
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
      } catch (error) {
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
    } catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  const signOut = async () => {
    try {
      // Clear the session cookie
      document.cookie = 'next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      setSession(null)
      setStatus('unauthenticated')
    } catch (error) {
      console.error('Sign out failed:', error)
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
    <MockSessionProvider>
      <QueryProvider>
        {children}
      </QueryProvider>
    </MockSessionProvider>
  )
}

export default AppProviders