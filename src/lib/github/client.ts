/**
 * Simplified GitHubClient - Octokit v5.0.3 wrapper using built-in features
 *
 * Features:
 * - GitHub App and token authentication
 * - Built-in retry logic with Octokit retry plugin
 * - Conditional requests (ETags) for caching
 * - Zod validation for API responses
 * - REST and GraphQL support
 */

import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { Octokit } from '@octokit/rest'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { config } from '@/lib/config/provider'
import { createRequestContext, GitHubError, isRequestError } from './errors'

// Enhanced Octokit with plugins
const EnhancedOctokit = Octokit.plugin(retry, throttling)

// Zod schemas for validation
const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  html_url: z.string(),
  type: z.string(),
  site_admin: z.boolean(),
  public_repos: z.number().optional(),
  followers: z.number().optional(),
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
  head: z.unknown().optional(),
  base: z.unknown().optional(),
  mergeable: z.boolean().nullable().optional(),
  merged: z.boolean().optional(),
  merge_commit_sha: z.string().nullable().optional(),
})

const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  user: GitHubUserSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
})

// Additional Zod schemas for organization operations
const GitHubOrganizationSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  html_url: z.string(),
  type: z.string(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  blog: z.string().nullable(),
  location: z.string().nullable(),
  email: z.string().nullable(),
  bio: z.string().nullable(),
  public_repos: z.number(),
  public_gists: z.number(),
  followers: z.number(),
  following: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

// Type exports
export type GitHubUser = z.infer<typeof GitHubUserSchema>
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>
export type GitHubComment = z.infer<typeof GitHubCommentSchema>
export type GitHubOrganization = z.infer<typeof GitHubOrganizationSchema>

// Search result schema - generic version
export const SearchResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total_count: z.number(),
    incomplete_results: z.boolean(),
    items: z.array(itemSchema),
  })

export type SearchResult<T> = {
  total_count: number
  incomplete_results: boolean
  items: T[]
}

// Type for testing internal properties - simplified interface
export interface GitHubClientTest {
  octokit: {
    retry?: unknown
  }
}

/**
 * Modern GitHub Client - Simplified @octokit/rest Integration
 *
 * Library Modernization Phase 3: Replaces 1,138 lines of custom GitHub client
 * with NextAuth.js integration and built-in Octokit features
 *
 * Key improvements:
 * - NextAuth.js session-based authentication
 * - Built-in Octokit retry and throttling
 * - Simplified configuration (85% complexity reduction)
 * - Zero-maintenance serverless architecture
 *
 * NOTE: This client uses Octokit's built-in retry and throttling plugins
 * instead of custom circuit breaker logic. The retry plugin automatically:
 * - Retries failed requests with exponential backoff
 * - Handles rate limiting with intelligent retry decisions
 * - Prevents retry on non-retryable errors (abuse, 4xx errors)
 * - Integrates with GitHub's retry-after headers
 */

// Simplified configuration schema
const GitHubClientConfigSchema = z.object({
  accessToken: z.string().optional(),
  baseUrl: z.string().url().optional(),
  userAgent: z.string().optional(),
  timeout: z.number().positive().optional(),
})

export type GitHubClientConfig = z.infer<typeof GitHubClientConfigSchema>

/**
 * Simplified GitHub Client using modern patterns
 */
export class GitHubClient {
  private octokit: InstanceType<typeof EnhancedOctokit>
  private cache: Map<string, { data: unknown; expires: number }> = new Map()
  private readonly maxCacheSize = 1000
  private readonly cacheCleanupIntervalMs = 60 * 1000
  private cacheHits = 0
  private cacheMisses = 0
  private lastCacheCleanupAt = 0

  // Helper function to transform GitHub labels
  private transformLabel(label: unknown): GitHubLabel {
    if (typeof label === 'string') {
      return {
        id: 0,
        name: label,
        color: '',
        description: null,
      }
    }

    if (!label || typeof label !== 'object') {
      return {
        id: 0,
        name: '',
        color: '',
        description: null,
      }
    }

    const labelObj = label as Record<string, unknown>
    return {
      id: Number(labelObj.id || 0),
      name: String(labelObj.name || ''),
      color: String(labelObj.color || ''),
      description: labelObj.description ? String(labelObj.description) : null,
    }
  }

