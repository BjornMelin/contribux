/**
 * Template component for Next.js 15 App Router
 * Provides consistent layout and animation patterns
 */

'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface TemplateProps {
  children: ReactNode
}

export default function Template({ children }: TemplateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        duration: 0.4,
      }}
      className="min-h-screen"
    >
      {children}
    </motion.div>
  )
}
