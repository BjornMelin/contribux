import type { Octokit } from '@octokit/core'
import type { graphql } from '@octokit/graphql'
import type { Api } from '@octokit/plugin-rest-endpoint-methods'

export type GitHubRestClient = Octokit & Api
export type GitHubGraphQLClient = typeof graphql

// Request options type for throttling callbacks
export interface RequestOptions {
  method: string
  url: string
  headers?: Record<string, string>
  [key: string]: unknown
}

// Error type for callback functions
export interface GitHubError extends Error {
  status?: number
  response?: {
    headers?: Record<string, string>
    data?: unknown
  }
}

// Retry state type
export interface RetryState {
  retryCount: number
  error: GitHubError
  lastAttempt: Date
}

export interface GitHubClientConfig {
  auth?: GitHubAuthConfig
  baseUrl?: string
  userAgent?: string
  throttle?: ThrottleOptions
  retry?: RetryOptions
  cache?: CacheOptions
  log?: LogLevel
  includeRateLimit?: boolean
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

export interface ThrottleOptions {
  enabled?: boolean
  maxRetries?: number
  minimumSecondaryRateRetryAfter?: number
  onRateLimit?: (
    retryAfter: number,
    options: RequestOptions,
    octokit: Octokit,
    retryCount: number
  ) => boolean | Promise<boolean>
  onSecondaryRateLimit?: (
    retryAfter: number,
    options: RequestOptions,
    octokit: Octokit,
    retryCount: number
  ) => boolean | Promise<boolean>
  onRateLimitWarning?: (info: {
    resource: string
    limit: number
    remaining: number
    percentageUsed: number
  }) => void
}

export interface RetryOptions {
  enabled?: boolean
  retries?: number
  retryAfterBaseValue?: number
  doNotRetry?: number[]
  shouldRetry?: (error: GitHubError, retryCount: number) => boolean
  calculateDelay?: (retryCount: number, baseDelay?: number, retryAfter?: number) => number
  onRetry?: (error: GitHubError, retryCount: number, retryState?: RetryState) => void
  circuitBreaker?: CircuitBreakerOptions
}

export interface CircuitBreakerOptions {
  enabled: boolean
  failureThreshold: number
  recoveryTimeout: number
}

// Redis-like interface for cache storage
export interface RedisLikeClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, px?: number): Promise<string>
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
  expiresAt?: Date
  scopes?: string[]
}

export interface TokenRotationConfig {
  tokens: TokenInfo[]
  rotationStrategy: 'round-robin' | 'least-used' | 'random'
  refreshBeforeExpiry?: number // minutes
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
