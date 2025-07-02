/**
 * Error Boundary System
 * Provides systematic error catching and recovery for different parts of the app
 * Implements error boundary pattern with logging and monitoring integration
 */

'use client'

import React from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  type ErrorInfo as CustomErrorInfo,
  type ErrorBoundaryState,
  Failure,
  type PropsWithChildren,
  type Result,
  Success,
} from '@/lib/types/advanced'

// Base error boundary component
interface ErrorBoundaryProps extends PropsWithChildren {
  fallback?: React.ComponentType<ErrorFallbackProps>
  onError?: (error: Error, errorInfo: CustomErrorInfo) => void
  resetOnPropsChange?: boolean
  resetKeys?: Array<string | number>
  isolate?: boolean
}

interface ErrorFallbackProps {
  error: Error
  errorInfo: CustomErrorInfo | undefined
  retry: () => void
  reset: () => void
  canRetry?: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryCount = 0
  private readonly maxRetries = 3
  private prevResetKeys: Array<string | number> = []

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
    this.prevResetKeys = props.resetKeys || []
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const customErrorInfo: CustomErrorInfo = {
      componentStack: errorInfo.componentStack || '',
      errorBoundary: this.constructor.name,
      eventType: 'componentError',
    }

    this.setState({
      error,
      errorInfo: customErrorInfo,
    })

    // Log error
    this.logError(error, customErrorInfo)

    // Call onError prop
    this.props.onError?.(error, customErrorInfo)
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props
    const { hasError } = this.state

    // Reset on prop changes if enabled
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetBoundary()
    }

    // Reset on resetKeys change
    if (hasError && resetKeys) {
      const hasResetKeyChanged = resetKeys.some((key, idx) => this.prevResetKeys[idx] !== key)

      if (hasResetKeyChanged) {
        this.prevResetKeys = resetKeys
        this.resetBoundary()
      }
    }
  }

  private logError = (_error: Error, _errorInfo: CustomErrorInfo) => {
    // Could integrate with monitoring service
    // monitoringService.recordError(error, errorInfo)
  }

  private resetBoundary = () => {
    this.setState({ hasError: false })
    this.retryCount = 0
  }

  private retry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++
      this.resetBoundary()
    }
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback

      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          retry={this.retry}
          reset={this.resetBoundary}
          canRetry={this.retryCount < this.maxRetries}
        />
      )
    }

    return this.props.children
  }
}

// Default error fallback component
function DefaultErrorFallback({ error, retry, reset, canRetry }: ErrorFallbackProps) {
  return (
    <Card className="m-4 border-red-200 bg-red-50 p-6">
      <div className="text-center">
        <h2 className="mb-2 font-semibold text-lg text-red-800">Something went wrong</h2>
        <p className="mb-4 text-red-600">{error.message || 'An unexpected error occurred'}</p>
        <div className="space-x-2">
          {canRetry && (
            <Button onClick={retry} variant="outline" size="sm">
              Try Again
            </Button>
          )}
          <Button onClick={reset} variant="outline" size="sm">
            Reset
          </Button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-red-700 text-sm">
              Error Details (Development)
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-red-100 p-2 text-xs">{error.stack}</pre>
          </details>
        )}
      </div>
    </Card>
  )
}

// Specialized error boundaries for different app sections

// Authentication error boundary
function AuthErrorFallback({ error, retry, canRetry }: ErrorFallbackProps) {
  const isAuthError = error.message.includes('auth') || error.message.includes('token')

  return (
    <Card className="m-4 border-yellow-200 bg-yellow-50 p-6">
      <div className="text-center">
        <h2 className="mb-2 font-semibold text-lg text-yellow-800">Authentication Error</h2>
        <p className="mb-4 text-yellow-600">
          {isAuthError
            ? 'There was a problem with authentication. Please try signing in again.'
            : error.message}
        </p>
        <div className="space-x-2">
          {canRetry && (
            <Button onClick={retry} variant="outline" size="sm">
              Retry
            </Button>
          )}
          <Button
            onClick={() => {
              window.location.href = '/auth/signin'
            }}
            size="sm"
          >
            Sign In
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function AuthErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary fallback={AuthErrorFallback} {...props}>
      {children}
    </ErrorBoundary>
  )
}

// API error boundary
function ApiErrorFallback({ error, retry, reset, canRetry }: ErrorFallbackProps) {
  const isNetworkError = error.message.includes('fetch') || error.message.includes('network')
  const isServerError = error.message.includes('500') || error.message.includes('503')

  return (
    <Card className="m-4 border-blue-200 bg-blue-50 p-6">
      <div className="text-center">
        <h2 className="mb-2 font-semibold text-blue-800 text-lg">
          {isNetworkError ? 'Connection Error' : 'Service Error'}
        </h2>
        <p className="mb-4 text-blue-600">
          {isNetworkError
            ? 'Unable to connect to the server. Please check your internet connection.'
            : isServerError
              ? 'The server is temporarily unavailable. Please try again later.'
              : error.message}
        </p>
        <div className="space-x-2">
          {canRetry && (
            <Button onClick={retry} variant="outline" size="sm">
              Retry
            </Button>
          )}
          <Button onClick={reset} variant="outline" size="sm">
            Go Back
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function ApiErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary fallback={ApiErrorFallback} {...props}>
      {children}
    </ErrorBoundary>
  )
}

