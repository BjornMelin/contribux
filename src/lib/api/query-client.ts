/**
 * TanStack Query Client Configuration
 * Optimized data fetching with caching, error recovery, and performance monitoring
 *
 * Features:
 * - Intelligent retry strategies with exponential backoff
 * - Request deduplication and background refresh
 * - Circuit breaker pattern for API resilience
 * - Performance monitoring and cache optimization
 * - Offline-first patterns with background sync
 */

import type { QueryFunction } from '@tanstack/react-query'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

// Circuit breaker state management
class CircuitBreaker {
  private failures = 0
  private lastFailureTime: number | null = null
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(
    private readonly failureThreshold = 5,
    private readonly recoveryTimeout = 30000 // 30 seconds
  ) {}

  canMakeRequest(): boolean {
    if (this.state === 'closed') return true

    if (this.state === 'open') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open'
        return true
      }
      return false
    }

    // half-open state
    return true
  }

  onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
    this.lastFailureTime = null
  }

  onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.state === 'half-open') {
      this.state = 'open'
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open'
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    }
  }
}

// Global circuit breakers for different API endpoints
const circuitBreakers = new Map<string, CircuitBreaker>()

function getCircuitBreaker(endpoint: string): CircuitBreaker {
  if (!circuitBreakers.has(endpoint)) {
    circuitBreakers.set(endpoint, new CircuitBreaker())
  }
  const breaker = circuitBreakers.get(endpoint)
  if (!breaker) {
    throw new Error(`Failed to create circuit breaker for endpoint: ${endpoint}`)
  }
  return breaker
}

// Type definitions for better error handling
interface HttpError extends Error {
  status: number
  response: ErrorResponse
}

interface ErrorResponse {
  error?: { message?: string }
  message?: string
}

// Helper function to check circuit breaker
function checkCircuitBreaker(endpoint: string): CircuitBreaker {
  const circuitBreaker = getCircuitBreaker(endpoint)
  if (!circuitBreaker.canMakeRequest()) {
    throw new Error(`Circuit breaker is open for ${endpoint}`)
  }
  return circuitBreaker
}

// Helper function to create request with timeout
async function createRequestWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// Helper function to handle HTTP errors
async function handleHttpError(response: Response): Promise<never> {
  const errorText = await response.text()
  let errorData: ErrorResponse = {}

  try {
    errorData = JSON.parse(errorText)
  } catch {
    // Ignore JSON parse errors
  }

  const error = new Error(
    errorData.error?.message ||
      errorData.message ||
      `HTTP ${response.status}: ${response.statusText}`
  ) as HttpError

  error.status = response.status
  error.response = errorData

  throw error
}

// Helper function to determine if error should be retried
function shouldRetryError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return false
  }

  const httpError = error as HttpError
  const status = httpError.status
  return status !== 401 && status !== 403 && status !== 404
}

// Helper function to calculate retry delay
function calculateRetryDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  return Math.min(baseDelay * 2 ** attempt + Math.random() * 1000, maxDelay)
}

// Enhanced fetch with circuit breaker and retry logic
export async function enhancedFetch<T>(
  url: string,
  options: RequestInit = {},
  retryConfig: {
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = retryConfig

  const endpoint = new URL(url).pathname
  const circuitBreaker = checkCircuitBreaker(endpoint)

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await createRequestWithTimeout(url, options)

      if (!response.ok) {
        await handleHttpError(response)
      }

      const data = await response.json()
      circuitBreaker.onSuccess()
      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (!shouldRetryError(error) || attempt === maxRetries) {
        circuitBreaker.onFailure()
        throw lastError
      }

      const delay = calculateRetryDelay(attempt, baseDelay, maxDelay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  circuitBreaker.onFailure()
  throw lastError || new Error('Maximum retries exceeded')
}

// Request deduplication with cleanup
const ongoingRequests = new Map<string, Promise<unknown>>()
const requestTimestamps = new Map<string, number>()

// Cleanup old requests every 5 minutes (client-side only)
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      const now = Date.now()
      const fiveMinutesAgo = now - 5 * 60 * 1000

      for (const [key, timestamp] of requestTimestamps.entries()) {
        if (timestamp < fiveMinutesAgo) {
          ongoingRequests.delete(key)
          requestTimestamps.delete(key)
        }
      }
    },
    5 * 60 * 1000
  )
}

