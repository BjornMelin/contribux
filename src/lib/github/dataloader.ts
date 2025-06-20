/**
 * Modern DataLoader implementation for GitHub API batching and caching
 *
 * Based on Facebook's DataLoader pattern with TypeScript strict mode compliance
 * and 2025 best practices for efficient GraphQL batching.
 *
 * Key features:
 * - Strict TypeScript typing with proper error handling
 * - Configurable batching with size limits and timing control
 * - Memory-safe caching with per-request isolation
 * - GitHub-specific repository batching with rate limit awareness
 * - Proper error propagation and partial failure handling
 *
 * @see https://github.com/graphql/dataloader
 */

import type { CacheManager } from './caching'
import type { GitHubGraphQLClient } from './types'

// Core interfaces for repository data loading
export interface RepositoryKey {
  readonly owner: string
  readonly repo: string
}

export interface RepositoryData {
  readonly name: string
  readonly owner: {
    readonly login: string
  }
  readonly description?: string | null
  readonly stargazerCount?: number
  readonly forkCount?: number
  readonly createdAt?: string
  readonly updatedAt?: string
  readonly isPrivate?: boolean
  readonly defaultBranchRef?: {
    readonly name: string
  } | null
  readonly url?: string
}

// Configuration options for DataLoader instances
export interface DataLoaderOptions<K = unknown, V = unknown> {
  readonly cache?: boolean
  readonly maxBatchSize?: number
  readonly batchScheduleFn?: (callback: () => void) => void
  readonly cacheMap?: Map<string, Promise<V>>
  readonly cacheKeyFn?: (key: K) => string
}

// Internal batch item for promise resolution
interface BatchItem<K, V> {
  readonly key: K
  readonly resolve: (value: V) => void
  readonly reject: (error: Error) => void
}

/**
 * Modern DataLoader implementation with strict TypeScript compliance
 *
 * This implementation follows the Facebook DataLoader pattern but with
 * improved TypeScript support, better error handling, and 2025 best practices.
 */
export class DataLoader<K, V> {
  private readonly batchLoadFn: (keys: readonly K[]) => Promise<readonly (V | Error)[]>
  private readonly shouldCache: boolean
  private readonly cacheKeyFn: (key: K) => string
  private readonly cacheMap: Map<string, Promise<V>>
  private readonly maxBatchSize: number
  private readonly batchScheduleFn: (callback: () => void) => void

  private batch: BatchItem<K, V>[] = []
  private batchScheduled = false

  constructor(
    batchLoadFn: (keys: readonly K[]) => Promise<readonly (V | Error)[]>,
    options: DataLoaderOptions<K, V> = {}
  ) {
    // Validate batch function
    if (typeof batchLoadFn !== 'function') {
      throw new TypeError('DataLoader must be constructed with a batch loading function')
    }

    this.batchLoadFn = batchLoadFn
    this.shouldCache = options.cache !== false
    this.cacheKeyFn = options.cacheKeyFn ?? ((key: K) => JSON.stringify(key))
    this.cacheMap = options.cacheMap ?? new Map<string, Promise<V>>()
    this.maxBatchSize = Math.max(1, options.maxBatchSize ?? Number.POSITIVE_INFINITY)
    this.batchScheduleFn = options.batchScheduleFn ?? (callback => process.nextTick(callback))
  }

  /**
   * Load a single value by key with batching and caching
   */
  async load(key: K): Promise<V> {
    if (key === null || key === undefined) {
      throw new TypeError('DataLoader.load() requires a key')
    }

    // Check cache first if enabled
    if (this.shouldCache) {
      const cacheKey = this.getCacheKey(key)
      const cachedPromise = this.cacheMap.get(cacheKey)
      if (cachedPromise !== undefined) {
        return cachedPromise
      }
    }

    // Create a new promise for this key
    const promise = new Promise<V>((resolve, reject) => {
      this.batch.push({ key, resolve, reject })

      // Schedule batch execution if not already scheduled
      if (this.batch.length >= this.maxBatchSize) {
        // Execute immediately if batch is full
        this.dispatchBatch()
      } else if (!this.batchScheduled) {
        this.batchScheduled = true
        this.batchScheduleFn(() => {
          this.batchScheduled = false
          this.dispatchBatch()
        })
      }
    })

    // Cache the promise if caching is enabled
    if (this.shouldCache) {
      const cacheKey = this.getCacheKey(key)
      this.cacheMap.set(cacheKey, promise)
    }

    return promise
  }

