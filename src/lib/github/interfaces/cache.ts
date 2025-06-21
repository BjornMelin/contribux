/**
 * Caching interfaces and types
 *
 * This file contains interfaces for caching GitHub API responses,
 * including storage backends, cache entries, and Redis-compatible interfaces.
 */

/**
 * Redis-compatible interface for cache storage backends
 * Allows using Redis, Memcached, or other compatible stores
 */
export interface RedisLikeClient {
  /** Get value by key */
  get(key: string): Promise<string | null>
  /** Set value with optional TTL in milliseconds */
  set(key: string, value: string, px?: number): Promise<string>
  /** Delete key from cache */
  del(key: string): Promise<number>
  quit(): Promise<void>
}

/**
 * Alternative Redis interface for different use cases
 * Uses different method signature for set() with TTL in milliseconds
 */
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlMs: number): Promise<string>
  del(key: string): Promise<number>
  quit(): Promise<void>
}

export interface CacheOptions {
  enabled?: boolean
  ttl?: number
  storage?: 'memory' | 'redis'
  redisUrl?: string
  redis?: RedisLikeClient
  dataloaderEnabled?: boolean
  backgroundRefresh?: boolean
  refreshThreshold?: number
  backgroundRefreshThreshold?: number
}

export interface CacheEntry {
  data: unknown
  etag?: string | undefined
  createdAt: string
  expiresAt?: string | undefined
  ttl?: number | undefined
}

export interface CacheMetrics {
  hits: number
  misses: number
  size: number
  memoryUsage: number
  hitRatio: number
}

export interface CacheStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  del(key: string): Promise<void>
  clear?(): Promise<void>
  keys?(pattern?: string): Promise<string[]>
}

export interface CacheHeaders {
  'cache-control'?: string
  etag?: string
  expires?: string
  'last-modified'?: string
}

export type CacheableData = string | number | boolean | Record<string, unknown> | null
