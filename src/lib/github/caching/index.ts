import { CACHE_DEFAULTS, TIME } from '../constants'
import type {
  CacheableData,
  CacheEntry,
  CacheHeaders,
  CacheMetrics,
  CacheOptions,
  CacheStorage,
  RedisLike,
} from '../interfaces/cache'
import { validateCacheEntry, validateCacheOptions } from '../schemas'

// Re-export interfaces for backward compatibility
export type {
  CacheableData,
  CacheEntry,
  CacheHeaders,
  CacheMetrics,
  CacheOptions,
  CacheStorage,
  RedisLike,
} from '../interfaces/cache'

export class MemoryCache implements CacheStorage {
  private cache = new Map<string, { value: string; expiresAt: number; accessedAt: number }>()
  private metrics: CacheMetrics = { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRatio: 0 }
  private maxSize: number
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(maxSize?: number) {
    this.maxSize = maxSize ?? CACHE_DEFAULTS.MAX_SIZE
    // Start periodic cleanup to prevent memory leaks
    this.startCleanupTimer()
  }

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key)

    if (!entry) {
      this.metrics.misses++
      this.updateMetrics()
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.metrics.misses++
      this.updateMetrics()
      return null
    }

    // Update access time for LRU eviction
    entry.accessedAt = Date.now()
    this.metrics.hits++
    this.updateMetrics()
    return entry.value
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const now = Date.now()
    const actualTtl = ttl ?? CACHE_DEFAULTS.TTL_MS
    const expiresAt = now + actualTtl

    // Check if we need to evict items due to size limit
    if (this.cache.size >= this.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, { value, expiresAt, accessedAt: now })
    this.updateMetrics()
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key)
    this.updateMetrics()
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.updateMetrics()
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
  }

  async keys(pattern?: string): Promise<string[]> {
    const keys = Array.from(this.cache.keys())
    if (!pattern) return keys

    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return keys.filter(key => regex.test(key))
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics }
  }

  private updateMetrics(): void {
    this.metrics.size = this.cache.size
    this.metrics.memoryUsage = this.estimateMemoryUsage()
    this.metrics.hitRatio =
      this.metrics.hits + this.metrics.misses > 0
        ? this.metrics.hits / (this.metrics.hits + this.metrics.misses)
        : 0
  }

  private estimateMemoryUsage(): number {
    let usage = 0
    // Use Array.from to avoid downlevelIteration requirement
    for (const [key, entry] of Array.from(this.cache.entries())) {
      usage += key.length * 2 + entry.value.length * 2 + 64 // Rough estimate
    }
    return usage
  }

  private evictLRU(): void {
    // Remove oldest accessed entry
    let oldestKey: string | null = null
    let oldestAccess = Number.MAX_SAFE_INTEGER

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired()
    }, 5 * TIME.MINUTE)
  }

  private cleanupExpired(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key)
    }

    if (expiredKeys.length > 0) {
      this.updateMetrics()
    }
  }
}

export class RedisCache implements CacheStorage {
  constructor(private redis: RedisLike) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key)
    } catch (error) {
      console.warn('Redis get failed:', error)
      return null
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      const actualTtl = ttl ?? CACHE_DEFAULTS.TTL_MS
      await this.redis.set(key, value, actualTtl)
    } catch (error) {
      console.warn('Redis set failed:', error)
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (error) {
      console.warn('Redis del failed:', error)
    }
  }
}

/**
 * Advanced cache manager with multi-tier storage and intelligent refresh strategies
 *
 * The CacheManager provides a sophisticated caching layer for GitHub API responses with:
 * - Multi-tier storage (memory + optional Redis)
 * - ETag-based conditional requests
 * - Background refresh capabilities
 * - Automatic cache invalidation
 * - Pattern-based cache clearing
 * - Comprehensive metrics tracking
 *
 * @example
 * ```typescript
 * // Basic memory cache
 * const cache = new CacheManager({
 *   enabled: true,
 *   storage: 'memory',
 *   ttl: 300, // 5 minutes
 *   maxSize: 1000
 * });
 *
 * // Redis-backed cache with background refresh
 * const redisCache = new CacheManager({
 *   enabled: true,
 *   storage: 'redis',
 *   redis: redisClient,
 *   ttl: 600,
 *   backgroundRefresh: true,
 *   refreshThreshold: 0.75
 * });
 * ```
 */
export class CacheManager {
  private memoryCache: MemoryCache
  private redisCache?: RedisCache
  public options: CacheOptions & { maxSize?: number }
  private etagCache = new Map<string, string>()
  private backgroundRefreshActive = new Set<string>()