  /**
   * Load multiple values by keys, returning results or errors
   */
  async loadMany(keys: readonly K[]): Promise<readonly (V | Error)[]> {
    if (!Array.isArray(keys)) {
      throw new TypeError('DataLoader.loadMany() requires an array of keys')
    }

    return Promise.all(
      keys.map(async key => {
        try {
          return await this.load(key)
        } catch (error) {
          return error instanceof Error ? error : new Error(String(error))
        }
      })
    )
  }

  /**
   * Clear a single key from the cache
   */
  clear(key: K): this {
    if (this.shouldCache) {
      const cacheKey = this.getCacheKey(key)
      this.cacheMap.delete(cacheKey)
    }
    return this
  }

  /**
   * Clear all keys from the cache
   */
  clearAll(): this {
    if (this.shouldCache) {
      this.cacheMap.clear()
    }
    return this
  }

  /**
   * Prime the cache with a value for a given key
   */
  prime(key: K, value: V | Promise<V>): this {
    if (this.shouldCache) {
      const cacheKey = this.getCacheKey(key)
      this.cacheMap.set(cacheKey, Promise.resolve(value))
    }
    return this
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheMetrics(): { size: number; keys: readonly string[] } {
    return {
      size: this.cacheMap.size,
      keys: Array.from(this.cacheMap.keys()),
    }
  }

  /**
   * Generate a cache key for the given key
   */
  private getCacheKey(key: K): string {
    try {
      return this.cacheKeyFn(key)
    } catch (error) {
      throw new TypeError(`DataLoader cacheKeyFn failed: ${String(error)}`)
    }
  }

  /**
   * Execute the current batch of requests
   */
  private async dispatchBatch(): Promise<void> {
    const currentBatch = this.batch.splice(0, this.maxBatchSize)

    if (currentBatch.length === 0) {
      return
    }

    const keys = currentBatch.map(item => item.key)

    try {
      const values = await this.batchLoadFn(keys)

      // Validate that the batch function returned the correct number of results
      if (!Array.isArray(values) || values.length !== keys.length) {
        throw new Error(
          `DataLoader batch function must return an array of the same length as the input array.\n` +
            `Expected: ${keys.length}, received: ${Array.isArray(values) ? values.length : typeof values}`
        )
      }

      // Resolve each promise with its corresponding result
      for (let i = 0; i < currentBatch.length; i++) {
        const batchItem = currentBatch[i]
        const value = values[i]

        if (batchItem === undefined) continue

        if (value instanceof Error) {
          batchItem.reject(value)
        } else if (value !== undefined) {
          // Cache the resolved value if caching is enabled
          if (this.shouldCache) {
            const cacheKey = this.getCacheKey(batchItem.key)
            this.cacheMap.set(cacheKey, Promise.resolve(value))
          }
          batchItem.resolve(value)
        } else {
          batchItem.reject(new Error('DataLoader batch function returned undefined'))
        }
      }
    } catch (error) {
      // If the batch function fails, reject all pending items
      const errorToReject = error instanceof Error ? error : new Error(String(error))
      for (const batchItem of currentBatch) {
        batchItem.reject(errorToReject)
      }
    }

    // Execute remaining items if any
    if (this.batch.length > 0) {
      process.nextTick(() => this.dispatchBatch())
    }
  }
}

/**
 * Create a DataLoader for GitHub repository data with optimized batching
 *
 * This function creates a DataLoader specifically designed for GitHub's GraphQL API
 * with proper error handling, rate limit awareness, and caching integration.
 */
export function createRepositoryDataLoader(
  graphqlClient: GitHubGraphQLClient,
  cacheManager?: CacheManager
): DataLoader<RepositoryKey, RepositoryData> {
  const batchLoadFn = async (
    keys: readonly RepositoryKey[]
  ): Promise<readonly (RepositoryData | Error)[]> => {
    if (keys.length === 0) {
      return []
    }

    try {
      // Build GraphQL query with aliases for each repository
      const queryFragments = keys.map((key, index) => {
        // Sanitize the owner and repo names for GraphQL
        const sanitizedOwner = key.owner.replace(/[^a-zA-Z0-9_-]/g, '')
        const sanitizedRepo = key.repo.replace(/[^a-zA-Z0-9_-]/g, '')

        return `repo${index}: repository(owner: "${sanitizedOwner}", name: "${sanitizedRepo}") {
          name
          owner {
            login
          }
          description
          stargazerCount
          forkCount
          createdAt
          updatedAt
          isPrivate
          url
          defaultBranchRef {
            name
          }
        }`
      })

      const query = `
        query BatchRepositoryLoader {
          ${queryFragments.join('\n')}
          rateLimit {
            limit
            remaining
            resetAt
            cost
          }
        }
      `

      const response = await graphqlClient(query)
      const typedResponse = response as {
        data?: Record<string, RepositoryData | null>
        errors?: Array<{ message: string; path?: string[] }>
      }

      // Handle GraphQL errors with proper error mapping
      if (typedResponse.errors && typedResponse.errors.length > 0) {
        const errorMap = new Map<string, string>()

        for (const error of typedResponse.errors) {
          if (error.path && error.path.length > 0) {
            const fieldName = error.path[0]
            if (typeof fieldName === 'string') {
              errorMap.set(fieldName, error.message)
            }
          }
        }

        // Map results back to the correct order, handling both data and errors
        return keys.map((key, index) => {
          const alias = `repo${index}`
          const errorMessage = errorMap.get(alias)

          if (errorMessage) {
            return new Error(`GitHub API error for ${key.owner}/${key.repo}: ${errorMessage}`)
          }

          const repoData = typedResponse.data?.[alias]
          if (repoData) {
            // Cache individual repository data if cache manager is available
            if (cacheManager) {
              const cacheKey = cacheManager.generateCacheKey(
                'GET',
                `/repos/${key.owner}/${key.repo}`,
                {}
              )
              void cacheManager.set(cacheKey, {
                data: repoData,
                createdAt: new Date().toISOString(),
              })
            }
            return repoData
          }

          return new Error(`Repository not found: ${key.owner}/${key.repo}`)
        })
      }

      // Map results back to the correct order for successful responses
      return keys.map((key, index) => {
        const alias = `repo${index}`
        const repoData = typedResponse.data?.[alias]

        if (repoData) {
          // Cache individual repository data if cache manager is available
          if (cacheManager) {
            const cacheKey = cacheManager.generateCacheKey(
              'GET',
              `/repos/${key.owner}/${key.repo}`,
              {}
            )
            void cacheManager.set(cacheKey, {
              data: repoData,
              createdAt: new Date().toISOString(),
            })
          }
          return repoData
        }

        return new Error(`Repository not found: ${key.owner}/${key.repo}`)
      })
    } catch (error) {
      // Return the same error for all keys if the entire batch fails
      const batchError =
        error instanceof Error
          ? error
          : new Error(`GitHub API batch request failed: ${String(error)}`)

      return keys.map(() => batchError)
    }
  }

  return new DataLoader<RepositoryKey, RepositoryData>(batchLoadFn, {
    cache: true,
    maxBatchSize: 50, // Conservative limit for GitHub GraphQL query complexity
    cacheKeyFn: (key: RepositoryKey) => `${key.owner}/${key.repo}`,
    batchScheduleFn: callback => process.nextTick(callback),
  })
}