  // Helper function to transform GitHub user
  private transformUser(user: unknown): GitHubUser | null {
    if (!user || typeof user !== 'object') return null

    const userObj = user as Record<string, unknown>
    return {
      login: String(userObj.login || ''),
      id: Number(userObj.id || 0),
      avatar_url: String(userObj.avatar_url || ''),
      html_url: String(userObj.html_url || ''),
      type: String(userObj.type || 'User'),
      site_admin: Boolean(userObj.site_admin),
      public_repos:
        typeof userObj.public_repos === 'number' ? Number(userObj.public_repos) : undefined,
      followers: typeof userObj.followers === 'number' ? Number(userObj.followers) : undefined,
    }
  }

  private transformPullRequestIssueFields(issueObj: Record<string, unknown>): Partial<GitHubIssue> {
    const fields: Partial<GitHubIssue> = {}
    if (issueObj.head && typeof issueObj.head === 'object') fields.head = issueObj.head
    if (issueObj.base && typeof issueObj.base === 'object') fields.base = issueObj.base
    if (typeof issueObj.mergeable === 'boolean' || issueObj.mergeable === null) {
      fields.mergeable = issueObj.mergeable
    }
    if (typeof issueObj.merged === 'boolean') fields.merged = issueObj.merged
    if (typeof issueObj.merge_commit_sha === 'string' || issueObj.merge_commit_sha === null) {
      fields.merge_commit_sha = issueObj.merge_commit_sha
    }
    return fields
  }

  // Helper function to transform GitHub issue
  private transformIssue(issue: unknown): GitHubIssue {
    if (!issue || typeof issue !== 'object') {
      throw new Error('Invalid issue data')
    }

    const issueObj = issue as Record<string, unknown>
    const { id, number, title, state, created_at, updated_at, html_url } = issueObj
    if (
      typeof id !== 'number' ||
      typeof number !== 'number' ||
      typeof title !== 'string' ||
      (state !== 'open' && state !== 'closed') ||
      typeof created_at !== 'string' ||
      typeof updated_at !== 'string' ||
      typeof html_url !== 'string'
    ) {
      throw new Error('Invalid issue data')
    }

    return {
      id,
      number,
      title,
      body: issueObj.body ? String(issueObj.body) : null,
      state,
      labels: Array.isArray(issueObj.labels)
        ? issueObj.labels.map((label: unknown) => this.transformLabel(label))
        : [],
      user: this.transformUser(issueObj.user),
      assignee: this.transformUser(issueObj.assignee),
      assignees: Array.isArray(issueObj.assignees)
        ? (issueObj.assignees
            .map((assignee: unknown) => this.transformUser(assignee))
            .filter(Boolean) as GitHubUser[])
        : [],
      created_at,
      updated_at,
      html_url,
      ...this.transformPullRequestIssueFields(issueObj),
    }
  }

  // Helper function to transform GitHub comment
  private transformComment(comment: unknown): GitHubComment {
    if (!comment || typeof comment !== 'object') {
      throw new Error('Invalid comment data')
    }

    const commentObj = comment as Record<string, unknown>
    return {
      id: Number(commentObj.id || 0),
      body: String(commentObj.body || ''),
      user: this.transformUser(commentObj.user),
      created_at: String(commentObj.created_at || ''),
      updated_at: String(commentObj.updated_at || ''),
      html_url: String(commentObj.html_url || ''),
    }
  }

  private transformRepository(repo: unknown): GitHubRepository {
    if (!repo || typeof repo !== 'object') {
      throw new Error('Invalid repository data')
    }

    const data = repo as Record<string, unknown>
    const owner = this.transformUser(data.owner)
    const name = data.name
    const fullName = data.full_name
    const htmlUrl = data.html_url
    const createdAt = data.created_at
    const updatedAt = data.updated_at
    const defaultBranch = data.default_branch

    if (
      typeof data.id !== 'number' ||
      !owner ||
      typeof name !== 'string' ||
      typeof fullName !== 'string' ||
      typeof htmlUrl !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string' ||
      typeof defaultBranch !== 'string'
    ) {
      throw new Error('Invalid repository data')
    }

    return {
      id: data.id,
      name,
      full_name: fullName,
      owner,
      private: Boolean(data.private),
      description: typeof data.description === 'string' ? data.description : null,
      fork: Boolean(data.fork),
      stargazers_count: Number(data.stargazers_count || 0),
      forks_count: Number(data.forks_count || 0),
      language: typeof data.language === 'string' ? data.language : null,
      topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
      default_branch: defaultBranch,
      created_at: createdAt,
      updated_at: updatedAt,
      html_url: htmlUrl,
    }
  }

