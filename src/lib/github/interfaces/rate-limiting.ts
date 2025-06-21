/**
 * Rate limiting and throttling interfaces
 *
 * This file contains interfaces for managing GitHub API rate limits,
 * including primary and secondary rate limits, and warning callbacks.
 */

import type { Octokit } from '@octokit/core'
import type { RequestOptions } from './client'

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

export interface RateLimitResponse {
  resources: {
    core: RateLimitInfo
    search: RateLimitInfo
    graphql: RateLimitInfo
    [key: string]: RateLimitInfo
  }
  rate: RateLimitInfo
}
