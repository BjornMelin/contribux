/**
 * TanStack Query Provider
 * Global data fetching and caching provider with development tools
 *
 * Features:
 * - Global error boundary for API errors
 * - Development tools integration
 * - Performance monitoring
 * - Background sync setup
 * - Cache persistence (optional)
 */

'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'

// Completely exclude DevTools from production bundle
const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then(mod => ({ default: mod.ReactQueryDevtools })),
  {
    ssr: false,
    loading: () => null,
  }
)

import {
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode,
  Suspense,
  startTransition,
  useEffect,
  useState,
} from 'react'
import { getQueryMetrics, queryClient, setupBackgroundSync } from '@/lib/api/query-client'
import { isDevelopment, isProduction } from '@/lib/validation/env'

interface QueryProviderProps {
  children: ReactNode
}

// React 19 optimized error boundary using modern error handling patterns
function QueryErrorBoundary({ children, fallback }: PropsWithChildren<{ fallback?: ReactNode }>) {
  const [error, setError] = useState<Error | null>(null)
  const [_errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)

  // React 19: Enhanced error capture with better state management
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Capture unhandled errors related to query operations
      if (event.error?.message?.includes('query')) {
        setError(event.error)
        setErrorInfo({ componentStack: event.error.stack || '' })

        // Log to external error service in production
        if (isProduction()) {
          // Example: Sentry.captureException(event.error, { extra: { componentStack: event.error.stack } })
        }
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Capture unhandled promise rejections from query operations
      if (event.reason && typeof event.reason === 'object' && 'message' in event.reason) {
        const error = event.reason as Error
        if (error.message?.includes('query') || error.message?.includes('fetch')) {
          setError(error)
          setErrorInfo({ componentStack: error.stack || '' })

          if (isProduction()) {
            // Example: Sentry.captureException(error, { extra: { type: 'unhandledRejection' } })
          }
        }
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Reset error state when needed
  const resetError = () => {
    startTransition(() => {
      setError(null)
      setErrorInfo(null)
    })
  }

  if (error) {
    if (fallback) {
      return <>{fallback}</>
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-8 w-8 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-label="Error"
              >
                <title>Error Icon</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="font-medium text-card-foreground text-lg">Something went wrong</h3>
            </div>
          </div>

          <div className="mb-4 text-muted-foreground text-sm">
            We encountered an unexpected error. Please try refreshing the page.
          </div>

          {isDevelopment() && error && (
            <details className="mb-4">
              <summary className="cursor-pointer font-medium text-card-foreground text-sm">
                Error Details (Development)
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-muted-foreground text-xs">
                {error.stack}
              </pre>
            </details>
          )}

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary flex-1"
            >
              Refresh Page
            </button>
            <button type="button" onClick={resetError} className="btn-secondary flex-1">
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// Helper function to handle circuit breaker monitoring
function handleCircuitBreakerStates(states: Array<{ state: string; endpoint: string }>) {
  if (states.length > 0) {
    // Handle circuit breaker states for monitoring
    // Log or emit metrics for circuit breaker states
  }
}

// Helper function to handle slow query detection
function handleSlowQueries(queries: Array<{ duration: number; queryKey: string }>) {
  if (queries.length > 0) {
    // Handle slow query detection for monitoring
    // Log or emit metrics for slow queries
  }
}

// Helper function to process query metrics
function processQueryMetrics() {
  const metrics = getQueryMetrics()

  if (!metrics?.metrics || metrics.metrics.length === 0) {
    return
  }

  // Handle circuit breaker monitoring
  if (metrics.circuitBreakerStates) {
    handleCircuitBreakerStates(metrics.circuitBreakerStates)
  }

  // Handle slow query detection
  const slowQueries = metrics.metrics.filter(m => m.duration > 2000)
  handleSlowQueries(slowQueries)
}

// Performance monitoring component
function QueryPerformanceMonitor() {
  useEffect(() => {
    if (!isDevelopment()) {
      return () => {
        // Cleanup function for non-development environment
      }
    }

    const interval = setInterval(processQueryMetrics, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return null
}

// Network status indicator
function NetworkStatusIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [showOfflineMessage, setShowOfflineMessage] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setShowOfflineMessage(false)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowOfflineMessage(true)

      // Hide offline message after 5 seconds
      setTimeout(() => setShowOfflineMessage(false), 5000)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!showOfflineMessage) return null

  return (
    <div className="fixed top-0 right-0 left-0 z-50 bg-yellow-500 px-4 py-2 text-center text-sm text-white">
      <div className="flex items-center justify-center">
        <svg
          className="mr-2 h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label="Warning"
        >
          <title>Warning</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {isOnline
          ? 'Back online! Syncing data...'
          : "You're offline. Some features may be limited."}
      </div>
    </div>
  )
}

// React 19 optimized main query provider component with Suspense
export function QueryProvider({ children }: QueryProviderProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    startTransition(() => {
      setIsClient(true)
    })

    // Enhanced background sync setup
    const cleanup = setupBackgroundSync()
    return cleanup
  }, [])

  // React 19: Enhanced Suspense boundary for better loading states
  const QueryClientWrapper = ({ children: wrapperChildren }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <QueryErrorBoundary>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-background">
              <div className="flex flex-col items-center space-y-4">
                <div className="loading-spinner h-8 w-8 text-primary" />
                <p className="text-muted-foreground text-sm">Loading application...</p>
              </div>
            </div>
          }
        >
          {wrapperChildren}
        </Suspense>
      </QueryErrorBoundary>
    </QueryClientProvider>
  )

  // Server-side rendering optimization
  if (!isClient) {
    return <QueryClientWrapper>{children}</QueryClientWrapper>
  }

  return (
    <QueryClientWrapper>
      <NetworkStatusIndicator />
      <QueryPerformanceMonitor />
      {children}

      {/* Development tools - only in development with enhanced Suspense */}
      {isDevelopment() && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} position="bottom" />
        </Suspense>
      )}
    </QueryClientWrapper>
  )
}

// React 19 optimized hook to access query metrics with performance optimizations
export function useQueryMetrics() {
  const [metrics, setMetrics] = useState(getQueryMetrics)

  useEffect(() => {
    // Use startTransition for non-urgent metric updates
    const updateMetrics = () => {
      startTransition(() => {
        setMetrics(getQueryMetrics())
      })
    }

    const interval = setInterval(updateMetrics, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  return metrics
}

// Export for use in layout
export default QueryProvider
