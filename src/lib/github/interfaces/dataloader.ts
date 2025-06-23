/**
 * DataLoader interfaces and types
 *
 * This file contains interfaces for DataLoader implementations,
 * including repository data loading and batching options.
 */

// DataLoader interfaces for GitHub data batching
export interface DataLoaderOptions<K = unknown, V = unknown> {
  readonly cache?: boolean
  readonly maxBatchSize?: number
  readonly batchScheduleFn?: (callback: () => void) => void
  readonly cacheMap?: Map<string, Promise<V>>
  readonly cacheKeyFn?: (key: K) => string
}

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
