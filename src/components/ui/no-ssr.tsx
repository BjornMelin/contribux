'use client'

import { useEffect, useState } from 'react'

interface NoSSRProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Prevents server-side rendering of children components
 * Useful for components that cause hydration mismatches due to browser extensions
 */
export function NoSSR({ children, fallback = null }: NoSSRProps) {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (!hasMounted) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
