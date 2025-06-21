/**
 * Core GitHub client interfaces and types
 *
 * This file contains the primary interfaces for configuring and using
 * the GitHub API client, including authentication and basic request/response types.
 */

import type { Octokit } from '@octokit/core'
import type { graphql } from '@octokit/graphql'
import type { Api } from '@octokit/plugin-rest-endpoint-methods'
import type { CacheOptions } from './cache'
import type { ThrottleOptions } from './rate-limiting'
import type { RetryOptions } from './retry'
import type { TokenRotationConfig } from './token'
import type { LogLevel } from './utils'

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
