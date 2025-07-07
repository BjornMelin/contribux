/**
 * Optimized API Caching Strategy
 * Advanced caching layer for GitHub API and internal API calls
 */

import type { QueryClient } from '@tanstack/react-query'

// Cache configuration constants
export const CACHE_KEYS = {
  REPOSITORIES: 'repositories',
  REPOSITORY_DETAILS: 'repository-details',
  USER_PROFILE: 'user-profile',
  SEARCH_RESULTS: 'search-results',
  TRENDING: 'trending',
  OPPORTUNITIES: 'opportunities',
  HEALTH_METRICS: 'health-metrics',
} as const

// Optimized cache durations based on data volatility
export const CACHE_DURATIONS = {
  // Static or rarely changing data - 1 hour
  REPOSITORY_METADATA: 60 * 60 * 1000,
  USER_PROFILE: 60 * 60 * 1000,

  // Semi-static data - 30 minutes
  REPOSITORY_DETAILS: 30 * 60 * 1000,
  SEARCH_RESULTS: 30 * 60 * 1000,

  // Dynamic data - 10 minutes
  TRENDING: 10 * 60 * 1000,
  OPPORTUNITIES: 10 * 60 * 1000,

  // Frequently changing data - 5 minutes
  HEALTH_METRICS: 5 * 60 * 1000,
  API_STATUS: 5 * 60 * 1000,

  // Real-time data - 1 minute
  RATE_LIMITS: 60 * 1000,
  NOTIFICATIONS: 60 * 1000,
} as const

// Cache priority levels for memory management
export enum CachePriority {
  HIGH = 'high', // Core app functionality
  MEDIUM = 'medium', // User experience enhancement
  LOW = 'low', // Nice-to-have data
}

// Enhanced cache configuration
export interface CacheConfig {
  staleTime: number
  gcTime: number // Renamed from cacheTime in TanStack Query v5
  priority: CachePriority
  retryOnMount: boolean
  refetchOnWindowFocus: boolean
  refetchOnReconnect: boolean
}

// Optimized cache configurations by data type
export const CACHE_CONFIGS: Record<string, CacheConfig> = {
  [CACHE_KEYS.REPOSITORIES]: {
    staleTime: CACHE_DURATIONS.REPOSITORY_METADATA,
    gcTime: CACHE_DURATIONS.REPOSITORY_METADATA * 2,
    priority: CachePriority.HIGH,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },

  [CACHE_KEYS.REPOSITORY_DETAILS]: {
    staleTime: CACHE_DURATIONS.REPOSITORY_DETAILS,
    gcTime: CACHE_DURATIONS.REPOSITORY_DETAILS * 2,
    priority: CachePriority.HIGH,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },

  [CACHE_KEYS.USER_PROFILE]: {
    staleTime: CACHE_DURATIONS.USER_PROFILE,
    gcTime: CACHE_DURATIONS.USER_PROFILE * 3,
    priority: CachePriority.HIGH,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },

  [CACHE_KEYS.SEARCH_RESULTS]: {
    staleTime: CACHE_DURATIONS.SEARCH_RESULTS,
    gcTime: CACHE_DURATIONS.SEARCH_RESULTS * 2,
    priority: CachePriority.MEDIUM,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },

  [CACHE_KEYS.TRENDING]: {
    staleTime: CACHE_DURATIONS.TRENDING,
    gcTime: CACHE_DURATIONS.TRENDING * 2,
    priority: CachePriority.MEDIUM,
    retryOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },

  [CACHE_KEYS.OPPORTUNITIES]: {
    staleTime: CACHE_DURATIONS.OPPORTUNITIES,
    gcTime: CACHE_DURATIONS.OPPORTUNITIES * 2,
    priority: CachePriority.HIGH,
    retryOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },

  [CACHE_KEYS.HEALTH_METRICS]: {
    staleTime: CACHE_DURATIONS.HEALTH_METRICS,
    gcTime: CACHE_DURATIONS.HEALTH_METRICS * 1.5,
    priority: CachePriority.LOW,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },
}

// Advanced cache key generation with normalization
export class CacheKeyManager {
  private static normalizeParams(params: Record<string, any>): string {
    // Sort keys for consistent cache keys
    const sortedKeys = Object.keys(params).sort()
    const normalizedParams = sortedKeys.map(key => {
      const value = params[key]
      // Handle arrays and objects consistently
      if (Array.isArray(value)) {
        return `${key}:[${value.sort().join(',')}]`
      }
      if (typeof value === 'object' && value !== null) {
        return `${key}:${JSON.stringify(value)}`
      }
      return `${key}:${value}`
    })

    return normalizedParams.join('|')
  }

  static generateKey(baseKey: string, params?: Record<string, any>, userId?: string): string {
    const parts = [baseKey]

    if (userId) {
      parts.push(`user:${userId}`)
    }

    if (params && Object.keys(params).length > 0) {
      parts.push(this.normalizeParams(params))
    }

    return parts.join('::')
  }

  static repository(id: string, userId?: string): string {
    return this.generateKey(CACHE_KEYS.REPOSITORY_DETAILS, { id }, userId)
  }

  static repositories(filters?: Record<string, any>, userId?: string): string {
    return this.generateKey(CACHE_KEYS.REPOSITORIES, filters, userId)
  }

  static search(query: string, filters?: Record<string, any>, userId?: string): string {
    return this.generateKey(CACHE_KEYS.SEARCH_RESULTS, { query, ...filters }, userId)
  }

