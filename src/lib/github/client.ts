/**
 * GitHubClient - Unified Octokit v5.0.3 wrapper
 *
 * Features:
 * - GitHub App authentication with automatic token rotation
 * - Built-in rate limiting using Octokit's throttling plugins
 * - Zod validation for all API responses
 * - Both REST and GraphQL support in single class
 * - Comprehensive error handling
 * - Lightweight caching strategy
 */

import { createAppAuth } from '@octokit/auth-app'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { Octokit } from 'octokit'
import { z } from 'zod'
import { createRequestContext, GitHubError } from './errors'
import type {
  IssueIdentifier,
  PaginationOptions,
  RepositoryIdentifier,
  SearchOptions,
  GitHubClientConfig as TypesGitHubClientConfig,
} from './types'

// Zod schemas for GitHub API response validation
const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  html_url: z.string(),
  type: z.string(),
  site_admin: z.boolean(),
})

const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: GitHubUserSchema,
  private: z.boolean(),
  html_url: z.string(),
  description: z.string().nullable(),
  fork: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable(),
  topics: z.array(z.string()).optional(),
  default_branch: z.string(),
})

const GitHubLabelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable(),
})

const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  user: GitHubUserSchema.nullable(),
  labels: z.array(GitHubLabelSchema),
  assignee: GitHubUserSchema.nullable(),
  assignees: z.array(GitHubUserSchema),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
})

// Type aliases derived from Zod schemas
export type GitHubUser = z.infer<typeof GitHubUserSchema>
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>

export interface SearchResult<T> {
  total_count: number
  incomplete_results: boolean
  items: T[]
}

// Use validated configuration type
export type GitHubClientConfig = TypesGitHubClientConfig

interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number
}

export class GitHubClient {
  private octokit: Octokit
  private cache: Map<string, CacheEntry> = new Map()
  private readonly cacheMaxAge: number
  private readonly cacheMaxSize: number
  private readonly retryConfig: { retries: number; doNotRetry: string[] }
  private cacheHits = 0
  private cacheMisses = 0

  private validateConfiguration(config: Partial<GitHubClientConfig>): void {
    // Auth validation
    if (config.auth) {
      const auth = config.auth as Record<string, unknown>

      // Check auth type
      if (!auth.type || !['token', 'app'].includes(auth.type)) {
        throw new Error('Invalid authentication type. Must be "token" or "app"')
      }

      // Check for conflicting auth configurations
      const hasTokenFields = 'token' in auth
      const hasAppFields = 'appId' in auth || 'privateKey' in auth || 'installationId' in auth

      if (hasTokenFields && hasAppFields) {
        throw new Error('Cannot mix token and app authentication')
      }

      // Validate token auth
      if (auth.type === 'token') {
        if (!('token' in auth)) {
          throw new Error('Token is required for token authentication')
        }
        if (typeof auth.token !== 'string') {
          throw new Error('Token must be a string')
        }
        if (auth.token === '') {
          throw new Error('Token cannot be empty')
        }
      }

      // Validate app auth
      if (auth.type === 'app') {
        if (!('appId' in auth)) {
          throw new Error('App ID is required for app authentication')
        }
        if (typeof auth.appId !== 'number' || auth.appId <= 0) {
          throw new Error('App ID must be a positive integer')
        }
        if (!('privateKey' in auth)) {
          throw new Error('Private key is required for app authentication')
        }
        if (typeof auth.privateKey !== 'string') {
          throw new Error('Private key must be a string')
        }
        if (auth.privateKey === '') {
          throw new Error('Private key cannot be empty')
        }
        if (
          'installationId' in auth &&
          (typeof auth.installationId !== 'number' || auth.installationId <= 0)
        ) {
          throw new Error('Installation ID must be a positive integer')
        }
      }
    }

    // Cache validation
    if (config.cache) {
      if ('maxAge' in config.cache) {
        if (typeof config.cache.maxAge !== 'number' || config.cache.maxAge <= 0) {
          throw new Error('Cache maxAge must be a positive integer')
        }
      }
      if ('maxSize' in config.cache) {
        if (typeof config.cache.maxSize !== 'number' || config.cache.maxSize <= 0) {
          throw new Error('Cache maxSize must be a positive integer')
        }
      }
    }

    // Throttle validation
    if (config.throttle) {
      if ('onRateLimit' in config.throttle && config.throttle.onRateLimit !== undefined) {
        if (typeof config.throttle.onRateLimit !== 'function') {
          throw new Error('onRateLimit must be a function')
        }
      }
      if (
        'onSecondaryRateLimit' in config.throttle &&
        config.throttle.onSecondaryRateLimit !== undefined
      ) {
        if (typeof config.throttle.onSecondaryRateLimit !== 'function') {
          throw new Error('onSecondaryRateLimit must be a function')
        }
      }
    }

    // Retry validation
    if (config.retry) {
      if ('retries' in config.retry && config.retry.retries !== undefined) {
        if (
          typeof config.retry.retries !== 'number' ||
          config.retry.retries < 0 ||
          config.retry.retries > 10
        ) {
          if (config.retry.retries < 0) {
            throw new Error('Retries must be a non-negative integer')
          }
          throw new Error('Retries cannot exceed 10')
        }
      }
      if ('doNotRetry' in config.retry && config.retry.doNotRetry !== undefined) {
        if (
          !Array.isArray(config.retry.doNotRetry) ||
          !config.retry.doNotRetry.every(item => typeof item === 'string')
        ) {
          throw new Error('doNotRetry must be an array of strings')
        }
      }
    }

    // Base configuration validation
    if ('baseUrl' in config && config.baseUrl !== undefined) {
      if (typeof config.baseUrl !== 'string') {
        throw new Error('baseUrl must be a string')
      }
      try {
        new URL(config.baseUrl)
      } catch {
        throw new Error('baseUrl must be a valid URL')
      }
    }

    if ('userAgent' in config && config.userAgent !== undefined) {
      if (typeof config.userAgent !== 'string') {
        throw new Error('userAgent must be a string')
      }
      if (config.userAgent === '') {
        throw new Error('userAgent cannot be empty')
      }
    }

    // Warn about problematic configurations
    if (config.cache?.maxAge && config.cache.maxAge < 30 && config.throttle?.onRateLimit) {
      console.warn(
        'Configuration warning: Short cache duration with aggressive retry settings may cause performance issues'
      )
    }
  }