  /**
   * Creates a new CacheManager instance with configurable storage backends
   *
   * @param options - Cache configuration options
   * @param options.enabled - Enable/disable caching (default: true)
   * @param options.storage - Storage backend: 'memory' or 'redis' (default: 'memory')
   * @param options.ttl - Time-to-live in seconds (default: 300)
   * @param options.maxSize - Maximum number of cache entries for memory storage
   * @param options.redis - Redis client instance (required when storage='redis')
   * @param options.backgroundRefresh - Enable background cache refresh
   * @param options.refreshThreshold - Threshold for background refresh (0.0-1.0)
   *
   * @example
   * ```typescript
   * const cache = new CacheManager({
   *   enabled: true,
   *   storage: 'memory',
   *   ttl: 300,
   *   maxSize: 500,
   *   backgroundRefresh: true,
   *   refreshThreshold: 0.8
   * });
   * ```
   */
  constructor(options: CacheOptions & { maxSize?: number }) {
    // Validate options using Zod schema
    const validatedOptions = validateCacheOptions(options)
    // Ensure all properties are set correctly for exactOptionalPropertyTypes
    this.options = {
      enabled: validatedOptions.enabled ?? true,
      storage: validatedOptions.storage ?? 'memory',
      ttl: validatedOptions.ttl ?? CACHE_DEFAULTS.TTL_MS / TIME.SECOND,
      maxSize: options.maxSize ?? CACHE_DEFAULTS.MAX_SIZE,
      ...(validatedOptions.redis !== undefined && { redis: validatedOptions.redis }),
      ...(validatedOptions.excludePatterns !== undefined && {
        excludePatterns: validatedOptions.excludePatterns,
      }),
      ...(validatedOptions.includeHeaders !== undefined && {
        includeHeaders: validatedOptions.includeHeaders,
      }),
      ...(validatedOptions.backgroundRefresh !== undefined && {
        backgroundRefresh: validatedOptions.backgroundRefresh,
      }),
      ...(validatedOptions.refreshThreshold !== undefined && {
        refreshThreshold: validatedOptions.refreshThreshold,
      }),
    }
    this.memoryCache = new MemoryCache(this.options.maxSize)

    if (options.storage === 'redis' && options.redis) {
      this.redisCache = new RedisCache(options.redis)
    }
  }

  /**
   * Retrieve a cache entry by key from multi-tier storage
   *
   * This method first checks the memory cache for fast access, then falls back
   * to Redis if available. Found Redis entries are promoted to memory cache.
   *
   * @param key - Cache key to retrieve
   * @returns Cache entry or null if not found
   *
   * @example
   * ```typescript
   * const entry = await cache.get('api-key-123');
   * if (entry) {
   *   console.log('Cache hit:', entry.data);
   * }
   * ```
   */
  async get(key: string): Promise<CacheEntry | null> {
    // Try memory cache first
    const memoryResult = await this.memoryCache.get(key)
    if (memoryResult) {
      return JSON.parse(memoryResult)
    }

    // Try Redis cache if available
    if (this.redisCache) {
      const redisResult = await this.redisCache.get(key)
      if (redisResult) {
        // Store in memory cache for faster access
        const ttl = (this.options?.ttl || CACHE_DEFAULTS.TTL_MS / TIME.SECOND) * TIME.SECOND
        await this.memoryCache.set(key, redisResult, ttl)
        return JSON.parse(redisResult)
      }
    }

    return null
  }

  /**
   * Store a cache entry in all configured storage backends
   *
   * @param key - Cache key for the entry
   * @param entry - Cache entry data with metadata
   *
   * @example
   * ```typescript
   * await cache.set('api-key-123', {
   *   data: { name: 'example' },
   *   createdAt: new Date().toISOString(),
   *   ttl: 300
   * });
   * ```
   */
  async set(key: string, entry: CacheEntry): Promise<void> {
    // Validate entry before caching
    const validatedEntry = validateCacheEntry(entry)
    const value = JSON.stringify(validatedEntry)
    const ttl = (this.options.ttl || CACHE_DEFAULTS.TTL_MS / TIME.SECOND) * TIME.SECOND

    // Store in memory cache
    await this.memoryCache.set(key, value, ttl)

    // Store in Redis if available
    if (this.redisCache) {
      await this.redisCache.set(key, value, ttl)
    }
  }

  /**
   * Delete a cache entry from all storage backends
   *
   * @param key - Cache key to delete
   *
   * @example
   * ```typescript
   * await cache.del('api-key-123');
   * ```
   */
  async del(key: string): Promise<void> {
    await this.memoryCache.del(key)
    if (this.redisCache) {
      await this.redisCache.del(key)
    }
  }

