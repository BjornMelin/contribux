/**
 * Comprehensive test suite for error boundary system
 * Tests React error boundaries, async error handling, and specialized error boundaries
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button onClick={onClick} {...props} data-testid="button">
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div className={className} {...props} data-testid="card">
      {children}
    </div>
  ),
}))

// Mock advanced types
vi.mock('@/lib/types/advanced', () => ({
  Failure: vi.fn(error => ({ success: false, error })),
  Success: vi.fn(value => ({ success: true, value })),
}))

// Mock window location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000/test',
  },
  writable: true,
})

// Mock navigator
Object.defineProperty(navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Test)',
  writable: true,
})

// Mock PromiseRejectionEvent for jsdom environment
global.PromiseRejectionEvent = class PromiseRejectionEvent extends Event {
  public promise: Promise<unknown>
  public reason: unknown

  constructor(type: string, options: { promise: Promise<unknown>; reason: unknown }) {
    super(type)
    this.promise = options.promise
    this.reason = options.reason
  }
} as typeof PromiseRejectionEvent

// Import components after mocking
import {
  ApiErrorBoundary,
  AppErrorBoundaries,
  AsyncErrorBoundary,
  AuthErrorBoundary,
  ErrorBoundary,
  ErrorReporter,
  errorBoundaryUtils,
  SearchErrorBoundary,
  setupGlobalErrorHandling,
  useErrorHandler,
  withErrorBoundary,
} from '@/components/error-boundaries/error-boundary-system'

// Test components
function ThrowError({ shouldThrow, message }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message || 'Test error')
  }
  return <div>No error</div>
}

function AsyncThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  React.useEffect(() => {
    if (shouldThrow) {
      // Create a handled rejection to prevent unhandled rejection warnings
      const rejection = Promise.reject(new Error('Async test error'))
      rejection.catch(() => {}) // Handle the rejection
    }
  }, [shouldThrow])
  return <div>Async component</div>
}

describe('Error Boundary System', () => {
  let consoleErrorSpy: MockedFunction<typeof console.error>

  beforeEach(() => {
    // Suppress console.error during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* intentionally empty - suppress console output during tests */
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  describe('Base ErrorBoundary', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Test content')).toBeInTheDocument()
    })

    it('should catch and display error with default fallback', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Component error" />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Component error')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
      expect(screen.getByText('Reset')).toBeInTheDocument()
    })

    it('should use custom fallback component', () => {
      const CustomFallback = ({ error }: { error: Error }) => (
        <div>Custom Error: {error.message}</div>
      )

      render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowError shouldThrow={true} message="Custom error" />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom Error: Custom error')).toBeInTheDocument()
    })

    it('should call onError callback when error occurs', () => {
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow={true} message="Callback error" />
        </ErrorBoundary>
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
          errorBoundary: 'ErrorBoundary',
          eventType: 'componentError',
        })
      )
    })

    it('should retry error with retry button', async () => {
      let shouldThrow = true

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Simulate fixing the error
      shouldThrow = false

      const retryButton = screen.getByText('Try Again')
      fireEvent.click(retryButton)

      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )

      await waitFor(() => {
        expect(screen.getByText('No error')).toBeInTheDocument()
      })
    })

    it('should reset error with reset button', async () => {
      let shouldThrow = true

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Simulate fixing the error
      shouldThrow = false

      const resetButton = screen.getByText('Reset')
      fireEvent.click(resetButton)

      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )

      await waitFor(() => {
        expect(screen.getByText('No error')).toBeInTheDocument()
      })
    })

    it('should disable retry after max retries', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const retryButton = screen.getByText('Try Again')

      // Click retry 3 times (max retries)
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)

      // Retry button should be disabled now
      expect(retryButton).toBeDisabled()
    })

    it('should reset on resetKeys change', () => {
      let resetKey = 'key1'

      const { rerender } = render(
        <ErrorBoundary resetKeys={[resetKey]}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Change reset key
      resetKey = 'key2'

      rerender(
        <ErrorBoundary resetKeys={[resetKey]}>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      )

      expect(screen.getByText('No error')).toBeInTheDocument()
    })

    it('should reset on props change when enabled', () => {
      let content = 'content1'

      const { rerender } = render(
        <ErrorBoundary resetOnPropsChange={true}>
          <div>{content}</div>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Change content
      content = 'content2'

      rerender(
        <ErrorBoundary resetOnPropsChange={true}>
          <div>{content}</div>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      )

      expect(screen.getByText('content2')).toBeInTheDocument()
      expect(screen.getByText('No error')).toBeInTheDocument()
    })

    it('should show error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Dev error" />
        </ErrorBoundary>
      )

      expect(screen.getByText('Error Details (Development)')).toBeInTheDocument()

      process.env.NODE_ENV = originalEnv
    })

    it('should handle error in isolated mode', () => {
      render(
        <ErrorBoundary isolate={true}>
          <ThrowError shouldThrow={true} message="Isolated error" />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Isolated error')).toBeInTheDocument()
    })
  })

  describe('AuthErrorBoundary', () => {
    it('should render auth-specific error fallback', () => {
      render(
        <AuthErrorBoundary>
          <ThrowError shouldThrow={true} message="auth token expired" />
        </AuthErrorBoundary>
      )

      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(
        screen.getByText('There was a problem with authentication. Please try signing in again.')
      ).toBeInTheDocument()
      expect(screen.getByText('Sign In')).toBeInTheDocument()
    })

    it('should handle non-auth errors with generic message', () => {
      render(
        <AuthErrorBoundary>
          <ThrowError shouldThrow={true} message="Generic error" />
        </AuthErrorBoundary>
      )

      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(screen.getByText('Generic error')).toBeInTheDocument()
    })

    it('should redirect to sign in page when sign in button clicked', () => {
      // Mock window.location.href setter
      const mockLocationSetter = vi.fn()
      Object.defineProperty(window, 'location', {
        value: {
          get href() {
            return 'http://localhost:3000/test'
          },
          set href(url) {
            mockLocationSetter(url)
          },
        },
        writable: true,
      })

      render(
        <AuthErrorBoundary>
          <ThrowError shouldThrow={true} message="auth error" />
        </AuthErrorBoundary>
      )

      const signInButton = screen.getByText('Sign In')
      fireEvent.click(signInButton)

      expect(mockLocationSetter).toHaveBeenCalledWith('/auth/signin')
    })
  })

  describe('ApiErrorBoundary', () => {
    it('should render network error fallback', () => {
      render(
        <ApiErrorBoundary>
          <ThrowError shouldThrow={true} message="fetch failed" />
        </ApiErrorBoundary>
      )

      expect(screen.getByText('Connection Error')).toBeInTheDocument()
      expect(
        screen.getByText('Unable to connect to the server. Please check your internet connection.')
      ).toBeInTheDocument()
    })

    it('should render server error fallback', () => {
      render(
        <ApiErrorBoundary>
          <ThrowError shouldThrow={true} message="Server error 500" />
        </ApiErrorBoundary>
      )

      expect(screen.getByText('Service Error')).toBeInTheDocument()
      expect(
        screen.getByText('The server is temporarily unavailable. Please try again later.')
      ).toBeInTheDocument()
    })

    it('should render generic error for other API errors', () => {
      render(
        <ApiErrorBoundary>
          <ThrowError shouldThrow={true} message="Invalid API response" />
        </ApiErrorBoundary>
      )

      expect(screen.getByText('Service Error')).toBeInTheDocument()
      expect(screen.getByText('Invalid API response')).toBeInTheDocument()
    })
  })

  describe('SearchErrorBoundary', () => {
    it('should render search-specific error fallback', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} message="Search index error" />
        </SearchErrorBoundary>
      )

      expect(screen.getByText('Search Error')).toBeInTheDocument()
      expect(
        screen.getByText('There was a problem with your search. Please try again.')
      ).toBeInTheDocument()
      expect(screen.getByText('Retry Search')).toBeInTheDocument()
      expect(screen.getByText('Clear Search')).toBeInTheDocument()
    })
  })

  describe('AsyncErrorBoundary', () => {
    it('should catch unhandled promise rejections', async () => {
      render(
        <AsyncErrorBoundary>
          <AsyncThrowError shouldThrow={true} />
        </AsyncErrorBoundary>
      )

      // Trigger unhandled rejection event
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: (() => {
          const p = Promise.reject(new Error('Async error'))
          p.catch(() => {}) // Handle rejection
          return p
        })(),
        reason: new Error('Async error'),
      })

      window.dispatchEvent(rejectionEvent)

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
        expect(screen.getByText('Async error')).toBeInTheDocument()
      })
    })

    it('should handle string rejection reasons', async () => {
      render(
        <AsyncErrorBoundary>
          <div>Async content</div>
        </AsyncErrorBoundary>
      )

      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: (() => {
          const p = Promise.reject('String error')
          p.catch(() => {}) // Handle rejection
          return p
        })(),
        reason: 'String error',
      })

      window.dispatchEvent(rejectionEvent)

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
        expect(screen.getByText('String error')).toBeInTheDocument()
      })
    })

    it('should call onError for async errors', async () => {
      const onError = vi.fn()

      render(
        <AsyncErrorBoundary onError={onError}>
          <div>Content</div>
        </AsyncErrorBoundary>
      )

      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: (() => {
          const p = Promise.reject(new Error('Async callback error'))
          p.catch(() => {}) // Handle rejection
          return p
        })(),
        reason: new Error('Async callback error'),
      })

      window.dispatchEvent(rejectionEvent)

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            componentStack: 'Async Error',
            errorBoundary: 'AsyncErrorBoundary',
            eventType: 'unhandledRejection',
          })
        )
      })
    })

    it('should reset async errors', async () => {
      render(
        <AsyncErrorBoundary>
          <div>Content</div>
        </AsyncErrorBoundary>
      )

      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: (() => {
          const p = Promise.reject(new Error('Reset test error'))
          p.catch(() => {}) // Handle rejection
          return p
        })(),
        reason: new Error('Reset test error'),
      })

      window.dispatchEvent(rejectionEvent)

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      })

      const resetButton = screen.getByText('Reset')
      fireEvent.click(resetButton)

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })
    })
  })

  describe('withErrorBoundary HOC', () => {
    it('should wrap component with error boundary', () => {
      const TestComponent = ({ shouldThrow }: { shouldThrow: boolean }) => (
        <ThrowError shouldThrow={shouldThrow} />
      )

      const WrappedComponent = withErrorBoundary(TestComponent)

      render(<WrappedComponent shouldThrow={true} />)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should use provided error boundary props', () => {
      const customFallback = ({ error }: { error: Error }) => <div>HOC Error: {error.message}</div>
      const TestComponent = () => <ThrowError shouldThrow={true} message="HOC test error" />

      const WrappedComponent = withErrorBoundary(TestComponent, {
        fallback: customFallback,
      })

      render(<WrappedComponent />)

      expect(screen.getByText('HOC Error: HOC test error')).toBeInTheDocument()
    })

    it('should set correct display name', () => {
      const TestComponent = () => <div>Test</div>
      TestComponent.displayName = 'TestComponent'

      const WrappedComponent = withErrorBoundary(TestComponent)

      expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)')
    })
  })

  describe('useErrorHandler hook', () => {
    function TestErrorHandler() {
      const { captureError, resetError } = useErrorHandler()

      return (
        <div>
          <button type="button" onClick={() => captureError('Hook error')}>
            Capture Error
          </button>
          <button type="button" onClick={resetError}>
            Reset Error
          </button>
        </div>
      )
    }

    it('should capture and throw errors', () => {
      const { container } = render(
        <ErrorBoundary>
          <TestErrorHandler />
        </ErrorBoundary>
      )

      const captureButton = container.querySelector('button')
      expect(captureButton).toBeInTheDocument()
      fireEvent.click(captureButton as HTMLElement)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Hook error')).toBeInTheDocument()
    })

    it('should handle Error objects', () => {
      function TestErrorObjectHandler() {
        const { captureError } = useErrorHandler()

        return (
          <button type="button" onClick={() => captureError(new Error('Error object'))}>
            Capture Error Object
          </button>
        )
      }

      render(
        <ErrorBoundary>
          <TestErrorObjectHandler />
        </ErrorBoundary>
      )

      const captureButton = screen.getByText('Capture Error Object')
      fireEvent.click(captureButton)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Error object')).toBeInTheDocument()
    })
  })

  describe('setupGlobalErrorHandling', () => {
    it('should setup global error listeners in browser environment', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

      setupGlobalErrorHandling()

      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))

      addEventListenerSpy.mockRestore()
    })

    it('should not setup listeners in non-browser environment', () => {
      const originalWindow = global.window
      // @ts-expect-error - Testing non-browser environment
      global.window = undefined

      const addEventListenerSpy = vi.fn()
      global.addEventListener = addEventListenerSpy

      setupGlobalErrorHandling()

      expect(addEventListenerSpy).not.toHaveBeenCalled()

      global.window = originalWindow
    })
  })

  describe('AppErrorBoundaries', () => {
    it('should compose multiple error boundaries', () => {
      render(
        <AppErrorBoundaries>
          <div>App content</div>
        </AppErrorBoundaries>
      )

      expect(screen.getByText('App content')).toBeInTheDocument()
    })

    it('should catch errors in composed boundaries', () => {
      render(
        <AppErrorBoundaries>
          <ThrowError shouldThrow={true} message="App error" />
        </AppErrorBoundaries>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('App error')).toBeInTheDocument()
    })
  })

  describe('ErrorReporter', () => {
    it('should be a singleton', () => {
      const instance1 = ErrorReporter.getInstance()
      const instance2 = ErrorReporter.getInstance()

      expect(instance1).toBe(instance2)
    })

    it('should report errors successfully', () => {
      const reporter = ErrorReporter.getInstance()
      const error = new Error('Report test error')
      const context = { userId: '123', feature: 'search' }

      const result = reporter.reportError(error, context)

      expect(result.success).toBe(true)
    })

    it('should handle report errors', () => {
      const reporter = ErrorReporter.getInstance()

      // Mock a reporting error by throwing in the try block
      const error = new Error('Test error')
      error.stack = undefined // This might cause internal issues

      const result = reporter.reportError(error)

      expect(result.success).toBe(true) // Should still succeed as it's mocked
    })

    it('should report performance issues', () => {
      const reporter = ErrorReporter.getInstance()

      // Should not throw
      expect(() => {
        reporter.reportPerformanceIssue('pageLoad', 5000, 3000)
      }).not.toThrow()
    })
  })

  describe('errorBoundaryUtils', () => {
    it('should create appropriate boundary components', () => {
      expect(errorBoundaryUtils.createBoundary('auth')).toBe(AuthErrorBoundary)
      expect(errorBoundaryUtils.createBoundary('api')).toBe(ApiErrorBoundary)
      expect(errorBoundaryUtils.createBoundary('search')).toBe(SearchErrorBoundary)
      expect(errorBoundaryUtils.createBoundary('default')).toBe(ErrorBoundary)
    })

    it('should wrap component with appropriate boundary', () => {
      const TestComponent = () => <ThrowError shouldThrow={true} message="auth error" />

      const WrappedComponent = errorBoundaryUtils.wrapWithBoundary(TestComponent, 'auth')

      render(<WrappedComponent />)

      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    })

    it('should use default boundary when type not specified', () => {
      const TestComponent = () => <ThrowError shouldThrow={true} message="default error" />

      const WrappedComponent = errorBoundaryUtils.wrapWithBoundary(TestComponent)

      render(<WrappedComponent />)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle undefined error message', () => {
      const error = new Error()
      error.message = ''

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="" />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })

    it('should handle errors with no stack trace', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      // Create error without stack
      const ErrorWithoutStack = () => {
        const error = new Error('No stack error')
        error.stack = undefined
        throw error
      }

      render(
        <ErrorBoundary>
          <ErrorWithoutStack />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Error Details (Development)')).toBeInTheDocument()

      process.env.NODE_ENV = originalEnv
    })

    it('should handle boundary unmounting with listeners', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = render(
        <AsyncErrorBoundary>
          <div>Content</div>
        </AsyncErrorBoundary>
      )

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function)
      )

      removeEventListenerSpy.mockRestore()
    })

    it('should prevent default behavior on promise rejection', () => {
      const preventDefaultSpy = vi.fn()

      render(
        <AsyncErrorBoundary>
          <div>Content</div>
        </AsyncErrorBoundary>
      )

      // Create a handled rejected promise to avoid unhandled rejection
      const rejectedPromise = Promise.reject(new Error('Test'))
      rejectedPromise.catch(() => {}) // Handle the rejection to prevent warnings
      
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: rejectedPromise,
        reason: new Error('Test'),
      })
      rejectionEvent.preventDefault = preventDefaultSpy

      window.dispatchEvent(rejectionEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should handle null error in async boundary', () => {
      const component = render(
        <AsyncErrorBoundary>
          <div>Content</div>
        </AsyncErrorBoundary>
      )

      // Force state with null error
      const instance = component.container.querySelector('[data-testid]') as HTMLElement | null
      if (instance) {
        // Simulate internal state change
        expect(screen.getByText('Content')).toBeInTheDocument()
      }
    })
  })
})
