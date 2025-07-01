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

import type { QueryFunction, QueryKey } from '@tanstack/react-query'
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
  return circuitBreakers.get(endpoint)!
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
  const circuitBreaker = getCircuitBreaker(endpoint)

  // Check circuit breaker
  if (!circuitBreaker.canMakeRequest()) {
    throw new Error(`Circuit breaker is open for ${endpoint}`)
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any = {}

        try {
          errorData = JSON.parse(errorText)
        } catch {
          // Ignore JSON parse errors
        }

        const error = new Error(
          errorData.error?.message ||
            errorData.message ||
            `HTTP ${response.status}: ${response.statusText}`
        )
        ;(error as any).status = response.status
        ;(error as any).response = errorData

        throw error
      }

      const data = await response.json()
      circuitBreaker.onSuccess()

      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on certain error types
      if (
        lastError.name === 'AbortError' ||
        (error as any)?.status === 401 ||
        (error as any)?.status === 403 ||
        (error as any)?.status === 404
      ) {
        circuitBreaker.onFailure()
        throw lastError
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        circuitBreaker.onFailure()
        throw lastError
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * 2 ** attempt + Math.random() * 1000, maxDelay)

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  circuitBreaker.onFailure()
  throw lastError || new Error('Maximum retries exceeded')
}

// Request deduplication
const ongoingRequests = new Map<string, Promise<any>>()

export function deduplicatedFetch<T>(
  url: string,
  options: RequestInit = {},
  retryConfig?: Parameters<typeof enhancedFetch>[2]
): Promise<T> {
  const key = `${url}:${JSON.stringify(options)}`

  if (ongoingRequests.has(key)) {
    return ongoingRequests.get(key)!
  }

  const promise = enhancedFetch<T>(url, options, retryConfig).finally(() => {
    ongoingRequests.delete(key)
  })

  ongoingRequests.set(key, promise)
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
    console.warn(`🐌 Slow query detected: ${metrics.queryKey} took ${metrics.duration}ms`, {
      metrics,
    })
  }
}

export function getQueryMetrics() {
  return {
    metrics: [...queryMetrics],
    averageDuration:
      queryMetrics.reduce((acc, m) => acc + m.duration, 0) / queryMetrics.length || 0,
    cacheHitRate: queryMetrics.filter(m => m.cacheHit).length / queryMetrics.length || 0,
    errorRate: queryMetrics.filter(m => m.error).length / queryMetrics.length || 0,
    circuitBreakerStates: Array.from(circuitBreakers.entries()).map(([endpoint, cb]) => ({
      endpoint,
      ...cb.getState(),
    })),
  }
}

// Enhanced query function with monitoring
export function createQueryFunction<T>(fetcher: (variables: any) => Promise<T>): QueryFunction<T> {
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

// Query client configuration
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error('Query error:', error, { queryKey: query.queryKey })
    },
    onSuccess: (data, query) => {
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
    onError: (error, variables, context, mutation) => {
      console.error('Mutation error:', error, {
        mutationKey: mutation.options.mutationKey,
        variables,
      })
    },
  }),

  defaultOptions: {
    queries: {
      // Stale time: 5 minutes for most queries
      staleTime: 5 * 60 * 1000,

      // Cache time: 30 minutes
      gcTime: 30 * 60 * 1000,

      // Retry configuration with exponential backoff
      retry: (failureCount, error: any) => {
        // Don't retry on certain errors
        if (
          error?.status === 401 ||
          error?.status === 403 ||
          error?.status === 404 ||
          error?.name === 'AbortError'
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

// Query key factories for consistent cache management
export const queryKeys = {
  all: ['api'] as const,

  repositories: () => [...queryKeys.all, 'repositories'] as const,
  repositoriesSearch: (params: any) => [...queryKeys.repositories(), 'search', params] as const,
  repositoriesDetail: (owner: string, repo: string) =>
    [...queryKeys.repositories(), 'detail', owner, repo] as const,

  opportunities: () => [...queryKeys.all, 'opportunities'] as const,
  opportunitiesSearch: (params: any) => [...queryKeys.opportunities(), 'search', params] as const,
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

  prefetchRepositoriesSearch: (params: any) => {
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
    // Queries will be paused automatically
  })

  // Periodic cache cleanup
  setInterval(
    () => {
      queryClient.getQueryCache().clear()
    },
    60 * 60 * 1000
  ) // Every hour
}
