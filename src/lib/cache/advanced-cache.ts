/**
 * Advanced Multi-Layer Caching System
 * Implements memory, Redis, and edge caching with intelligent cache strategies
 */

import Redis from 'ioredis'
import { z } from 'zod'

// Cache configuration schema
const cacheConfigSchema = z.object({
  redis: z.object({
    url: z.string().optional(),
    enabled: z.boolean().default(true),
    maxRetryTime: z.number().default(30000),
    retryDelayOnFailover: z.number().default(100),
    maxRetriesPerRequest: z.number().default(3),
  }),
  memory: z.object({
    enabled: z.boolean().default(true),
    maxSize: z.number().default(100), // MB
    ttl: z.number().default(300), // 5 minutes
  }),
  edge: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().default(3600), // 1 hour
  }),
})

type CacheConfig = z.infer<typeof cacheConfigSchema>

interface CacheItem<T = unknown> {
  data: T
  timestamp: number
  ttl: number
  size?: number
}

interface CacheMetrics {
  hits: number
  misses: number
  sets: number
  deletes: number
  errors: number
  memoryUsage: number
  redisConnected: boolean
}

interface CacheOptions {
  ttl?: number
  strategy?: 'memory-first' | 'redis-first' | 'memory-only' | 'redis-only'
  compress?: boolean
  serialize?: boolean
}

