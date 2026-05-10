'use client'

/**
 * Motion Component System
 * Thin wrappers around Framer Motion components.
 */

import {
  AnimatePresence as FramerAnimatePresence,
  type HTMLMotionProps,
  motion,
} from 'framer-motion'
import React from 'react'

const motionOnlyProps = new Set([
  'animate',
  'drag',
  'dragConstraints',
  'dragControls',
  'dragElastic',
  'dragMomentum',
  'dragPropagation',
  'dragSnapToOrigin',
  'dragTransition',
  'exit',
  'initial',
  'layout',
  'layoutDependency',
  'layoutId',
  'onAnimationComplete',
  'onDrag',
  'onDragEnd',
  'onDragStart',
  'onDragTransitionEnd',
  'onDirectionLock',
  'onUpdate',
  'transition',
  'variants',
  'viewport',
  'whileDrag',
  'whileFocus',
  'whileHover',
  'whileInView',
  'whileTap',
])

function toDomProps<TDomProps>(props: Record<string, unknown>): TDomProps {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !motionOnlyProps.has(key))
  ) as TDomProps
}

interface MotionControlProps {
  enableMotion?: boolean
}

type MotionDivProps = Omit<HTMLMotionProps<'div'>, 'children'> &
  MotionControlProps & {
    children?: React.ReactNode
  }
type MotionButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> &
  MotionControlProps & {
    children?: React.ReactNode
  }
type MotionSpanProps = Omit<HTMLMotionProps<'span'>, 'children'> &
  MotionControlProps & {
    children?: React.ReactNode
  }

// Motion div wrapper
export const MotionDiv: React.FC<MotionDivProps> = ({
  children,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return <div {...toDomProps<React.HTMLAttributes<HTMLDivElement>>(props)}>{children}</div>
  }

  return <motion.div {...props}>{children}</motion.div>
}

// Motion button wrapper
export const MotionButton: React.FC<MotionButtonProps> = ({
  children,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    const domProps = toDomProps<React.ButtonHTMLAttributes<HTMLButtonElement>>(props)
    return (
      <button type="button" {...domProps}>
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
export const MotionSpan: React.FC<MotionSpanProps> = ({
  children,
  enableMotion = true,
  ...props
}) => {
  if (!enableMotion) {
    return <span {...toDomProps<React.HTMLAttributes<HTMLSpanElement>>(props)}>{children}</span>
  }

  return <motion.span {...props}>{children}</motion.span>
}

// AnimatePresence wrapper
export const AnimatePresenceWrapper: React.FC<{
  children: React.ReactNode
  mode?: 'wait' | 'sync' | 'popLayout'
}> = ({ children, mode = 'wait' }) => {
  return <FramerAnimatePresence mode={mode}>{children}</FramerAnimatePresence>
}

export const AnimatePresence = AnimatePresenceWrapper

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
