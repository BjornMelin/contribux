/**
 * Cache Utilities
 * Pure functions for cache operations and metrics
 */

export interface CacheTierMetrics {
  hits: number
  misses: number
  size?: number
  evictions?: number
  errors?: number
  hitRate?: number
}

export interface PerformanceMetrics {
  operations: number[]
  maxOperations: number
  averageGetTime?: number
  averageSetTime?: number
  getOperations?: number[]
  setOperations?: number[]
}

export interface CacheMetrics {
  memory: CacheTierMetrics
  redis: CacheTierMetrics
  performance: PerformanceMetrics
  combined: {
    hitRate: number
    totalHits: number
    totalMisses: number
  }
}

/**
 * Calculate cache hit rate from metrics
 */
export function calculateHitRate(hits: number, misses: number): number {
  const total = hits + misses
  return total > 0 ? hits / total : 0
}

/**
 * Calculate combined hit rate from multiple cache tiers
 */
export function calculateCombinedHitRate(
  memory: CacheTierMetrics,
  redis: CacheTierMetrics
): number {
  const totalHits = memory.hits + redis.hits
  const totalRequests = memory.hits + memory.misses + redis.hits + redis.misses
  return totalRequests > 0 ? totalHits / totalRequests : 0
}

/**
 * Calculate average operation time from performance metrics
 */
export function calculateAverageTime(operations: number[]): number {
  if (operations.length === 0) return 0
  return operations.reduce((sum, time) => sum + time, 0) / operations.length
}

/**
 * Record operation time and maintain rolling window
 */
export function recordOperationTime(metrics: PerformanceMetrics, time: number): PerformanceMetrics {
  const newOperations = [...metrics.operations, time]

  // Keep only the last maxOperations entries
  if (newOperations.length > metrics.maxOperations) {
    newOperations.shift()
  }

  return {
    operations: newOperations,
    maxOperations: metrics.maxOperations,
  }
}

/**
 * Generate cache key from components
 */
export function generateCacheKey(
  components: string[],
  options: {
    prefix?: string
    separator?: string
    version?: string
  } = {}
): string {
  const { prefix = 'api', separator = ':', version = 'v1' } = options

  return [prefix, version, ...components].join(separator)
}

/**
 * Validate cache key components
 */
export function validateCacheKey(components: string[]): boolean {
  return components.every(
    component => typeof component === 'string' && component.length > 0 && !component.includes(' ')
  )
}

/**
 * Create cache options with defaults
 */
export function createCacheOptions(
  options: { memoryTtl?: number; redisTtl?: number; skipCache?: boolean } = {}
): {
  memoryTtl: number
  redisTtl: number
  skipCache: boolean
} {
  return {
    memoryTtl: options.memoryTtl ?? 5 * 60 * 1000, // 5 minutes
    redisTtl: options.redisTtl ?? 30 * 60, // 30 minutes
    skipCache: options.skipCache ?? false,
  }
}

/**
 * Determine if a cache entry should be compressed
 */
export function shouldCompress(data: string, threshold = 1024): boolean {
  return data.length > threshold
}

/**
 * Create cache statistics summary
 */
export function createCacheStats(
  memory: CacheTierMetrics,
  redis: CacheTierMetrics,
  performance: { getOperations: number[]; setOperations: number[] }
): CacheMetrics {
  return {
    memory: {
      ...memory,
      hitRate: calculateHitRate(memory.hits, memory.misses),
    },
    redis: {
      ...redis,
      hitRate: calculateHitRate(redis.hits, redis.misses),
    },
    performance: {
      operations: [],
      maxOperations: 100,
      averageGetTime: calculateAverageTime(performance.getOperations),
      averageSetTime: calculateAverageTime(performance.setOperations),
      getOperations: performance.getOperations,
      setOperations: performance.setOperations,
    },
    combined: {
      hitRate: calculateCombinedHitRate(memory, redis),
      totalHits: memory.hits + redis.hits,
      totalMisses: memory.misses + redis.misses,
    },
  }
}
