/**
 * Theme Provider
 * Manages theme state (system, light, dark) with localStorage persistence
 *
 * Features:
 * - System theme detection
 * - Theme persistence in localStorage
 * - CSS custom properties management
 * - Proper hydration handling
 */

'use client'

import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  // Get system theme preference
  const getSystemTheme = useCallback((): 'light' | 'dark' => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  }, [])

  // Apply theme to DOM
  const applyTheme = useCallback(
    (newTheme: Theme) => {
      if (typeof window === 'undefined') return

      const root = document.documentElement
      const systemTheme = getSystemTheme()
      const isDark = newTheme === 'dark' || (newTheme === 'system' && systemTheme === 'dark')

      root.classList.toggle('dark', isDark)
      root.setAttribute('data-theme', newTheme)

      setResolvedTheme(isDark ? 'dark' : 'light')
    },
    [getSystemTheme]
  )

  // Set theme and persist to localStorage
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme)
    }
    applyTheme(newTheme)
  }

  // Initialize theme on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme | null
      const initialTheme = savedTheme || 'system'

      // Sync with current DOM state (set by script)
      const currentlyDark = document.documentElement.classList.contains('dark')

      setThemeState(initialTheme)
      setResolvedTheme(currentlyDark ? 'dark' : 'light')
      setMounted(true)
    }
  }, [])

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, applyTheme])

  // Provide consistent values to avoid hydration issues
  const contextValue = {
    theme,
    setTheme,
    resolvedTheme,
  }

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}