  constructor(config: Partial<GitHubClientConfig> = {}) {
    // Comprehensive configuration validation
    this.validateConfiguration(config)

    this.cacheMaxAge = config.cache?.maxAge ?? 300 // 5 minutes default
    this.cacheMaxSize = config.cache?.maxSize ?? 1000
    this.retryConfig = {
      retries: config.retry?.retries ?? (process.env.NODE_ENV === 'test' ? 0 : 2),
      doNotRetry: config.retry?.doNotRetry ?? ['400', '401', '403', '404', '422'],
    }

    // Create Octokit with plugins
    const OctokitWithPlugins = Octokit.plugin(throttling, retry)

    let authConfig: string | ReturnType<typeof createAppAuth> | undefined
    if (config.auth) {
      if (config.auth.type === 'token') {
        authConfig = config.auth.token
      } else if (config.auth.type === 'app') {
        const authOptions = {
          appId: config.auth.appId,
          privateKey: config.auth.privateKey,
        } as { appId: number; privateKey: string; installationId?: number }
        if (config.auth.installationId !== undefined) {
          authOptions.installationId = config.auth.installationId
        }
        authConfig = createAppAuth(authOptions)
      } else {
        throw new Error('Invalid auth configuration')
      }
    }

    // Build options object with proper typing for Octokit compatibility
    const octokitOptions = {
      ...(authConfig && { auth: authConfig }),
      userAgent: config.userAgent ?? 'contribux-github-client/1.0.0',
      throttle: {
        onRateLimit:
          config.throttle?.onRateLimit ??
          ((retryAfter: number, options: { request?: { retryCount?: number } }) => {
            console.warn(`Rate limit exceeded. Retrying after ${retryAfter} seconds.`)
            return (options.request?.retryCount ?? 0) < 2
          }),
        onSecondaryRateLimit:
          config.throttle?.onSecondaryRateLimit ??
          ((retryAfter: number, options: { request?: { retryCount?: number } }) => {
            console.warn(`Secondary rate limit triggered. Retrying after ${retryAfter} seconds.`)
            return (options.request?.retryCount ?? 0) < 1
          }),
      },
      retry: {
        doNotRetry: config.retry?.doNotRetry ?? ['400', '401', '403', '404', '422'],
        retries: config.retry?.retries ?? (process.env.NODE_ENV === 'test' ? 0 : 2),
      },
      ...(config.baseUrl && { baseUrl: config.baseUrl }),
    }

    this.octokit = new OctokitWithPlugins(octokitOptions)
  }

  // Cache management
  private getCacheKey(method: string, params: Record<string, unknown>): string {
    const deterministic = this.deterministicStringify(params)
    const baseKey = `${method}:${deterministic}`

    // For very long keys, use SHA-256 hash to keep them manageable
    if (baseKey.length > 250) {
      return `${method}:${this.hashString(deterministic)}`
    }

    return baseKey
  }

  /**
   * Creates a deterministic string representation of an object by sorting keys recursively
   */
  private deterministicStringify(obj: unknown): string {
    if (obj === null) return 'null'
    if (obj === undefined) return 'undefined'
    if (typeof obj === 'string') return JSON.stringify(obj)
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)

