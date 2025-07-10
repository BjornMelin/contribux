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
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import React, { type ReactNode, useEffect, useState } from 'react'
import { getQueryMetrics, queryClient, setupBackgroundSync } from '@/lib/api/query-client'
import { isDevelopment, isProduction } from '@/lib/validation/env'

interface QueryProviderProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

// Error boundary for API errors
class QueryErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Log to external error service in production
    if (isProduction()) {
      // Example: Sentry.captureException(error, { extra: errorInfo })
    }
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="h-8 w-8 text-red-400"
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
                <h3 className="font-medium text-gray-900 text-lg">Something went wrong</h3>
              </div>
            </div>

            <div className="mb-4 text-gray-500 text-sm">
              We encountered an unexpected error. Please try refreshing the page.
            </div>

            {isDevelopment() && this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer font-medium text-gray-700 text-sm">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-gray-100 p-2 text-xs">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-700"
              >
                Refresh Page
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="flex-1 rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-800 text-sm transition-colors hover:bg-gray-300"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
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

// Main query provider component
export function QueryProvider({ children }: QueryProviderProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    setupBackgroundSync()
  }, [])

  // Don't render devtools on server
  if (!isClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <QueryErrorBoundary>{children}</QueryErrorBoundary>
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <QueryErrorBoundary>
        <NetworkStatusIndicator />
        <QueryPerformanceMonitor />
        {children}

        {/* Development tools - only in development */}
        {isDevelopment() && (
          <ReactQueryDevtools initialIsOpen={false} position="bottom" />
        )}
      </QueryErrorBoundary>
    </QueryClientProvider>
  )
}

// Hook to access query metrics in components
export function useQueryMetrics() {
  const [metrics, setMetrics] = useState(getQueryMetrics())

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(getQueryMetrics())
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  return metrics
}

// Export for use in layout
export default QueryProvider
