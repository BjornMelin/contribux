import type { CacheEntry, CacheMetrics, CacheOptions } from '../types'

export interface CacheStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  del(key: string): Promise<void>
  clear?(): Promise<void>
  keys?(pattern?: string): Promise<string[]>
}

export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, px?: number): Promise<string>
  del(key: string): Promise<number>
  quit(): Promise<void>
}

export interface CacheHeaders {
  'cache-control'?: string
  etag?: string
  expires?: string
  'last-modified'?: string
}

export type CacheableData = string | number | boolean | object | null

export class MemoryCache implements CacheStorage {
  private cache = new Map<string, { value: string; expiresAt: number; accessedAt: number }>()
  private metrics: CacheMetrics = { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRatio: 0 }
  private maxSize: number
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
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

  async set(key: string, value: string, ttl = 300000): Promise<void> {
    const now = Date.now()
    const expiresAt = now + ttl

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
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired()
      },
      5 * 60 * 1000
    )
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

  async set(key: string, value: string, ttl: number = 300000): Promise<void> {
    try {
      await this.redis.set(key, value, ttl)
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

export class CacheManager {
  private memoryCache: MemoryCache
  private redisCache?: RedisCache
  public options: CacheOptions & { maxSize?: number }
  private metrics: CacheMetrics = { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRatio: 0 }
  private etagCache = new Map<string, string>()
  private backgroundRefreshActive = new Set<string>()

  constructor(options: CacheOptions & { maxSize?: number }) {
    this.options = { ttl: 300, maxSize: 1000, ...options }
    this.memoryCache = new MemoryCache(this.options.maxSize)

    if (options.storage === 'redis' && options.redis) {
      this.redisCache = new RedisCache(options.redis)
    }
  }

  async get(key: string): Promise<CacheEntry | null> {
    // Try memory cache first
    const memoryResult = await this.memoryCache.get(key)
    if (memoryResult) {
      this.metrics.hits++
      this.updateMetrics()
      return JSON.parse(memoryResult)
    }

    // Try Redis cache if available
    if (this.redisCache) {
      const redisResult = await this.redisCache.get(key)
      if (redisResult) {
        // Store in memory cache for faster access
        await this.memoryCache.set(key, redisResult, (this.options?.ttl || 300) * 1000)
        this.metrics.hits++
        this.updateMetrics()
        return JSON.parse(redisResult)
      }
    }

    this.metrics.misses++
    this.updateMetrics()
    return null
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const value = JSON.stringify(entry)
    const ttl = (this.options.ttl || 300) * 1000

    // Store in memory cache
    await this.memoryCache.set(key, value, ttl)

    // Store in Redis if available
    if (this.redisCache) {
      await this.redisCache.set(key, value, ttl)
    }

    this.updateMetrics()
  }

  async del(key: string): Promise<void> {
    await this.memoryCache.del(key)
    if (this.redisCache) {
      await this.redisCache.del(key)
    }
    this.updateMetrics()
  }

  async clear(): Promise<void> {
    await this.memoryCache.clear()
    this.etagCache.clear()
    this.updateMetrics()
  }

  destroy(): void {
    this.memoryCache.destroy()
    this.etagCache.clear()
    this.backgroundRefreshActive.clear()
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.memoryCache.keys(pattern)
    for (const key of keys) {
      await this.del(key)
    }
  }

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

  getETag(key: string): string | undefined {
    return this.etagCache.get(key)
  }

  setETag(key: string, etag: string): void {
    this.etagCache.set(key, etag)
  }

  shouldRefreshInBackground(entry: CacheEntry): boolean {
    if (!this.options.backgroundRefresh) return false

    const age = Date.now() - new Date(entry.createdAt).getTime()
    const ttl = (entry.ttl || this.options.ttl || 300) * 1000
    const threshold = this.options.refreshThreshold || 0.8

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
    return this.options.ttl || 300
  }

  getMetrics(): CacheMetrics {
    const memoryMetrics = this.memoryCache.getMetrics()
    return {
      hits: this.metrics.hits + memoryMetrics.hits,
      misses: this.metrics.misses + memoryMetrics.misses,
      size: memoryMetrics.size,
      memoryUsage: memoryMetrics.memoryUsage,
      hitRatio:
        this.metrics.hits + this.metrics.misses > 0
          ? this.metrics.hits / (this.metrics.hits + this.metrics.misses)
          : 0,
    }
  }

  private updateMetrics(): void {
    this.metrics.hitRatio =
      this.metrics.hits + this.metrics.misses > 0
        ? this.metrics.hits / (this.metrics.hits + this.metrics.misses)
        : 0
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
    ? new Date(Date.now() + effectiveTtl * 1000).toISOString()
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
