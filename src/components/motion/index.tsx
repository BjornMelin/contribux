'use client'

/**
 * Motion Component System
 * Thin wrappers around Framer Motion components.
 */

import { AnimatePresence as FramerAnimatePresence, type MotionProps, motion } from 'framer-motion'
import React from 'react'

// Optimized motion wrapper
export interface OptimizedMotionProps extends MotionProps {
  children?: React.ReactNode
  className?: string
  fallback?: React.ReactNode
  enableMotion?: boolean
}

// Motion div wrapper
export const MotionDiv: React.FC<OptimizedMotionProps> = ({
  children,
  fallback: _fallback,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return <div className={props.className}>{children}</div>
  }

  return <motion.div {...props}>{children}</motion.div>
}

// Motion button wrapper
export const MotionButton: React.FC<OptimizedMotionProps> = ({
  children,
  fallback: _fallback,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return (
      <button type="button" className={props.className}>
        {children}
      </button>
    )
  }

  return (
    <motion.button type="button" {...props}>
      {children}
    </motion.button>
  )
}

// Motion span wrapper
export const MotionSpan: React.FC<OptimizedMotionProps> = ({
  children,
  fallback: _fallback,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return <span className={props.className}>{children}</span>
  }

  return <motion.span {...props}>{children}</motion.span>
}

// AnimatePresence wrapper
export const OptimizedAnimatePresence: React.FC<{
  children: React.ReactNode
  mode?: 'wait' | 'sync' | 'popLayout'
}> = ({ children, mode = 'wait' }) => {
  return <FramerAnimatePresence mode={mode}>{children}</FramerAnimatePresence>
}

// Export alias for compatibility
export const AnimatePresence = OptimizedAnimatePresence

// Common animation presets
export const animationPresets = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },
  slideIn: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2 },
  },
  slideUp: {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 40 },
    transition: { duration: 0.4, ease: 'easeOut' },
  },
} as const

// Hook to check if motion should be enabled (respects user preferences)
export const useMotionPreference = () => {
  const [shouldAnimate, setShouldAnimate] = React.useState(true)

  React.useEffect(() => {
    // SSR guard - only access window on client
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setShouldAnimate(!mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setShouldAnimate(!e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return shouldAnimate
}

// Performance-optimized motion provider
export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shouldAnimate = useMotionPreference()

  // Provide motion preference context to all child components
  return <div data-motion-enabled={shouldAnimate}>{children}</div>
}