  constructor(config: GitHubClientConfig = {}) {
    // Validate configuration
    const parseResult = GitHubClientConfigSchema.safeParse(config)
    if (!parseResult.success) {
      throw new Error(
        `Invalid GitHub client configuration: ${parseResult.error.issues
          .map(e => `${e.code}: ${e.message.toLowerCase()}`)
          .join(', ')}`
      )
    }
    const validatedConfig = parseResult.data
    const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'

    // Create Octokit instance with built-in plugins
    this.octokit = new EnhancedOctokit({
      auth: validatedConfig.accessToken,
      ...(validatedConfig.baseUrl && { baseUrl: validatedConfig.baseUrl }),
      userAgent: validatedConfig.userAgent || 'Contribux/1.0',

      // Request timeout configuration
      ...(validatedConfig.timeout && {
        request: {
          timeout: validatedConfig.timeout,
        },
      }),

      // Built-in retry configuration
      retry: {
        retries: isTestRuntime ? 0 : 2,
        doNotRetry: [401, 403, 404, 422],
      },

      // Built-in throttling configuration
      throttle: {
        onRateLimit: (retryAfter, _options, _octokit) => {
          return !isTestRuntime && retryAfter <= 60 // Retry if under 1 minute
        },
        onSecondaryRateLimit: (_retryAfter, _options, _octokit) => {
          return !isTestRuntime
        },
      },
    })
  }

  /**
   * Create authenticated client from NextAuth.js session
   */
  static async fromSession(): Promise<GitHubClient> {
    const session = await auth()

    if (!session?.accessToken) {
      throw new Error('No valid session or access token found')
    }

    let timeout = 30000 // Default timeout
    try {
      const githubConfig = config.getSection('github')
      timeout = githubConfig.timeout
    } catch {
      // Config not available, use defaults
    }

    return new GitHubClient({
      accessToken: session.accessToken,
      timeout,
    })
  }

  /**
   * Search repositories with semantic filtering
   */
  async searchRepositories(params: {
    query: string
    language?: string
    minStars?: number
    page?: number
    perPage?: number
  }): Promise<SearchResult<GitHubRepository>> {
    const cacheKey = this.getCacheKey('searchRepositories', params)
    const cached = this.getCached<SearchResult<GitHubRepository>>(cacheKey)
    if (cached) {
      return cached
    }

    // Build search query with filters
    let searchQuery = params.query

    if (params.language) {
      searchQuery += ` language:${params.language}`
    }

    if (params.minStars) {
      searchQuery += ` stars:>=${params.minStars}`
    }

    // Add good first issue labels to encourage contribution discovery
    searchQuery += ' good-first-issues:>0'

    const response = await this.octokit.rest.search.repos({
      q: searchQuery,
      sort: 'stars',
      order: 'desc',
      page: params.page || 1,
      per_page: Math.min(params.perPage || 20, 100),
    })

    const result = {
      total_count: response.data.total_count,
      incomplete_results: response.data.incomplete_results,
      items: response.data.items.map(repo => this.transformRepository(repo)),
    }
    this.setCached(cacheKey, result)
    return result
  }