export function deduplicatedFetch<T>(
  url: string,
  options: RequestInit = {},
  retryConfig?: Parameters<typeof enhancedFetch>[2]
): Promise<T> {
  const key = `${url}:${JSON.stringify(options)}`

  if (ongoingRequests.has(key)) {
    const request = ongoingRequests.get(key)
    if (!request) {
      throw new Error(`Ongoing request not found for key: ${key}`)
    }
    return request as Promise<T>
  }

  const promise = enhancedFetch<T>(url, options, retryConfig).finally(() => {
    ongoingRequests.delete(key)
    requestTimestamps.delete(key)
  })

  ongoingRequests.set(key, promise)
  requestTimestamps.set(key, Date.now())
  return promise
}

// Performance monitoring
interface QueryMetrics {
  queryKey: string
  duration: number
  cacheHit: boolean
  error?: string
  timestamp: number
}

const queryMetrics: QueryMetrics[] = []

function logQueryMetrics(metrics: QueryMetrics) {
  queryMetrics.push(metrics)

  // Keep only last 1000 metrics
  if (queryMetrics.length > 1000) {
    queryMetrics.splice(0, 500)
  }

  // Log slow queries in development
  if (process.env.NODE_ENV === 'development' && metrics.duration > 2000) {
    // Note: Slow query detected, logged to metrics array for monitoring
  }
}

export function getQueryMetrics() {
  const metricsArray = queryMetrics || []
  const cbStates = circuitBreakers ? Array.from(circuitBreakers.entries()).map(([endpoint, cb]) => ({
    endpoint,
    ...cb.getState(),
  })) : []

  return {
    metrics: [...metricsArray],
    averageDuration:
      metricsArray.length > 0 ? metricsArray.reduce((acc, m) => acc + m.duration, 0) / metricsArray.length : 0,
    cacheHitRate:
      metricsArray.length > 0 ? metricsArray.filter(m => m.cacheHit).length / metricsArray.length : 0,
    errorRate:
      metricsArray.length > 0 ? metricsArray.filter(m => m.error).length / metricsArray.length : 0,
    circuitBreakerStates: cbStates,
  }
}

// Enhanced query function with monitoring
export function createQueryFunction<T>(
  fetcher: (variables: unknown) => Promise<T>
): QueryFunction<T> {
  return async ({ queryKey, signal }) => {
    const startTime = Date.now()
    const keyString = JSON.stringify(queryKey)

    try {
      // Check if signal is already aborted
      if (signal?.aborted) {
        throw new Error('Query was cancelled')
      }

      const result = await fetcher(queryKey[1])

      logQueryMetrics({
        queryKey: keyString,
        duration: Date.now() - startTime,
        cacheHit: false,
        timestamp: Date.now(),
      })

      return result
    } catch (error) {
      logQueryMetrics({
        queryKey: keyString,
        duration: Date.now() - startTime,
        cacheHit: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      })

      throw error
    }
  }
}

