/**
 * Global error UI for Next.js 15 App Router
 * Enhanced with React 19 error recovery features
 */

'use client'

import { useEffect } from 'react'
import { AlertTriangle, Home, RefreshCw } from '@/components/icons'
import { Button } from '@/components/ui/button'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Report to error tracking service if available
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      })
    }
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-muted/10 to-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        {/* Error Content */}
        <div className="space-y-2">
          <h1 className="font-bold text-2xl text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Don&apos;t worry, we&apos;ve been notified and are
            working on it.
          </p>

          {/* Error Details in Development */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4 rounded-lg bg-muted p-4 text-left">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <pre className="mt-2 overflow-auto text-muted-foreground text-xs">
                {error.message}
                {error.digest && `\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset} className="flex items-center gap-2" size="lg">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              window.location.href = '/'
            }}
            className="flex items-center gap-2"
            size="lg"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </div>

        {/* Additional Help */}
        <div className="border-border border-t pt-4">
          <p className="text-muted-foreground text-sm">
            If this problem persists, please{' '}
            <a
              href="mailto:support@contribux.dev"
              className="text-primary underline hover:no-underline"
            >
              contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
