/**
 * Theme Toggle Component
 * Provides a toggle button for switching between system, light, and dark themes
 *
 * Features:
 * - Three theme states: system, light, dark
 * - Smooth icon transitions
 * - Keyboard navigation support
 * - Accessible labels
 * - Visual feedback on hover/focus
 */

'use client'

import { MotionDiv } from '@/components/motion'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ThemeToggleProps {
  className?: string
  size?: 'sm' | 'default' | 'lg'
}

export function ThemeToggle({ className, size = 'default' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-9 w-9" /> // Placeholder with same dimensions
  }

  const handleThemeChange = () => {
    const themes = ['system', 'light', 'dark'] as const
    const currentIndex = themes.indexOf(theme as (typeof themes)[number])
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />
      case 'dark':
        return <Moon className="h-4 w-4" />
      case 'system':
        return <Monitor className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Switch to dark mode'
      case 'dark':
        return 'Switch to system mode'
      case 'system':
        return 'Switch to light mode'
      default:
        return 'Switch theme'
    }
  }

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleThemeChange}
      aria-label={getLabel()}
      className={cn(
        'relative overflow-hidden',
        'hover:bg-muted',
        'focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'transition-colors duration-200',
        className
      )}
    >
      <MotionDiv
        key={theme}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex items-center justify-center"
      >
        {getIcon()}
      </MotionDiv>
      <span className="sr-only">{getLabel()}</span>
    </Button>
  )
}

// Alternative compact version for mobile or condensed layouts
export function ThemeToggleCompact({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-7 w-7" /> // Placeholder with same dimensions
  }

  const handleThemeChange = () => {
    const themes = ['system', 'light', 'dark'] as const
    const currentIndex = themes.indexOf(theme as (typeof themes)[number])
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-3 w-3" />
      case 'dark':
        return <Moon className="h-3 w-3" />
      case 'system':
        return <Monitor className="h-3 w-3" />
      default:
        return <Monitor className="h-3 w-3" />
    }
  }

  return (
    <button
      type="button"
      onClick={handleThemeChange}
      aria-label={`Current theme: ${theme}. Click to change.`}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-2',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'transition-colors duration-200',
        className
      )}
    >
      <MotionDiv
        key={theme}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {getIcon()}
      </MotionDiv>
    </button>
  )
}
