import type { Octokit } from '@octokit/core'
import type { Api } from '@octokit/plugin-rest-endpoint-methods/dist-types/types'
import type { graphql } from '@octokit/graphql/dist-types/types'
import type { RequestError } from '@octokit/types'
import type { z } from 'zod'

export type GitHubRestClient = Octokit & Api
export type GitHubGraphQLClient = typeof graphql

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
  | { type: 'app'; appId: number; privateKey: string; installationId?: number }
  | { type: 'oauth'; clientId: string; clientSecret: string }

export interface ThrottleOptions {
  enabled?: boolean
  maxRetries?: number
  minimumSecondaryRateRetryAfter?: number
  onRateLimit?: (retryAfter: number, options: any, octokit: Octokit, retryCount: number) => boolean | Promise<boolean>
  onSecondaryRateLimit?: (retryAfter: number, options: any, octokit: Octokit, retryCount: number) => boolean | Promise<boolean>
  onRateLimitWarning?: (info: { resource: string; limit: number; remaining: number; percentageUsed: number }) => void
}

export interface RetryOptions {
  enabled?: boolean
  retries?: number
  retryAfterBaseValue?: number
  doNotRetry?: number[]
  shouldRetry?: (error: any, retryCount: number) => boolean
  calculateDelay?: (retryCount: number, baseDelay?: number, retryAfter?: number) => number
  onRetry?: (error: any, retryCount: number) => void
  circuitBreaker?: CircuitBreakerOptions
}

export interface CircuitBreakerOptions {
  enabled: boolean
  failureThreshold: number
  recoveryTimeout: number
}

export interface CacheOptions {
  enabled?: boolean
  ttl?: number
  storage?: 'memory' | 'redis'
  redisUrl?: string
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

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly response?: GitHubErrorResponse,
    public readonly request?: any
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export interface WebhookPayload {
  headers: Record<string, string>
  body: string | object
  signature?: string
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

export interface CacheEntry<T> {
  data: T
  etag?: string
  createdAt: Date
  expiresAt?: Date
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
  variables?: Record<string, any>
}

export interface BatchResponse<T = any> {
  id: string
  data?: T
  errors?: any[]
}