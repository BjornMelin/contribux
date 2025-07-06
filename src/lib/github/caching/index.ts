/**
 * GitHub API Caching System
 * Implements consistent cache key generation and pattern matching
 */

import type { CacheOptions } from '@/lib/cache/advanced-cache'

export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number
  etag?: string
}

export interface CacheStorageAdapter {
  get<T = unknown>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl: number): Promise<boolean>
  delete(key: string): Promise<boolean>
  keys(pattern?: string): Promise<string[]>
  clear(): Promise<void>
}

export class MemoryCacheAdapter implements CacheStorageAdapter {
  private cache = new Map<string, CacheEntry>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check expiration
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  async set<T>(key: string, value: T, ttl: number): Promise<boolean> {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
    })
    return true
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key)
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys())

    if (!pattern) {
      return allKeys
    }

    // Convert pattern to regex - escape special chars except '*'
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*') // Replace * with .*

    const regex = new RegExp(`^${regexPattern}$`)
    return allKeys.filter(key => regex.test(key))
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }
}

export class GitHubCacheManager {
  private storage: CacheStorageAdapter

  constructor(storage?: CacheStorageAdapter) {
    this.storage = storage || new MemoryCacheAdapter()
  }

  /**
   * Sort object keys recursively to ensure consistent cache keys
   */
  private sortObjectKeys(obj: unknown): unknown {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item))
    }

    // Handle objects
    if (typeof obj === 'object') {
      const sortedObj: Record<string, unknown> = {}
      const keys = Object.keys(obj).sort()

      for (const key of keys) {
        sortedObj[key] = this.sortObjectKeys(obj[key])
      }

      return sortedObj
    }

    // Return primitives as-is
    return obj
  }

  /**
   * Generate a consistent cache key from method, path, and params
   */
  generateCacheKey(method: string, path: string, params?: Record<string, unknown>): string {
    const parts = [`github:${method}:${path}`]

    if (params && Object.keys(params).length > 0) {
      // Sort params object to ensure consistent keys
      const sortedParams = this.sortObjectKeys(params)
      const paramsString = JSON.stringify(sortedParams)
      parts.push(paramsString)
    }

    // Use hash for long keys
    const fullKey = parts.join(':')
    if (fullKey.length > 200) {
      const hash = this.hashString(fullKey)
      return `${parts[0]}:${hash}`
    }

    return fullKey
  }

  /**
   * Generate a stable hash from a string
   */
  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      // Use unsigned right shift to ensure positive 32-bit integer
      hash = hash >>> 0
    }
    return hash.toString(36)
  }

  /**
   * Get value from cache
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    return this.storage.get<T>(key)
  }

  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: { ttl?: number; etag?: string } = {}
  ): Promise<boolean> {
    const ttl = options.ttl || 300 // Default 5 minutes
    return this.storage.set(key, value, ttl)
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key)
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.storage.keys(pattern)
    let deleted = 0

    for (const key of keys) {
      if (await this.storage.delete(key)) {
        deleted++
      }
    }

    return deleted
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    return this.storage.clear()
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    return this.storage.keys(pattern)
  }

  /**
   * Create a cache key for repository data
   */
  repositoryKey(owner: string, repo: string, resource?: string): string {
    const base = `github:repos:${owner}:${repo}`
    return resource ? `${base}:${resource}` : base
  }

  /**
   * Create a cache key for user data
   */
  userKey(username: string, resource?: string): string {
    const base = `github:users:${username}`
    return resource ? `${base}:${resource}` : base
  }

  /**
   * Create a cache key for search results
   */
  searchKey(query: string, params?: Record<string, unknown>): string {
    return this.generateCacheKey('search', 'repositories', { q: query, ...params })
  }
}

// Export a singleton instance
export const githubCache = new GitHubCacheManager()

// Cache decorator for methods
export function cached(options: CacheOptions = {}) {
  return (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      // Generate cache key from method name and arguments
      const key = `method:${_propertyKey}:${JSON.stringify(args)}`

      // Try to get from cache
      const cached = await githubCache.get(key)
      if (cached !== null) {
        return cached
      }

      // Execute original method
      const result = await originalMethod.apply(this, args)

      // Cache the result
      await githubCache.set(key, result, options)

      return result
    }

    return descriptor
  }
}