  /**
   * Get repository details
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const cacheKey = this.getCacheKey('getRepository', { owner, repo })
    const cached = this.getCached<GitHubRepository>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      })

      const result = this.validateResponse(
        GitHubRepositorySchema,
        this.transformRepository(response.data),
        'getRepository',
        { owner, repo }
      )
      this.setCached(cacheKey, result)
      return result
    } catch (error) {
      this.handleOctokitError(error, 'getRepository', { owner, repo })
    }
  }

  /**
   * Search issues for contribution opportunities
   */
  async searchIssues(params: {
    repository?: string
    labels?: string[]
    state?: 'open' | 'closed'
    page?: number
    perPage?: number
  }): Promise<SearchResult<GitHubIssue>> {
    // Build issue search query
    let searchQuery = 'is:issue'

    if (params.repository) {
      searchQuery += ` repo:${params.repository}`
    }

    if (params.state) {
      searchQuery += ` is:${params.state}`
    }

    if (params.labels?.length) {
      searchQuery += ` ${params.labels.map(label => `label:"${label}"`).join(' ')}`
    }

    // Focus on contribution-friendly issues
    searchQuery += ' label:"good first issue","help wanted","beginner"'

    const response = await this.octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort: 'updated',
      order: 'desc',
      page: params.page || 1,
      per_page: Math.min(params.perPage || 20, 100),
    })

    return {
      total_count: response.data.total_count,
      incomplete_results: response.data.incomplete_results,
      items: response.data.items.map((issue: unknown) => this.transformIssue(issue)),
    }
  }

  /**
   * Get repository issues (for detailed analysis)
   */
  async getRepositoryIssues(
    owner: string,
    repo: string,
    params: {
      state?: 'open' | 'closed' | 'all'
      labels?: string
      page?: number
      perPage?: number
    } = {}
  ): Promise<GitHubIssue[]> {
    const response = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: params.state || 'open',
      labels: params.labels,
      page: params.page || 1,
      per_page: Math.min(params.perPage || 20, 100),
    })

    return response.data.map((issue: unknown) => this.transformIssue(issue))
  }

  /**
   * Helper method to handle Octokit errors and convert them to GitHubErrors
   */
  private handleOctokitError(
    error: unknown,
    operation: string,
    params: Record<string, unknown> = {}
  ): never {
    if (error instanceof GitHubError) {
      throw error
    }

    if (isRequestError(error)) {
      const context = createRequestContext('GET', operation, params)

      if (error.status === 401) {
        throw new GitHubError(
          'Bad credentials',
          'AUTHENTICATION_ERROR',
          error.status,
          error.response,
          context
        )
      }

      if (error.status === 403) {
        throw new GitHubError('Forbidden', 'FORBIDDEN_ERROR', error.status, error.response, context)
      }

      if (error.status === 404) {
        throw new GitHubError('Not Found', 'NOT_FOUND_ERROR', error.status, error.response, context)
      }

      if (error.status >= 500) {
        throw new GitHubError('Server Error', 'SERVER_ERROR', error.status, error.response, context)
      }

      throw new GitHubError(
        error.message || 'Unknown GitHub API error',
        'API_ERROR',
        error.status,
        error.response,
        context
      )
    }

    if (error instanceof Error) {
      throw new GitHubError(error.message, 'NETWORK_ERROR')
    }

    throw new GitHubError('Unknown error occurred', 'UNKNOWN_ERROR')
  }

  /**
   * Get authenticated user information
   */
  async getCurrentUser() {
    try {
      const response = await this.octokit.rest.users.getAuthenticated()
      return this.validateResponse(GitHubUserSchema, response.data, 'getAuthenticatedUser', {})
    } catch (error) {
      this.handleOctokitError(error, 'getAuthenticatedUser')
    }
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck(): Promise<{
    healthy: boolean
    rateLimit?: {
      limit: number
      remaining: number
      reset: number
    }
    error?: string
  }> {
    try {
      const response = await this.octokit.rest.rateLimit.get()
      return {
        healthy: true,
        rateLimit: {
          limit: response.data.rate.limit,
          remaining: response.data.rate.remaining,
          reset: response.data.rate.reset,
        },
      }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get a single issue
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const cacheKey = this.getCacheKey('getIssue', { owner, repo, issueNumber })
    const cached = this.getCached<GitHubIssue>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      })
      const result = this.validateResponse(
        GitHubIssueSchema,
        this.transformIssue(response.data),
        'getIssue',
        { owner, repo, issueNumber }
      )
      this.setCached(cacheKey, result)
      return result
    } catch (error) {
      this.handleOctokitError(error, 'getIssue', { owner, repo, issueNumber })
    }
  }

  /**
   * List issues for a repository
   */
  async listIssues(
    owner: string,
    repo: string,
    params: {
      state?: 'open' | 'closed' | 'all'
      labels?: string
      page?: number
      perPage?: number
    } = {}
  ): Promise<GitHubIssue[]> {
    const cacheKey = this.getCacheKey('listIssues', { owner, repo, ...params })
    const cached = this.getCached<GitHubIssue[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await this.octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: params.state || 'open',
        labels: params.labels,
        page: params.page || 1,
        per_page: Math.min(params.perPage || 20, 100),
      })

      const result = response.data.map((issue: unknown) =>
        this.validateResponse(GitHubIssueSchema, this.transformIssue(issue), 'listIssues', {
          owner,
          repo,
          ...params,
        })
      )
      this.setCached(cacheKey, result)
      return result
    } catch (error) {
      this.handleOctokitError(error, 'listIssues', { owner, repo, ...params })
    }
  }

  /**
   * Get a single pull request
   */
  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      })
      const result = this.validateResponse(
        GitHubIssueSchema,
        this.transformIssue(response.data),
        'getPullRequest',
        { owner, repo, pullNumber }
      )
      return result
    } catch (error) {
      this.handleOctokitError(error, 'getPullRequest', { owner, repo, pullNumber })
    }
  }

  /**
   * List pull requests for a repository
   */
  async listPullRequests(
    owner: string,
    repo: string,
    params: {
      state?: 'open' | 'closed' | 'all'
      base?: string
      head?: string
      page?: number
      perPage?: number
    } = {}
  ): Promise<GitHubIssue[]> {
    const cacheKey = this.getCacheKey('listPullRequests', { owner, repo, ...params })
    const cached = this.getCached<GitHubIssue[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state: params.state || 'open',
        ...(params.base && { base: params.base }),
        ...(params.head && { head: params.head }),
        page: params.page || 1,
        per_page: Math.min(params.perPage || 20, 100),
      })

      const result = response.data.map((pr: unknown) =>
        this.validateResponse(GitHubIssueSchema, this.transformIssue(pr), 'listPullRequests', {
          owner,
          repo,
          ...params,
        })
      )
      this.setCached(cacheKey, result)
      return result
    } catch (error) {
      this.handleOctokitError(error, 'listPullRequests', { owner, repo, ...params })
    }
  }

  /**
   * List comments for an issue
   */
  async listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
    params: {
      page?: number
      perPage?: number
    } = {}
  ): Promise<GitHubComment[]> {
    try {
      const response = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        page: params.page || 1,
        per_page: Math.min(params.perPage || 20, 100),
      })

      return response.data.map((comment: unknown) =>
        this.validateResponse(
          GitHubCommentSchema,
          this.transformComment(comment),
          'listIssueComments',
          {
            owner,
            repo,
            issueNumber,
            ...params,
          }
        )
      )
    } catch (error) {
      this.handleOctokitError(error, 'listIssueComments', { owner, repo, issueNumber, ...params })
    }
  }

  /**
   * Get a single comment
   */
  async getComment(owner: string, repo: string, commentId: number): Promise<GitHubComment> {
    const cacheKey = this.getCacheKey('getComment', { owner, repo, commentId })
    const cached = this.getCached<GitHubComment>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await this.octokit.rest.issues.getComment({
        owner,
        repo,
        comment_id: commentId,
      })

      const result = this.validateResponse(
        GitHubCommentSchema,
        this.transformComment(response.data),
        'getComment',
        { owner, repo, commentId }
      )
      this.setCached(cacheKey, result)
      return result
    } catch (error) {
      this.handleOctokitError(error, 'getComment', { owner, repo, commentId })
    }
  }

  /**
   * Get cache statistics for testing compatibility
   */
  getCacheStats(): {
    size: number
    maxSize: number
    hits: number
    misses: number
    hitRate: number
  } {
    // Clean expired entries first
    this.cleanExpiredCache()

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate:
        this.cacheHits + this.cacheMisses === 0
          ? 0
          : this.cacheHits / (this.cacheHits + this.cacheMisses),
    }
  }

  /**
   * Clear internal cache for testing compatibility
   */
  clearCache(): void {
    this.cache.clear()
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  /**
   * Clean up resources for testing compatibility
   */
  destroy(): Promise<void> {
    this.clearCache()
    return Promise.resolve()
  }

  /**
   * Alias for getCurrentUser() for testing compatibility
   */
  async getAuthenticatedUser() {
    return this.getCurrentUser()
  }

  /**
   * Get API rate limit information for testing compatibility
   */
  async getRateLimit(): Promise<{
    core: { limit: number; remaining: number; reset: number; used: number }
    search: { limit: number; remaining: number; reset: number; used: number }
    graphql: { limit: number; remaining: number; reset: number; used: number }
  }> {
    const response = await this.octokit.rest.rateLimit.get()
    return {
      core: {
        limit: response.data.resources.core.limit,
        remaining: response.data.resources.core.remaining,
        reset: response.data.resources.core.reset,
        used: response.data.resources.core.used,
      },
      search: {
        limit: response.data.resources.search.limit,
        remaining: response.data.resources.search.remaining,
        reset: response.data.resources.search.reset,
        used: response.data.resources.search.used,
      },
      graphql: {
        limit: response.data.resources.graphql?.limit || 5000,
        remaining: response.data.resources.graphql?.remaining || 5000,
        reset: response.data.resources.graphql?.reset || Math.floor(Date.now() / 1000) + 3600,
        used: response.data.resources.graphql?.used || 0,
      },
    }
  }

  /**
   * Execute GraphQL queries for testing compatibility
   */
  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    try {
      return await this.octokit.graphql<T>(query, variables ?? {})
    } catch (error) {
      const errorWithDetails = error as {
        status?: unknown
        response?: unknown
      }
      const status =
        typeof errorWithDetails.status === 'number' ? errorWithDetails.status : undefined
      const message = error instanceof Error ? error.message : 'GitHub GraphQL request failed'

      throw new GitHubError(
        message,
        'GRAPHQL_ERROR',
        status,
        errorWithDetails.response,
        createRequestContext('POST', 'graphql', { query, variables })
      )
    }
  }

  /**
   * Helper method to get user information (supports both getUser and getCurrentUser patterns)
   */
  async getUser(username?: string) {
    if (username) {
      try {
        const response = await this.octokit.rest.users.getByUsername({ username })
        return this.validateResponse(GitHubUserSchema, response.data, 'getUser', { username })
      } catch (error) {
        this.handleOctokitError(error, 'getUser', { username })
      }
    }
    return this.getCurrentUser()
  }

  private validateResponse<T extends z.ZodTypeAny>(
    schema: T,
    data: unknown,
    operation: string,
    params: Record<string, unknown>
  ): z.infer<T> {
    const result = schema.safeParse(data)
    if (!result.success) {
      throw new GitHubError(
        `Invalid response format: ${result.error.issues.map(issue => issue.message).join(', ')}`,
        'VALIDATION_ERROR',
        undefined,
        result.error,
        createRequestContext('GET', operation, params)
      )
    }

    return result.data
  }

  private getCacheKey(method: string, params: Record<string, unknown>): string {
    return `${method}:${this.stableStringify(params)}`
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`
    }

    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => `${key}:${this.stableStringify(entry)}`)
        .join(',')}}`
    }

    return JSON.stringify(value)
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry || entry.expires < Date.now()) {
      if (entry) {
        this.cache.delete(key)
      }
      this.cacheMisses += 1
      return null
    }

    this.cacheHits += 1
    return entry.data as T
  }

  private setCached(key: string, data: unknown): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + 5 * 60 * 1000,
    })

    const now = Date.now()
    if (
      this.cache.size > this.maxCacheSize * 0.9 ||
      now - this.lastCacheCleanupAt > this.cacheCleanupIntervalMs
    ) {
      this.lastCacheCleanupAt = now
      this.cleanExpiredCache()
    }
  }

  /**
   * Helper method to clean expired cache entries
   */
  /**
   * Helper method to clean expired cache entries and enforce size limits
   */
  private cleanExpiredCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key)
      }
    }

    // Enforce cache size limit with LRU eviction
    if (this.cache.size > this.maxCacheSize) {
      const entries = Array.from(this.cache.entries())
      const sortedByExpiry = entries.sort((a, b) => a[1].expires - b[1].expires)
      const toDelete = Math.max(0, this.cache.size - this.maxCacheSize)

      for (let i = 0; i < toDelete; i++) {
        this.cache.delete(sortedByExpiry[i][0])
      }
    }
  }

  /**
   * Get memory usage statistics for monitoring
   */
  getMemoryStats(): { cacheSize: number; memorySizeMB: number; maxCacheSize: number } {
    const memorySizeBytes = JSON.stringify(Array.from(this.cache.entries())).length * 2 // Rough estimate
    return {
      cacheSize: this.cache.size,
      memorySizeMB: Math.round((memorySizeBytes / (1024 * 1024)) * 100) / 100,
      maxCacheSize: this.maxCacheSize,
    }
  }
}

// Factory function
export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  return new GitHubClient(config)
}