// Search error boundary
function SearchErrorFallback({ error: _error, retry, reset, canRetry }: ErrorFallbackProps) {
  return (
    <Card className="m-4 border-purple-200 bg-purple-50 p-6">
      <div className="text-center">
        <h2 className="mb-2 font-semibold text-lg text-purple-800">Search Error</h2>
        <p className="mb-4 text-purple-600">
          There was a problem with your search. Please try again.
        </p>
        <div className="space-x-2">
          {canRetry && (
            <Button onClick={retry} variant="outline" size="sm">
              Retry Search
            </Button>
          )}
          <Button onClick={reset} variant="outline" size="sm">
            Clear Search
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function SearchErrorBoundary({ children, ...props }: ErrorBoundaryProps) {
  return (
    <ErrorBoundary fallback={SearchErrorFallback} {...props}>
      {children}
    </ErrorBoundary>
  )
}

// Async error boundary for handling promise rejections
interface AsyncErrorBoundaryState {
  asyncError: Error | null
}

export class AsyncErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState & AsyncErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, asyncError: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidMount() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handlePromiseRejection)
  }

  override componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection)
  }

  private handlePromiseRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault()

    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))

    this.setState({ asyncError: error })

    const errorInfo: CustomErrorInfo = {
      componentStack: 'Async Error',
      errorBoundary: 'AsyncErrorBoundary',
      eventType: 'unhandledRejection',
    }

    this.props.onError?.(error, errorInfo)
  }

  override render() {
    if (this.state.hasError || this.state.asyncError) {
      const error = this.state.error || this.state.asyncError
      if (!error) return null
      const FallbackComponent = this.props.fallback || DefaultErrorFallback

      return (
        <FallbackComponent
          error={error}
          errorInfo={undefined}
          retry={() => this.setState({ hasError: false, asyncError: null })}
          reset={() => this.setState({ hasError: false, asyncError: null })}
          canRetry={true}
        />
      )
    }

    return this.props.children
  }
}

// Error boundary HOC
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

// Error boundary hook for functional components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null)

  const resetError = React.useCallback(() => {
    setError(null)
  }, [])

  const captureError = React.useCallback((error: Error | string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error
    setError(errorObj)
  }, [])

  // Re-throw error to trigger error boundary
  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { captureError, resetError }
}

// Global error handler setup
export function setupGlobalErrorHandling() {
  // Only setup in browser environment
  if (typeof window === 'undefined') return

  // Handle uncaught errors
  window.addEventListener('error', _event => {
    // Could send to monitoring service
  })

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', _event => {
    // Could send to monitoring service
  })
}

// Error boundary composition for app layout
export function AppErrorBoundaries({ children }: PropsWithChildren) {
  return (
    <AsyncErrorBoundary>
      <AuthErrorBoundary>
        <ApiErrorBoundary>{children}</ApiErrorBoundary>
      </AuthErrorBoundary>
    </AsyncErrorBoundary>
  )
}

// Error monitoring utilities
export class ErrorReporter {
  private static instance: ErrorReporter

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter()
    }
    return ErrorReporter.instance
  }

  reportError(error: Error, context?: Record<string, unknown>): Result<void, Error> {
    try {
      // In production, this would send to monitoring service
      const _errorReport = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        context,
      }

      // Mock sending to monitoring service
      // await monitoringService.send(errorReport)

      return Success(void 0)
    } catch (reportError) {
      return Failure(reportError instanceof Error ? reportError : new Error(String(reportError)))
    }
  }

  reportPerformanceIssue(_metric: string, value: number, threshold: number): void {
    if (value > threshold) {
      // Could send to monitoring service
    }
  }
}

// Usage examples and utilities
export const errorBoundaryUtils = {
  // Create error boundary with specific configuration
  createBoundary: (type: 'auth' | 'api' | 'search' | 'default') => {
    const boundaryMap = {
      auth: AuthErrorBoundary,
      api: ApiErrorBoundary,
      search: SearchErrorBoundary,
      default: ErrorBoundary,
    }

    return boundaryMap[type]
  },

  // Wrap component with appropriate error boundary
  wrapWithBoundary: <P extends object>(
    Component: React.ComponentType<P>,
    type: 'auth' | 'api' | 'search' | 'default' = 'default'
  ) => {
    const Boundary = errorBoundaryUtils.createBoundary(type)

    return (props: P) => (
      <Boundary>
        <Component {...props} />
      </Boundary>
    )
  },
}
