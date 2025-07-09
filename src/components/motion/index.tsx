'use client'

/**
 * Optimized Motion Component System
 * Lazy-loaded Framer Motion components for reduced initial bundle size
 */

// Type-only import for SSR safety
import type { MotionProps } from 'framer-motion'
import React, { lazy, Suspense } from 'react'

// Fallback component for loading states
const MotionFallback: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ opacity: 0.8 }}>{children}</div>
)

// Lazy-loaded motion components with proper typing
const LazyMotionDiv = lazy(() =>
  typeof window === 'undefined'
    ? Promise.resolve({ default: MotionFallback })
    : import('framer-motion').then(mod => ({
        default: mod.motion.div,
      }))
)

const LazyMotionButton = lazy(() =>
  typeof window === 'undefined'
    ? Promise.resolve({ default: MotionFallback })
    : import('framer-motion').then(mod => ({
        default: mod.motion.button,
      }))
)

const LazyMotionSpan = lazy(() =>
  typeof window === 'undefined'
    ? Promise.resolve({ default: MotionFallback })
    : import('framer-motion').then(mod => ({
        default: mod.motion.span,
      }))
)

const LazyAnimatePresence = lazy(() =>
  typeof window === 'undefined'
    ? Promise.resolve({ default: MotionFallback })
    : import('framer-motion').then(mod => ({
        default: mod.AnimatePresence,
      }))
)

// Optimized motion wrapper
export interface OptimizedMotionProps extends MotionProps {
  children: React.ReactNode
  className?: string
  fallback?: React.ReactNode
  enableMotion?: boolean
}

// Motion div with lazy loading
export const MotionDiv: React.FC<OptimizedMotionProps> = ({
  children,
  fallback,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return <div className={props.className}>{children}</div>
  }

  return (
    <Suspense fallback={fallback || <MotionFallback>{children}</MotionFallback>}>
      <LazyMotionDiv {...props}>{children}</LazyMotionDiv>
    </Suspense>
  )
}

// Motion button with lazy loading
export const MotionButton: React.FC<OptimizedMotionProps> = ({
  children,
  fallback,
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
    <Suspense fallback={fallback || <MotionFallback>{children}</MotionFallback>}>
      <LazyMotionButton {...props}>{children}</LazyMotionButton>
    </Suspense>
  )
}

// Motion span with lazy loading
export const MotionSpan: React.FC<OptimizedMotionProps> = ({
  children,
  fallback,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return <span className={props.className}>{children}</span>
  }

  return (
    <Suspense fallback={fallback || <MotionFallback>{children}</MotionFallback>}>
      <LazyMotionSpan {...props}>{children}</LazyMotionSpan>
    </Suspense>
  )
}

// AnimatePresence wrapper with lazy loading
export const OptimizedAnimatePresence: React.FC<{
  children: React.ReactNode
  mode?: 'wait' | 'sync' | 'popLayout'
}> = ({ children, mode = 'wait' }) => {
  return (
    <Suspense fallback={children}>
      <LazyAnimatePresence {...(mode ? { mode } : {})}>{children}</LazyAnimatePresence>
    </Suspense>
  )
}

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