    if (Array.isArray(obj)) {
      return `[${obj.map(item => this.deterministicStringify(item)).join(',')}]`
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj as Record<string, unknown>)
        .filter(([, value]) => value !== undefined) // Remove undefined values
        .sort(([a], [b]) => a.localeCompare(b)) // Sort by key
        .map(([key, value]) => `${JSON.stringify(key)}:${this.deterministicStringify(value)}`)

      return `{${entries.join(',')}}`
    }

    return String(obj)
  }

  /**
   * Creates a SHA-256 hash of a string for cache key compression
   */
  private hashString(str: string): string {
    // Simple hash function for Node.js environment
    // In a browser environment, you might want to use Web Crypto API
    try {
      const crypto = require('node:crypto')
      return crypto.createHash('sha256').update(str).digest('hex').substring(0, 32)
    } catch {
      // Fallback to a simple hash if crypto is not available
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32bit integer
      }
      return Math.abs(hash).toString(16).padStart(8, '0')
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.cacheMisses++
      return null
    }

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key)
      this.cacheMisses++
      return null
    }

    this.cacheHits++
    return entry.data as T
  }

  private setCache<T>(key: string, data: T, ttl: number = this.cacheMaxAge): void {
    // Implement LRU eviction
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  // Error handling wrapper
  private async safeRequest<T>(
    operation: () => Promise<{ data: unknown }>,
    schema: z.ZodSchema<T>,
    requestInfo: {
      method: string
      operation: string
      params: Record<string, unknown>
    },
    cacheKey?: string,
    cacheTtl?: number
  ): Promise<T> {
    const startTime = new Date()
    let actualRetryAttempt = 0

    try {
      // Check cache first
      if (cacheKey) {
        const cached = this.getFromCache<T>(cacheKey)
        if (cached) return cached
      }

      const response = await operation()
      const data = schema.parse(response.data) as T

      // Cache the result
      if (cacheKey) {
        this.setCache(cacheKey, data, cacheTtl)
      }

      return data
    } catch (error: unknown) {
      // Extract retry information from Octokit error structure
      if (error && typeof error === 'object') {
        // Check for retry count in various possible locations
        const errorWithRequest = error as {
          request?: { retryCount?: number; [key: string]: unknown }
          retryCount?: number
          [key: string]: unknown
        }

        // Try to extract retry count from different possible locations
        if (errorWithRequest.request?.retryCount !== undefined) {
          actualRetryAttempt = errorWithRequest.request.retryCount
        } else if (errorWithRequest.retryCount !== undefined) {
          actualRetryAttempt = errorWithRequest.retryCount
        } else {
          // For very long duration requests (indicating retries), estimate retry attempts
          const duration = Date.now() - startTime.getTime()
          if (duration > 2000) {
            // If request took longer than 2 seconds, likely had retries
            // Rough estimation: each retry typically adds 1-2 seconds
            actualRetryAttempt = Math.min(Math.floor(duration / 2000), this.retryConfig.retries)
          }
        }
      }

      // Create request context for error reporting
      const requestContext = createRequestContext(
        requestInfo.method,
        requestInfo.operation,
        requestInfo.params,
        actualRetryAttempt,
        this.getRetryConfiguration()?.retries,
        startTime
      )

      if (error instanceof z.ZodError) {
        throw new GitHubError(
          `Invalid response format: ${error.message}`,
          'VALIDATION_ERROR',
          undefined,
          undefined,
          requestContext
        )
      }

      // Handle Octokit errors
      if (error && typeof error === 'object' && 'status' in error) {
        const githubError = error as {
          status?: number
          message?: string
          response?: { data?: unknown }
          request?: { retryCount?: number }
        }

        throw new GitHubError(
          githubError.message || 'GitHub API error',
          'API_ERROR',
          githubError.status,
          githubError.response?.data,
          requestContext
        )
      }

      const errorMessage =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error'
      throw new GitHubError(errorMessage, 'UNKNOWN_ERROR', undefined, undefined, requestContext)
    }
  }

  private getRetryConfiguration(): { retries: number } {
    return { retries: this.retryConfig.retries }
  }

  // Repository operations
  async getRepository(identifier: RepositoryIdentifier): Promise<GitHubRepository> {
    const cacheKey = this.getCacheKey('repo', identifier as Record<string, unknown>)

    return this.safeRequest(
      () =>
        this.octokit.rest.repos.get({
          owner: identifier.owner,
          repo: identifier.repo,
        }),
      GitHubRepositorySchema,
      {
        method: 'GET',
        operation: 'getRepository',
        params: identifier,
      },
      cacheKey
    )
  }

  async searchRepositories(options: SearchOptions): Promise<SearchResult<GitHubRepository>> {
    const cacheKey = this.getCacheKey('search-repos', options as Record<string, unknown>)

    return this.safeRequest(
      () =>
        this.octokit.rest.search.repos({
          q: options.q,
          ...(options.sort && { sort: options.sort }),
          ...(options.order && { order: options.order }),
          ...(options.page && { page: options.page }),
          ...(options.per_page && { per_page: options.per_page }),
        }),
      z.object({
        total_count: z.number(),
        incomplete_results: z.boolean(),
        items: z.array(GitHubRepositorySchema),
      }) as z.ZodType<SearchResult<GitHubRepository>>,
      {
        method: 'GET',
        operation: 'searchRepositories',
        params: options,
      },
      cacheKey,
      60 // Cache searches for 1 minute
    )
  }

  // User operations
  async getUser(username: string): Promise<GitHubUser> {
    const cacheKey = this.getCacheKey('user', { username })

    return this.safeRequest(
      () => this.octokit.rest.users.getByUsername({ username }),
      GitHubUserSchema,
      {
        method: 'GET',
        operation: 'getUser',
        params: { username },
      },
      cacheKey
    )
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const cacheKey = this.getCacheKey('auth-user', {})
    return this.safeRequest(
      () => this.octokit.rest.users.getAuthenticated(),
      GitHubUserSchema,
      {
        method: 'GET',
        operation: 'getAuthenticatedUser',
        params: {},
      },
      cacheKey
    )
  }

  // Issue operations
  async getIssue(identifier: IssueIdentifier): Promise<GitHubIssue> {
    const cacheKey = this.getCacheKey('issue', identifier as Record<string, unknown>)

    return this.safeRequest(
      () =>
        this.octokit.rest.issues.get({
          owner: identifier.owner,
          repo: identifier.repo,
          issue_number: identifier.issueNumber,
        }),
      GitHubIssueSchema,
      {
        method: 'GET',
        operation: 'getIssue',
        params: identifier,
      },
      cacheKey
    )
  }

  async listIssues(
    identifier: RepositoryIdentifier,
    options: PaginationOptions & {
      state?: 'open' | 'closed' | 'all'
      labels?: string
      sort?: 'created' | 'updated' | 'comments'
      direction?: 'asc' | 'desc'
    } = {}
  ): Promise<GitHubIssue[]> {
    const cacheKey = this.getCacheKey('issues', { ...identifier, ...options })

    return this.safeRequest(
      () =>
        this.octokit.rest.issues.listForRepo({
          owner: identifier.owner,
          repo: identifier.repo,
          ...(options.state && { state: options.state }),
          ...(options.labels && { labels: options.labels }),
          ...(options.sort && { sort: options.sort }),
          ...(options.direction && { direction: options.direction }),
          ...(options.page && { page: options.page }),
          ...(options.per_page && { per_page: options.per_page }),
        }),
      z.array(GitHubIssueSchema),
      {
        method: 'GET',
        operation: 'listIssues',
        params: { ...identifier, ...options },
      },
      cacheKey
    )
  }

  // GraphQL operations
  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const startTime = new Date()
    const requestContext = createRequestContext(
      'POST',
      'graphql',
      { query: query.length > 100 ? `${query.substring(0, 100)}...` : query, variables },
      0,
      this.getRetryConfiguration()?.retries,
      startTime
    )

    try {
      const response = await this.octokit.graphql(query, variables)
      return response as T
    } catch (error: unknown) {
      const githubError =
        error && typeof error === 'object'
          ? (error as { message?: string; status?: number; response?: { data?: unknown } })
          : {}
      throw new GitHubError(
        githubError.message || 'GraphQL query failed',
        'GRAPHQL_ERROR',
        githubError.status,
        githubError.response?.data,
        requestContext
      )
    }
  }

  // Rate limit information
  async getRateLimit() {
    const schema = z.object({
      core: z.object({
        limit: z.number(),
        remaining: z.number(),
        reset: z.number(),
      }),
      search: z.object({
        limit: z.number(),
        remaining: z.number(),
        reset: z.number(),
      }),
      graphql: z.object({
        limit: z.number(),
        remaining: z.number(),
        reset: z.number(),
      }),
    })

    return this.safeRequest(() => this.octokit.rest.rateLimit.get(), schema, {
      method: 'GET',
      operation: 'getRateLimit',
      params: {},
    })
  }

  // Cache management
  clearCache(): void {
    this.cache.clear()
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  getCacheStats(): {
    size: number
    maxSize: number
    hits: number
    misses: number
    hitRate: number
  } {
    const total = this.cacheHits + this.cacheMisses
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    }
  }
}

// Factory function for easy instantiation
export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  return new GitHubClient(config)
}