// Query client configuration - lazy loaded to avoid build-time issues
let queryClientInstance: QueryClient | null = null
const createQueryClient = () => new QueryClient({
  queryCache: new QueryCache({
    onError: (_error, _query) => {
      // Error handling is done at the component level
    },
    onSuccess: (_data, query) => {
      const keyString = JSON.stringify(query.queryKey)
      logQueryMetrics({
        queryKey: keyString,
        duration: 0, // Cache hit
        cacheHit: true,
        timestamp: Date.now(),
      })
    },
  }),

  mutationCache: new MutationCache({
    onError: (_error, _variables, _context, _mutation) => {
      // Error handling is done at the component level
    },
  }),

  defaultOptions: {
    queries: {
      // Stale time: 5 minutes for most queries
      staleTime: 5 * 60 * 1000,

      // Cache time: 30 minutes
      gcTime: 30 * 60 * 1000,

      // Retry configuration with exponential backoff
      retry: (failureCount, error: unknown) => {
        // Don't retry on certain errors
        const httpError = error as HttpError
        if (
          httpError?.status === 401 ||
          httpError?.status === 403 ||
          httpError?.status === 404 ||
          (error as Error)?.name === 'AbortError'
        ) {
          return false
        }

        // Retry up to 3 times for other errors
        return failureCount < 3
      },

      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Background refetch settings
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: 'always',

      // Network mode for offline handling
      networkMode: 'online',

      // Meta data for query identification
      meta: {
        errorMessage: 'Something went wrong. Please try again.',
      },
    },

    mutations: {
      // Retry mutations once
      retry: 1,
      retryDelay: 1000,

      // Network mode
      networkMode: 'online',

      meta: {
        errorMessage: 'Operation failed. Please try again.',
      },
    },
  },
})

// Export query client as a proxy to lazy load on first use
// Direct instantiation instead of Proxy pattern to avoid build issues
export const queryClient = createQueryClient()

// Query key factories for consistent cache management
export const queryKeys = {
  all: ['api'] as const,

  repositories: () => [...queryKeys.all, 'repositories'] as const,
  repositoriesSearch: (params: unknown) => [...queryKeys.repositories(), 'search', params] as const,
  repositoriesDetail: (owner: string, repo: string) =>
    [...queryKeys.repositories(), 'detail', owner, repo] as const,

  opportunities: () => [...queryKeys.all, 'opportunities'] as const,
  opportunitiesSearch: (params: unknown) =>
    [...queryKeys.opportunities(), 'search', params] as const,
  opportunitiesDetail: (id: string) => [...queryKeys.opportunities(), 'detail', id] as const,

  auth: () => [...queryKeys.all, 'auth'] as const,
  authSession: () => [...queryKeys.auth(), 'session'] as const,
  authProviders: () => [...queryKeys.auth(), 'providers'] as const,

  github: () => [...queryKeys.all, 'github'] as const,
  githubUser: () => [...queryKeys.github(), 'user'] as const,
  githubHealth: () => [...queryKeys.github(), 'health'] as const,
} as const

// Cache invalidation helpers
export const cacheUtils = {
  invalidateRepositories: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.repositories() })
  },

  invalidateOpportunities: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() })
  },

  invalidateAuth: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.auth() })
  },

  prefetchRepositoriesSearch: (params: unknown) => {
    return queryClient.prefetchQuery({
      queryKey: queryKeys.repositoriesSearch(params),
      staleTime: 2 * 60 * 1000, // 2 minutes for search results
    })
  },

  removeRepositoryDetail: (owner: string, repo: string) => {
    queryClient.removeQueries({
      queryKey: queryKeys.repositoriesDetail(owner, repo),
    })
  },
}

// Background sync for offline scenarios
export function setupBackgroundSync() {
  if (typeof window === 'undefined') return

  // Listen for online/offline events
  window.addEventListener('online', () => {
    queryClient.resumePausedMutations()
    queryClient.invalidateQueries()
  })

  window.addEventListener('offline', () => {
    // Queries are paused automatically by TanStack Query when offline
  })

  // Periodic cache cleanup with better memory management (client-side only)
  if (typeof window !== 'undefined') {
    setInterval(
      () => {
        // Clear only stale queries instead of all queries
        queryClient
          .getQueryCache()
          .findAll({
            stale: true,
          })
          .forEach(query => {
            queryClient.getQueryCache().remove(query)
          })

        // Force garbage collection if available (only in browser environment)
        if (typeof window !== 'undefined' && 'gc' in window && typeof (window as any).gc === 'function') {
          ;(window as any).gc()
        }
      },
      30 * 60 * 1000
    ) // Every 30 minutes
  }
}