  static opportunities(filters?: Record<string, any>, userId?: string): string {
    return this.generateKey(CACHE_KEYS.OPPORTUNITIES, filters, userId)
  }

  static trending(timeframe?: string, language?: string): string {
    return this.generateKey(CACHE_KEYS.TRENDING, { timeframe, language })
  }
}

// Enhanced cache invalidation strategies
export class CacheInvalidationManager {
  constructor(private queryClient: QueryClient) {}

  // Invalidate related caches when repository data changes
  async invalidateRepositoryData(repositoryId: string): Promise<void> {
    await Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: [CACHE_KEYS.REPOSITORY_DETAILS, repositoryId],
      }),
      this.queryClient.invalidateQueries({
        queryKey: [CACHE_KEYS.REPOSITORIES],
      }),
      this.queryClient.invalidateQueries({
        queryKey: [CACHE_KEYS.SEARCH_RESULTS],
      }),
      this.queryClient.invalidateQueries({
        queryKey: [CACHE_KEYS.OPPORTUNITIES],
      }),
    ])
  }

  // Invalidate user-specific caches on logout
  async invalidateUserData(userId: string): Promise<void> {
    await Promise.all([
      this.queryClient.invalidateQueries({
        predicate: query => {
          const queryKey = query.queryKey as string[]
          return queryKey.some(key => typeof key === 'string' && key.includes(`user:${userId}`))
        },
      }),
      this.queryClient.removeQueries({
        predicate: query => {
          const queryKey = query.queryKey as string[]
          return queryKey.some(key => typeof key === 'string' && key.includes(`user:${userId}`))
        },
      }),
    ])
  }

  // Smart cache cleanup based on priority and memory pressure
  async performSmartCleanup(): Promise<void> {
    const cache = this.queryClient.getQueryCache()
    const queries = cache.getAll()

    // Remove low-priority stale queries first
    const lowPriorityStaleQueries = queries.filter(query => {
      const config = this.getCacheConfigForQuery(query.queryKey as string[])
      return config?.priority === CachePriority.LOW && query.isStale()
    })

    for (const query of lowPriorityStaleQueries) {
      cache.remove(query)
    }

    // If still under memory pressure, remove medium priority stale queries
    if (this.isUnderMemoryPressure()) {
      const mediumPriorityStaleQueries = queries.filter(query => {
        const config = this.getCacheConfigForQuery(query.queryKey as string[])
        return config?.priority === CachePriority.MEDIUM && query.isStale()
      })

      for (const query of mediumPriorityStaleQueries) {
        cache.remove(query)
      }
    }
  }

  private getCacheConfigForQuery(queryKey: string[]): CacheConfig | undefined {
    const baseKey = queryKey[0]
    return CACHE_CONFIGS[baseKey]
  }

  private isUnderMemoryPressure(): boolean {
    // Simple heuristic - in production, could use performance.measureUserAgentSpecificMemory()
    const cache = this.queryClient.getQueryCache()
    const queryCount = cache.getAll().length
    return queryCount > 100 // Arbitrary threshold
  }
}

// Optimized query options factory
export class QueryOptionsFactory {
  static createOptions<T>(
    baseKey: string,
    userId?: string,
    additionalOptions?: Partial<CacheConfig>
  ) {
    const config = CACHE_CONFIGS[baseKey]
    if (!config) {
      throw new Error(`No cache configuration found for key: ${baseKey}`)
    }

    return {
      staleTime: config.staleTime,
      gcTime: config.gcTime,
      retry: false, // Disable automatic retries for API efficiency
      retryOnMount: config.retryOnMount,
      refetchOnWindowFocus: config.refetchOnWindowFocus,
      refetchOnReconnect: config.refetchOnReconnect,
      ...additionalOptions,
    }
  }

  static repository(repositoryId: string, userId?: string) {
    return this.createOptions(CACHE_KEYS.REPOSITORY_DETAILS, userId)
  }

  static repositories(userId?: string) {
    return this.createOptions(CACHE_KEYS.REPOSITORIES, userId)
  }

  static search(userId?: string) {
    return this.createOptions(CACHE_KEYS.SEARCH_RESULTS, userId)
  }

  static opportunities(userId?: string) {
    return this.createOptions(CACHE_KEYS.OPPORTUNITIES, userId)
  }

  static trending() {
    return this.createOptions(CACHE_KEYS.TRENDING)
  }
}

// Background cache warming strategies
export class CacheWarmingService {
  constructor(private queryClient: QueryClient) {}

  // Warm frequently accessed data
  async warmCriticalData(userId?: string): Promise<void> {
    const warmingPromises = []

    // Pre-load trending repositories
    warmingPromises.push(
      this.queryClient.prefetchQuery({
        queryKey: CacheKeyManager.trending('daily').split('::'),
        queryFn: () => this.fetchTrendingRepositories('daily'),
        ...QueryOptionsFactory.trending(),
      })
    )

    // Pre-load user's opportunities if authenticated
    if (userId) {
      warmingPromises.push(
        this.queryClient.prefetchQuery({
          queryKey: CacheKeyManager.opportunities({}, userId).split('::'),
          queryFn: () => this.fetchOpportunities(userId),
          ...QueryOptionsFactory.opportunities(userId),
        })
      )
    }

    await Promise.all(warmingPromises)
  }

  private async fetchTrendingRepositories(timeframe: string) {
    // Implementation would call actual API
    return []
  }

  private async fetchOpportunities(userId: string) {
    // Implementation would call actual API
    return []
  }
}
