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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Query Error Boundary caught an error:', error, errorInfo)

    // Log to external error service in production
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { extra: errorInfo })
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-8 w-8 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Something went wrong</h3>
              </div>
            </div>

            <div className="text-sm text-gray-500 mb-4">
              We encountered an unexpected error. Please try refreshing the page.
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
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

// Performance monitoring component
function QueryPerformanceMonitor() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const metrics = getQueryMetrics()

        if (metrics.metrics.length > 0) {
          console.group('🔍 Query Performance Metrics')
          console.log('Average Duration:', `${metrics.averageDuration.toFixed(2)}ms`)
          console.log('Cache Hit Rate:', `${(metrics.cacheHitRate * 100).toFixed(1)}%`)
          console.log('Error Rate:', `${(metrics.errorRate * 100).toFixed(1)}%`)

          if (metrics.circuitBreakerStates.length > 0) {
            console.log('Circuit Breakers:', metrics.circuitBreakerStates)
          }

          const slowQueries = metrics.metrics.filter(m => m.duration > 2000)
          if (slowQueries.length > 0) {
            console.warn('Slow Queries:', slowQueries)
          }

          console.groupEnd()
        }
      }, 30000) // Every 30 seconds

      return () => clearInterval(interval)
    }
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
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-2 text-center text-sm">
      <div className="flex items-center justify-center">
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools
            initialIsOpen={false}
            position="bottom-right"
            toggleButtonProps={{
              style: {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: 99999,
              },
            }}
          />
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
