import type { Octokit } from '@octokit/core'
import type { graphql } from '@octokit/graphql'
import type { Api } from '@octokit/plugin-rest-endpoint-methods'

export type GitHubRestClient = Octokit & Api
export type GitHubGraphQLClient = typeof graphql

/**
 * Options passed to throttling callbacks for request inspection and modification
 * Used by rate limit handlers to determine retry behavior
 */
export interface RequestOptions {
  /** HTTP method (GET, POST, etc.) */
  method: string
  /** Full URL of the request */
  url: string
  /** Optional HTTP headers */
  headers?: Record<string, string>
  /** Additional request properties */
  [key: string]: unknown
}

/**
 * Extended error type for GitHub API errors
 * Includes HTTP status and response data for better error handling
 */
export interface GitHubError extends Error {
  /** HTTP status code if available */
  status?: number
  /** Response details from the API */
  response?: {
    /** Response headers including rate limit info */
    headers?: Record<string, string>
    /** Response body data */
    data?: unknown
  }
}

/**
 * State information passed to retry callbacks
 * Provides context about retry attempts for custom logic
 */
export interface RetryState {
  /** Number of retries attempted so far */
  retryCount: number
  /** The error that triggered the retry */
  error: GitHubError
  /** Timestamp of the last retry attempt */
  lastAttempt: Date
}

/**
 * Main configuration object for GitHubClient
 * Supports authentication, rate limiting, caching, and advanced features
 */
export interface GitHubClientConfig {
  /** Authentication configuration (token, app, or OAuth) */
  auth?: GitHubAuthConfig
  /** Custom API base URL (defaults to https://api.github.com) */
  baseUrl?: string
  /** Custom user agent string */
  userAgent?: string
  /** Rate limiting and throttling options */
  throttle?: ThrottleOptions
  /** Retry logic configuration */
  retry?: RetryOptions
  /** Caching configuration for responses */
  cache?: CacheOptions
  /** Logging level for debugging */
  log?: LogLevel
  /** Whether to include rate limit info in GraphQL queries */
  includeRateLimit?: boolean
  /** Token rotation configuration for multiple tokens */
  tokenRotation?: TokenRotationConfig
}

export type GitHubAuthConfig =
  | { type: 'token'; token: string }
  | {
      type: 'app'
      appId: number
      privateKey: string
      installationId?: number
      webhookSecret?: string
    }
  | { type: 'oauth'; clientId: string; clientSecret: string }

/**
 * Configuration for GitHub API rate limiting and throttling
 * Handles both primary (5000/hour) and secondary rate limits
 */
export interface ThrottleOptions {
  /** Enable/disable throttling (default: true) */
  enabled?: boolean
  /** Maximum number of automatic retries */
  maxRetries?: number
  /** Minimum seconds to wait for secondary rate limits */
  minimumSecondaryRateRetryAfter?: number
  /**
   * Callback when primary rate limit is hit
   * Return true to retry, false to throw error
   */
  onRateLimit?: (
    retryAfter: number,
    options: RequestOptions,
    octokit: Octokit,
    retryCount: number
  ) => boolean | Promise<boolean>
  /**
   * Callback when secondary rate limit is hit
   * Return true to retry, false to throw error
   */
  onSecondaryRateLimit?: (
    retryAfter: number,
    options: RequestOptions,
    octokit: Octokit,
    retryCount: number
  ) => boolean | Promise<boolean>
  /**
   * Warning callback when approaching rate limits
   * Useful for proactive rate limit management
   */
  onRateLimitWarning?: (info: {
    resource: string
    limit: number
    remaining: number
    percentageUsed: number
  }) => void
}

/**
 * Configuration for retry behavior on failed requests
 * Supports exponential backoff, custom retry logic, and circuit breakers
 */
export interface RetryOptions {
  /** Enable/disable retry logic (default: true) */
  enabled?: boolean
  /** Maximum number of retry attempts (default: 3) */
  retries?: number
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  retryAfterBaseValue?: number
  /** HTTP status codes that should not be retried (default: [400, 401, 403, 404, 422]) */
  doNotRetry?: number[]
  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: GitHubError, retryCount: number) => boolean
  /** Custom delay calculation function */
  calculateDelay?: (retryCount: number, baseDelay?: number, retryAfter?: number) => number
  /** Callback fired on each retry attempt */
  onRetry?: (error: GitHubError, retryCount: number, retryState?: RetryState) => void
  /** Circuit breaker configuration to prevent cascading failures */
  circuitBreaker?: CircuitBreakerOptions
}

/**
 * Circuit breaker pattern configuration
 * Prevents cascading failures by temporarily blocking requests after repeated failures
 */
export interface CircuitBreakerOptions {
  /** Enable/disable circuit breaker */
  enabled: boolean
  /** Number of failures before circuit opens */
  failureThreshold: number
  /** Time in milliseconds before attempting recovery */
  recoveryTimeout: number
}

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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: Date
  used: number
}

export interface GraphQLRateLimitInfo extends RateLimitInfo {
  cost: number
  nodeCount: number
}

export interface GitHubErrorResponse {
  message: string
  documentation_url?: string
  errors?: Array<{
    resource: string
    field: string
    code: string
  }>
}

export interface WebhookValidationResult {
  isValid: boolean
  error?: string
}

export interface TokenInfo {
  token: string
  type: 'personal' | 'app' | 'installation'
  expiresAt?: Date | undefined
  scopes?: string[] | undefined
}

export interface TokenRotationConfig {
  tokens: TokenInfo[]
  rotationStrategy: 'round-robin' | 'least-used' | 'random'
  refreshBeforeExpiry?: number | undefined // minutes
}

export interface GraphQLPageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor?: string
  endCursor?: string
}

export interface GraphQLConnection<T> {
  edges: Array<{
    node: T
    cursor: string
  }>
  pageInfo: GraphQLPageInfo
  totalCount?: number
}

export interface BatchRequest {
  id: string
  query: string
  variables?: Record<string, unknown>
}

export interface BatchResponse<T = unknown> {
  id: string
  data?: T
  errors?: Array<{
    message: string
    type?: string
    path?: string[]
  }>
}

export interface GraphQLResponse<T = unknown> {
  data?: T
  errors?: Array<{
    message: string
    path?: Array<string | number>
    extensions?: Record<string, unknown>
  }>
  rateLimit?: GraphQLRateLimitInfo
}

export interface OctokitHeaders {
  'x-ratelimit-limit'?: string
  'x-ratelimit-remaining'?: string
  'x-ratelimit-reset'?: string
  'x-ratelimit-used'?: string
  'x-ratelimit-resource'?: string
  'retry-after'?: string
  'if-none-match'?: string
  etag?: string
  'cache-control'?: string
  [key: string]: string | undefined
}

export interface OctokitRequestOptions {
  method?: string
  url?: string
  headers?: OctokitHeaders
  mediaType?: {
    format?: string
    previews?: string[]
  }
  data?: unknown
  [key: string]: unknown
}

export interface OctokitResponse<T = unknown> {
  data: T
  status: number
  headers: OctokitHeaders
  url: string
}

export interface RateLimitResponse {
  resources: {
    core: RateLimitInfo
    search: RateLimitInfo
    graphql: RateLimitInfo
    [key: string]: RateLimitInfo
  }
  rate: RateLimitInfo
}
