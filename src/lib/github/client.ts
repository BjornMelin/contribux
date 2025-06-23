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
import { GitHubError } from './errors'
import type {
  IssueIdentifier,
  PaginationOptions,
  RepositoryIdentifier,
  SearchOptions,
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

// Configuration types
export interface GitHubClientConfig {
  auth:
    | { type: 'token'; token: string }
    | { type: 'app'; appId: number; privateKey: string; installationId?: number }
  baseUrl?: string
  userAgent?: string
  throttle?: {
    onRateLimit?: (retryAfter: number, options: any) => boolean
    onSecondaryRateLimit?: (retryAfter: number, options: any) => boolean
  }
  cache?: {
    maxAge?: number // Cache TTL in seconds
    maxSize?: number // Max cache entries
  }
}

interface CacheEntry<T = any> {
  data: T
  timestamp: number
  ttl: number
}

export class GitHubClient {
  private octokit: Octokit
  private cache: Map<string, CacheEntry> = new Map()
  private readonly cacheMaxAge: number
  private readonly cacheMaxSize: number

  constructor(config: GitHubClientConfig) {
    this.cacheMaxAge = config.cache?.maxAge ?? 300 // 5 minutes default
    this.cacheMaxSize = config.cache?.maxSize ?? 1000

    // Create Octokit with plugins
    const OctokitWithPlugins = Octokit.plugin(throttling, retry)

    let authConfig: any
    if (config.auth.type === 'token') {
      authConfig = config.auth.token
    } else if (config.auth.type === 'app') {
      const authOptions: any = {
        appId: config.auth.appId,
        privateKey: config.auth.privateKey,
      }
      if (config.auth.installationId !== undefined) {
        authOptions.installationId = config.auth.installationId
      }
      authConfig = createAppAuth(authOptions)
    }

    const octokitOptions: any = {
      auth: authConfig,
      userAgent: config.userAgent ?? 'contribux-github-client/1.0.0',
      throttle: {
        onRateLimit:
          config.throttle?.onRateLimit ??
          ((retryAfter, options) => {
            console.warn(`Rate limit exceeded. Retrying after ${retryAfter} seconds.`)
            return options.request.retryCount < 2
          }),
        onSecondaryRateLimit:
          config.throttle?.onSecondaryRateLimit ??
          ((retryAfter, options) => {
            console.warn(`Secondary rate limit triggered. Retrying after ${retryAfter} seconds.`)
            return options.request.retryCount < 1
          }),
      },
      retry: {
        doNotRetry: ['400', '401', '403', '404', '422'],
      },
    }

    if (config.baseUrl) {
      octokitOptions.baseUrl = config.baseUrl
    }

    this.octokit = new OctokitWithPlugins(octokitOptions)
  }

  // Cache management
  private getCacheKey(method: string, params: Record<string, any>): string {
    return `${method}:${JSON.stringify(params)}`
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key)
      return null
    }

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
    operation: () => Promise<any>,
    schema: z.ZodSchema<T>,
    cacheKey?: string,
    cacheTtl?: number
  ): Promise<T> {
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
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        throw new GitHubError(`Invalid response format: ${error.message}`, 'VALIDATION_ERROR')
      }

      // Handle Octokit errors
      if (error.status) {
        throw new GitHubError(
          error.message || 'GitHub API error',
          'API_ERROR',
          error.status,
          error.response?.data
        )
      }

      throw new GitHubError(error.message || 'Unknown error', 'UNKNOWN_ERROR')
    }
  }

  // Repository operations
  async getRepository(identifier: RepositoryIdentifier): Promise<GitHubRepository> {
    const cacheKey = this.getCacheKey('repo', identifier)

    return this.safeRequest(
      () =>
        this.octokit.rest.repos.get({
          owner: identifier.owner,
          repo: identifier.repo,
        }),
      GitHubRepositorySchema,
      cacheKey
    )
  }

  async searchRepositories(options: SearchOptions): Promise<SearchResult<GitHubRepository>> {
    const cacheKey = this.getCacheKey('search-repos', options)

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
      cacheKey
    )
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.safeRequest(() => this.octokit.rest.users.getAuthenticated(), GitHubUserSchema)
  }

  // Issue operations
  async getIssue(identifier: IssueIdentifier): Promise<GitHubIssue> {
    const cacheKey = this.getCacheKey('issue', identifier)

    return this.safeRequest(
      () =>
        this.octokit.rest.issues.get({
          owner: identifier.owner,
          repo: identifier.repo,
          issue_number: identifier.issueNumber,
        }),
      GitHubIssueSchema,
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
      cacheKey
    )
  }

  // GraphQL operations
  async graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    try {
      const response = await this.octokit.graphql(query, variables)
      return response as T
    } catch (error: any) {
      throw new GitHubError(
        error.message || 'GraphQL query failed',
        'GRAPHQL_ERROR',
        error.status,
        error.response?.data
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

    return this.safeRequest(() => this.octokit.rest.rateLimit.get(), schema)
  }

  // Cache management
  clearCache(): void {
    this.cache.clear()
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
    }
  }
}

// Factory function for easy instantiation
export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  return new GitHubClient(config)
}