  /**
   * Clear all cache entries and associated metadata
   *
   * @example
   * ```typescript
   * await cache.clear(); // All cache data is now cleared
   * ```
   */
  async clear(): Promise<void> {
    await this.memoryCache.clear()
    this.etagCache.clear()
  }

  /**
   * Cleanup resources and clear all caches
   *
   * This method should be called when shutting down to properly cleanup
   * timers and release memory.
   *
   * @example
   * ```typescript
   * cache.destroy(); // Cleanup on application shutdown
   * ```
   */
  destroy(): void {
    this.memoryCache.destroy()
    this.etagCache.clear()
    this.backgroundRefreshActive.clear()
  }

  /**
   * Invalidate cache entries matching a pattern
   *
   * @param pattern - Glob pattern to match against cache keys (supports wildcards)
   *
   * @example
   * ```typescript
   * // Invalidate all repository-related cache entries
   * await cache.invalidatePattern('*repos*');
   *
   * // Invalidate specific organization's data
   * await cache.invalidatePattern('*facebook/*');
   * ```
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.memoryCache.keys(pattern)
    for (const key of keys) {
      await this.del(key)
    }
  }

  /**
   * Generate a unique cache key for API requests
   *
   * @param method - HTTP method
   * @param url - API endpoint URL
   * @param params - Request parameters
   * @param authContext - Authentication context for key uniqueness
   * @returns Unique cache key
   *
   * @example
   * ```typescript
   * const key = cache.generateCacheKey('GET', '/repos/owner/repo', { per_page: 100 }, 'user123');
   * // Result: "gh:GET:/repos/owner/repo:hash:user123"
   * ```
   */
  generateCacheKey(
    method: string,
    url: string,
    params: Record<string, unknown>,
    authContext?: string
  ): string {
    const paramString = JSON.stringify(params)
    const authPart = authContext ? `:${authContext}` : ''
    return `gh:${method}:${url}:${this.hashString(paramString)}${authPart}`
  }

  /**
   * Get ETag value for a cache key
   *
   * @param key - Cache key
   * @returns ETag value or undefined if not found
   */
  getETag(key: string): string | undefined {
    return this.etagCache.get(key)
  }

  /**
   * Store ETag value for a cache key
   *
   * @param key - Cache key
   * @param etag - ETag value from HTTP response
   */
  setETag(key: string, etag: string): void {
    this.etagCache.set(key, etag)
  }

  shouldRefreshInBackground(entry: CacheEntry): boolean {
    if (!this.options.backgroundRefresh) return false

    const age = Date.now() - new Date(entry.createdAt).getTime()
    const ttl = (entry.ttl || this.options.ttl || CACHE_DEFAULTS.TTL_MS / TIME.SECOND) * TIME.SECOND
    const threshold = this.options.refreshThreshold || CACHE_DEFAULTS.BACKGROUND_REFRESH_THRESHOLD

    return age >= ttl * threshold
  }

  markRefreshActive(key: string): void {
    this.backgroundRefreshActive.add(key)
  }

  unmarkRefreshActive(key: string): void {
    this.backgroundRefreshActive.delete(key)
  }

  isRefreshActive(key: string): boolean {
    return this.backgroundRefreshActive.has(key)
  }

  extractTTLFromHeaders(headers: CacheHeaders): number {
    const cacheControl = headers['cache-control']
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
      if (maxAgeMatch?.[1]) {
        return Number.parseInt(maxAgeMatch[1], 10)
      }
    }
    return this.options.ttl || CACHE_DEFAULTS.TTL_MS / TIME.SECOND
  }

  getMetrics(): CacheMetrics {
    return this.memoryCache.getMetrics()
  }

  private hashString(str: string): string {
    // DJB2 hash algorithm - better distribution than simple hash
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i)
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }
}

export function createCacheEntry(
  data: CacheableData,
  etag?: string,
  headers?: CacheHeaders,
  ttl?: number
): CacheEntry {
  const now = new Date().toISOString()
  const effectiveTtl =
    ttl || (headers ? extractTTLFromCacheControl(headers['cache-control']) : undefined)
  const expiresAt = effectiveTtl
    ? new Date(Date.now() + effectiveTtl * TIME.SECOND).toISOString()
    : undefined

  return {
    data,
    etag,
    createdAt: now,
    expiresAt,
    ttl: effectiveTtl,
  }
}

function extractTTLFromCacheControl(cacheControl?: string): number | undefined {
  if (!cacheControl) return undefined

  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
  return maxAgeMatch ? Number.parseInt(maxAgeMatch[1] || '0', 10) : undefined
}