class AdvancedCache {
  private redis: Redis | null = null
  private memoryCache = new Map<string, CacheItem>()
  private config: CacheConfig
  private metrics: CacheMetrics
  private memoryUsage = 0
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = cacheConfigSchema.parse(config)
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      memoryUsage: 0,
      redisConnected: false,
    }

    this.initializeRedis()
    this.initializeMemoryCleanup()
  }

  /**
   * Initialize Redis connection with error handling
   */
  private initializeRedis(): void {
    if (!this.config.redis.enabled || !this.config.redis.url) {
      return
    }

    try {
      this.redis = new Redis(this.config.redis.url, {
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        retryDelayOnFailover: this.config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        lazyConnect: true,
        reconnectOnError: err => {
          console.warn('Redis reconnecting on error:', err.message)
          return true
        },
      })

      this.redis.on('connect', () => {
        this.metrics.redisConnected = true
        console.log('✅ Redis cache connected')
      })

      this.redis.on('error', err => {
        this.metrics.redisConnected = false
        this.metrics.errors++
        console.warn('Redis cache error:', err.message)
      })

      this.redis.on('close', () => {
        this.metrics.redisConnected = false
        console.warn('Redis cache disconnected')
      })
    } catch (error) {
      console.error('Failed to initialize Redis:', error)
      this.redis = null
    }
  }

  /**
   * Initialize memory cache cleanup
   */
  private initializeMemoryCleanup(): void {
    if (!this.config.memory.enabled) return

    this.cleanupInterval = setInterval(() => {
      this.cleanupMemoryCache()
    }, 60000) // Cleanup every minute
  }

  /**
   * Clean up expired memory cache entries
   */
  private cleanupMemoryCache(): void {
    const now = Date.now()
    let freed = 0

    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > item.ttl * 1000) {
        freed += item.size || 0
        this.memoryCache.delete(key)
      }
    }

    this.memoryUsage -= freed
    this.metrics.memoryUsage = this.memoryUsage

    // Force cleanup if memory usage is too high
    if (this.memoryUsage > this.config.memory.maxSize * 1024 * 1024) {
      this.forcedMemoryCleanup()
    }
  }

  /**
   * Force cleanup of memory cache when limit exceeded
   */
  private forcedMemoryCleanup(): void {
    const entries = Array.from(this.memoryCache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    )

    // Remove oldest 25% of entries
    const toRemove = Math.floor(entries.length * 0.25)
    for (let i = 0; i < toRemove; i++) {
      const [key, item] = entries[i]
      this.memoryUsage -= item.size || 0
      this.memoryCache.delete(key)
    }

    this.metrics.memoryUsage = this.memoryUsage
  }

  /**
   * Calculate size of data for memory management
   */
  private calculateSize(data: unknown): number {
    return JSON.stringify(data).length * 2 // Rough estimate (UTF-16)
  }

  /**
   * Serialize data for storage
   */
  private serialize(data: unknown): string {
    try {
      return JSON.stringify(data)
    } catch (error) {
      throw new Error(`Failed to serialize data: ${error}`)
    }
  }

  /**
   * Deserialize data from storage
   */
  private deserialize<T>(data: string): T {
    try {
      return JSON.parse(data) as T
    } catch (error) {
      throw new Error(`Failed to deserialize data: ${error}`)
    }
  }

  /**
   * Get value from cache with intelligent strategy
   */
  async get<T = unknown>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const strategy = options.strategy || 'memory-first'

    try {
      // Memory-first strategy
      if (strategy === 'memory-first' || strategy === 'memory-only') {
        const memoryResult = this.getFromMemory<T>(key)
        if (memoryResult !== null) {
          this.metrics.hits++
          return memoryResult
        }

        if (strategy === 'memory-only') {
          this.metrics.misses++
          return null
        }
      }

      // Redis fallback or redis-first
      if (this.redis && this.metrics.redisConnected && strategy !== 'memory-only') {
        const redisResult = await this.getFromRedis<T>(key)
        if (redisResult !== null) {
          this.metrics.hits++

          // Cache in memory for faster future access
          if (strategy === 'redis-first' && this.config.memory.enabled) {
            this.setInMemory(key, redisResult, options.ttl || this.config.memory.ttl)
          }

          return redisResult
        }
      }

      this.metrics.misses++
      return null
    } catch (error) {
      this.metrics.errors++
      console.error(`Cache get error for key ${key}:`, error)
      return null
    }
  }

  /**
   * Set value in cache with intelligent strategy
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    const strategy = options.strategy || 'memory-first'
    const ttl = options.ttl || this.config.memory.ttl
    let success = false

    try {
      // Set in memory cache
      if (this.config.memory.enabled && strategy !== 'redis-only') {
        success = this.setInMemory(key, value, ttl) || success
      }

      // Set in Redis cache
      if (this.redis && this.metrics.redisConnected && strategy !== 'memory-only') {
        success = (await this.setInRedis(key, value, ttl)) || success
      }

      if (success) {
        this.metrics.sets++
      }

      return success
    } catch (error) {
      this.metrics.errors++
      console.error(`Cache set error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Get from memory cache
   */
  private getFromMemory<T>(key: string): T | null {
    if (!this.config.memory.enabled) return null

    const item = this.memoryCache.get(key)
    if (!item) return null

    // Check expiration
    if (Date.now() - item.timestamp > item.ttl * 1000) {
      this.memoryCache.delete(key)
      this.memoryUsage -= item.size || 0
      return null
    }

    return item.data as T
  }

  /**
   * Set in memory cache
   */
  private setInMemory<T>(key: string, value: T, ttl: number): boolean {
    if (!this.config.memory.enabled) return false

    const size = this.calculateSize(value)
    const maxSize = this.config.memory.maxSize * 1024 * 1024

    // Check if adding this item would exceed memory limit
    if (this.memoryUsage + size > maxSize) {
      this.forcedMemoryCleanup()

      // If still too large after cleanup, skip caching
      if (this.memoryUsage + size > maxSize) {
        return false
      }
    }

    // Remove existing item if present
    const existing = this.memoryCache.get(key)
    if (existing) {
      this.memoryUsage -= existing.size || 0
    }

    // Add new item
    this.memoryCache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
      size,
    })

    this.memoryUsage += size
    this.metrics.memoryUsage = this.memoryUsage

    return true
  }

  /**
   * Get from Redis cache
   */
  private async getFromRedis<T>(key: string): Promise<T | null> {
    if (!this.redis || !this.metrics.redisConnected) return null

    try {
      const result = await this.redis.get(key)
      if (!result) return null

      return this.deserialize<T>(result)
    } catch (error) {
      console.error('Redis get error:', error)
      return null
    }
  }

  /**
   * Set in Redis cache
   */
  private async setInRedis<T>(key: string, value: T, ttl: number): Promise<boolean> {
    if (!this.redis || !this.metrics.redisConnected) return false

    try {
      const serialized = this.serialize(value)
      const result = await this.redis.setex(key, ttl, serialized)
      return result === 'OK'
    } catch (error) {
      console.error('Redis set error:', error)
      return false
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<boolean> {
    let success = false

    try {
      // Delete from memory
      if (this.config.memory.enabled) {
        const item = this.memoryCache.get(key)
        if (item) {
          this.memoryUsage -= item.size || 0
          this.memoryCache.delete(key)
          success = true
        }
      }

      // Delete from Redis
      if (this.redis && this.metrics.redisConnected) {
        const result = await this.redis.del(key)
        success = result > 0 || success
      }

      if (success) {
        this.metrics.deletes++
      }

      return success
    } catch (error) {
      this.metrics.errors++
      console.error(`Cache delete error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<void> {
    try {
      // Clear memory cache
      if (this.config.memory.enabled) {
        this.memoryCache.clear()
        this.memoryUsage = 0
        this.metrics.memoryUsage = 0
      }

      // Clear Redis cache
      if (this.redis && this.metrics.redisConnected) {
        await this.redis.flushall()
      }
    } catch (error) {
      this.metrics.errors++
      console.error('Cache clear error:', error)
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics }
  }

  /**
   * Get cache health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: {
      memory: { enabled: boolean; usage: number; limit: number }
      redis: { enabled: boolean; connected: boolean }
      errorRate: number
    }
  } {
    const totalOps = this.metrics.hits + this.metrics.misses + this.metrics.sets
    const errorRate = totalOps > 0 ? this.metrics.errors / totalOps : 0

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (errorRate > 0.1) {
      status = 'unhealthy'
    } else if (errorRate > 0.05 || (!this.metrics.redisConnected && this.config.redis.enabled)) {
      status = 'degraded'
    }

    return {
      status,
      details: {
        memory: {
          enabled: this.config.memory.enabled,
          usage: this.memoryUsage,
          limit: this.config.memory.maxSize * 1024 * 1024,
        },
        redis: {
          enabled: this.config.redis.enabled,
          connected: this.metrics.redisConnected,
        },
        errorRate,
      },
    }
  }

  /**
   * Shutdown cache and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }

      // Close Redis connection
      if (this.redis) {
        await this.redis.quit()
        this.redis = null
      }

      // Clear memory cache
      this.memoryCache.clear()
      this.memoryUsage = 0
    } catch (error) {
      console.error('Cache shutdown error:', error)
    }
  }
}

// Global cache instance
let globalCache: AdvancedCache | null = null

/**
 * Get global cache instance
 */
export function getCache(): AdvancedCache {
  if (!globalCache) {
    globalCache = new AdvancedCache({
      redis: {
        url: process.env.REDIS_URL,
        enabled: !!process.env.REDIS_URL,
      },
      memory: {
        enabled: true,
        maxSize: Number.parseInt(process.env.CACHE_MEMORY_SIZE || '100'),
        ttl: Number.parseInt(process.env.CACHE_DEFAULT_TTL || '300'),
      },
      edge: {
        enabled: process.env.NODE_ENV === 'production',
        ttl: Number.parseInt(process.env.CACHE_EDGE_TTL || '3600'),
      },
    })
  }
  return globalCache
}

/**
 * Cache decorator for function results
 */
export function cached<T extends (...args: unknown[]) => Promise<unknown>>(
  keyGenerator: (...args: Parameters<T>) => string,
  options: CacheOptions = {}
) {
  return (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: Parameters<T>) {
      const cache = getCache()
      const key = keyGenerator(...args)

      // Try to get from cache
      const cached = await cache.get(key, options)
      if (cached !== null) {
        return cached
      }

      // Execute original method
      const result = await originalMethod.apply(this, args)

      // Cache the result
      await cache.set(key, result, options)

      return result
    }

    return descriptor
  }
}

export { AdvancedCache, type CacheOptions, type CacheMetrics }
