import type { GraphQLRateLimitInfo, RateLimitInfo } from '../interfaces/rate-limiting'

export interface RateLimitState {
  core: RateLimitInfo
  search: RateLimitInfo
  graphql: GraphQLRateLimitInfo
  [key: string]: RateLimitInfo | GraphQLRateLimitInfo
}

export type RateLimitWarningCallback = (info: {
  resource: string
  limit: number
  remaining: number
  percentageUsed: number
}) => void

export interface RateLimitManagerConfig {
  warningThreshold?: number // Default 90 - emit warnings when usage exceeds this percentage
  onWarning?: RateLimitWarningCallback
}

/**
 * Intelligent rate limit manager for GitHub API requests
 *
 * The RateLimitManager tracks rate limit state across all GitHub API resources
 * and provides intelligent throttling and warning capabilities. It monitors:
 * - Core REST API rate limits
 * - Search API rate limits
 * - GraphQL API rate limits
 * - Secondary rate limits
 *
 * Features include automatic warning thresholds, percentage calculations,
 * and time-based reset tracking for optimal request timing.
 *
 * @example
 * ```typescript
 * const rateLimitManager = new RateLimitManager({
 *   warningThreshold: 85, // Warn when 85% of rate limit is used
 *   onWarning: (info) => {
 *     console.warn(`Rate limit warning: ${info.resource} at ${info.percentageUsed}%`);
 *   }
 * });
 *
 * // Check if we can make requests
 * if (!rateLimitManager.isRateLimited('core')) {
 *   // Safe to make API call
 *   await makeAPICall();
 * }
 * ```
 */
export class RateLimitManager {
  private state: RateLimitState
  private config: Required<RateLimitManagerConfig>

  /**
   * Creates a new RateLimitManager with configurable warning thresholds
   *
   * @param config - Rate limit manager configuration
   * @param config.warningThreshold - Percentage threshold for warnings (default: 90)
   * @param config.onWarning - Callback function for rate limit warnings
   */
  constructor(config: RateLimitManagerConfig = {}) {
    this.config = {
      warningThreshold: config.warningThreshold ?? 90,
      onWarning: config.onWarning ?? (() => {}),
    }

    this.state = {
      core: { limit: 5000, remaining: 5000, reset: new Date(), used: 0 },
      search: { limit: 30, remaining: 30, reset: new Date(), used: 0 },
      graphql: { limit: 5000, remaining: 5000, reset: new Date(), used: 0, cost: 0, nodeCount: 0 },
    }
  }

  /**
   * Update rate limit state from GitHub REST API response headers
   *
   * GitHub REST API responses include rate limit information in standard headers:
   * - x-ratelimit-limit: Total rate limit for the resource
   * - x-ratelimit-remaining: Remaining requests in the current window
   * - x-ratelimit-reset: Unix timestamp when the rate limit resets
   * - x-ratelimit-used: Number of requests used in the current window
   *
   * @param headers - HTTP response headers from GitHub API
   * @param resource - Rate limit resource ('core', 'search', 'code_search', etc.)
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager({
   *   warningThreshold: 0.8,
   *   onWarning: (warning) => console.warn(warning)
   * });
   *
   * // After making a REST API request
   * const response = await fetch('https://api.github.com/user');
   * manager.updateFromHeaders(response.headers, 'core');
   * ```
   */
  updateFromHeaders(
    headers: Record<string, string | string[] | undefined>,
    resource = 'core'
  ): void {
    const getHeader = (key: string): string | undefined => {
      const value = headers[key]
      return Array.isArray(value) ? value[0] : value
    }

    const limitStr = getHeader('x-ratelimit-limit')
    const remainingStr = getHeader('x-ratelimit-remaining')
    const resetStr = getHeader('x-ratelimit-reset')
    const usedStr = getHeader('x-ratelimit-used')

    if (!limitStr) return

    const limit = Number.parseInt(limitStr, 10)
    const remaining = Number.parseInt(remainingStr || '0', 10)
    const reset = Number.parseInt(resetStr || '0', 10)
    const used = Number.parseInt(usedStr || '0', 10)

    if (limit > 0) {
      const newInfo: RateLimitInfo = {
        limit,
        remaining,
        reset: new Date(reset * 1000),
        used,
      }

      this.state[resource] = newInfo
      this.checkForWarnings(resource, newInfo)
    }
  }

  /**
   * Update rate limit state from GitHub GraphQL API response data
   *
   * GraphQL responses include rate limit information in the response body:
   * - limit: Total point limit for GraphQL API
   * - remaining: Remaining points in the current window
   * - resetAt: ISO timestamp when the rate limit resets
   * - cost: Point cost of the current query
   * - nodeCount: Number of nodes requested in the query
   *
   * @param rateLimitData - Rate limit data from GraphQL response
   * @param rateLimitData.limit - Total point limit
   * @param rateLimitData.remaining - Remaining points
   * @param rateLimitData.resetAt - ISO timestamp of rate limit reset
   * @param rateLimitData.cost - Point cost of the query
   * @param rateLimitData.nodeCount - Number of nodes requested
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager({
   *   warningThreshold: 0.9,
   *   onWarning: (warning) => console.warn(warning)
   * });
   *
   * // After making a GraphQL API request
   * const response = await client.graphql(query);
   * manager.updateFromGraphQLResponse(response.rateLimit);
   * ```
   */
  updateFromGraphQLResponse(rateLimitData: {
    limit: number
    remaining: number
    resetAt: string
    cost?: number
    nodeCount?: number
  }): void {
    const newInfo: GraphQLRateLimitInfo = {
      limit: rateLimitData.limit,
      remaining: rateLimitData.remaining,
      reset: new Date(rateLimitData.resetAt),
      used: rateLimitData.limit - rateLimitData.remaining,
      cost: rateLimitData.cost ?? 0,
      nodeCount: rateLimitData.nodeCount ?? 0,
    }

    this.state.graphql = newInfo
    this.checkForWarnings('graphql', newInfo)
  }

  private checkForWarnings(resource: string, info: RateLimitInfo | GraphQLRateLimitInfo): void {
    const percentageUsed = this.calculatePercentageUsed(info)

    if (percentageUsed >= this.config.warningThreshold) {
      this.config.onWarning({
        resource,
        limit: info.limit,
        remaining: info.remaining,
        percentageUsed,
      })
    }
  }

  private calculatePercentageUsed(info: RateLimitInfo | GraphQLRateLimitInfo): number {
    if (info.limit === 0) return 0
    return ((info.limit - info.remaining) / info.limit) * 100
  }

  /**
   * Get current rate limit state for all resources
   *
   * Returns a snapshot of the current rate limit state including all tracked
   * resources (core, search, graphql, etc.) with their limits, remaining
   * requests, and reset times.
   *
   * @returns Complete rate limit state object
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager();
   * const state = manager.getState();
   *
   * console.log('Core API:', state.core);
   * console.log('Search API:', state.search);
   * console.log('GraphQL API:', state.graphql);
   * ```
   */
  getState(): RateLimitState {
    return { ...this.state }
  }

  /**
   * Check if a specific resource is currently rate limited
   *
   * @param resource - Rate limit resource to check (default: 'core')
   * @returns True if the resource has no remaining requests
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager();
   *
   * if (manager.isRateLimited('core')) {
   *   console.log('Core API is rate limited');
   *   const resetTime = manager.getResetTime('core');
   *   console.log('Resets at:', resetTime);
   * }
   *
   * if (manager.isRateLimited('search')) {
   *   console.log('Search API is rate limited');
   * }
   * ```
   */
  isRateLimited(resource = 'core'): boolean {
    const info = this.state[resource]
    return info ? info.remaining === 0 : false
  }

  /**
   * Get the reset time for a specific rate limit resource
   *
   * @param resource - Rate limit resource to check (default: 'core')
   * @returns Date when the rate limit resets, or null if no data available
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager();
   * const resetTime = manager.getResetTime('core');
   *
   * if (resetTime) {
   *   console.log('Rate limit resets at:', resetTime.toISOString());
   *   const minutesUntilReset = (resetTime.getTime() - Date.now()) / (1000 * 60);
   *   console.log('Minutes until reset:', Math.ceil(minutesUntilReset));
   * }
   * ```
   */
  getResetTime(resource = 'core'): Date | null {
    const info = this.state[resource]
    return info?.reset ?? null
  }

  /**
   * Calculate the percentage of rate limit used for a specific resource
   *
   * @param resource - Rate limit resource to check (default: 'core')
   * @returns Percentage used (0-100), or 0 if no data available
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager();
   * const percentageUsed = manager.getPercentageUsed('core');
   *
   * console.log(`Core API usage: ${percentageUsed.toFixed(1)}%`);
   *
   * if (percentageUsed > 80) {
   *   console.warn('Rate limit usage is high, consider throttling requests');
   * }
   * ```
   */
  getPercentageUsed(resource = 'core'): number {
    const info = this.state[resource]
    if (!info) return 0
    return this.calculatePercentageUsed(info)
  }

  /**
   * Get the time remaining until rate limit reset for a specific resource
   *
   * @param resource - Rate limit resource to check (default: 'core')
   * @returns Time in milliseconds until reset, or 0 if no data available
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager();
   * const timeUntilReset = manager.getTimeUntilReset('core');
   *
   * if (timeUntilReset > 0) {
   *   const minutes = Math.ceil(timeUntilReset / (1000 * 60));
   *   console.log(`Rate limit resets in ${minutes} minutes`);
   *
   *   // Wait for reset before making more requests
   *   await new Promise(resolve => setTimeout(resolve, timeUntilReset));
   * }
   * ```
   */
  getTimeUntilReset(resource = 'core'): number {
    const resetTime = this.getResetTime(resource)
    if (!resetTime) return 0
    return Math.max(0, resetTime.getTime() - Date.now())
  }

  /**
   * Determine if requests should wait for rate limit reset
   *
   * This method helps decide whether to wait for rate limit reset or proceed
   * with making requests based on remaining quota and desired minimum threshold.
   *
   * @param resource - Rate limit resource to check (default: 'core')
   * @param minimumRemaining - Minimum remaining requests before waiting (default: 1)
   * @returns True if should wait for reset, false if safe to proceed
   *
   * @example
   * ```typescript
   * const manager = new RateLimitManager();
   *
   * // Conservative approach: wait when less than 10 requests remaining
   * if (manager.shouldWaitForReset('core', 10)) {
   *   const waitTime = manager.getTimeUntilReset('core');
   *   console.log('Waiting for rate limit reset...');
   *   await new Promise(resolve => setTimeout(resolve, waitTime));
   * }
   *
   * // Proceed with API request
   * await makeGitHubAPIRequest();
   * ```
   */
  shouldWaitForReset(resource = 'core', minimumRemaining = 1): boolean {
    const info = this.state[resource]
    if (!info) return false
    return info.remaining < minimumRemaining
  }
}

/**
 * Calculate retry delay with exponential backoff and jitter
 *
 * Following 2025 best practices for retry logic:
 * - Uses full jitter (±50%) to prevent thundering herd
 * - Caps at 30 seconds maximum
 * - Uses proper exponential base of 2
 * - Ensures minimum delay of 100ms
 *
 * @param retryCount - Current retry attempt (0-based)
 * @param baseDelay - Base delay in milliseconds (default: 1000ms)
 * @returns Calculated delay in milliseconds with jitter applied
 *
 * @example
 * ```typescript
 * // Calculate delay for retry attempts
 * const delay1 = calculateRetryDelay(0); // ~1000ms ± 500ms
 * const delay2 = calculateRetryDelay(1); // ~2000ms ± 1000ms
 * const delay3 = calculateRetryDelay(2); // ~4000ms ± 2000ms
 *
 * // Use in retry logic
 * for (let attempt = 0; attempt < maxRetries; attempt++) {
 *   try {
 *     return await makeAPIRequest();
 *   } catch (error) {
 *     if (attempt < maxRetries - 1) {
 *       const delay = calculateRetryDelay(attempt);
 *       await new Promise(resolve => setTimeout(resolve, delay));
 *     }
 *   }
 * }
 * ```
 */
export function calculateRetryDelay(retryCount: number, baseDelay = 1000): number {
  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = Math.min(baseDelay * 2 ** retryCount, 30000) // Max 30 seconds

  // Full jitter: ±50% of exponential delay to prevent thundering herd
  const jitter = exponentialDelay * (Math.random() - 0.5)
  const finalDelay = exponentialDelay + jitter

  // Ensure minimum delay of 100ms
  return Math.max(100, Math.floor(finalDelay))
}

/**
 * Parse retry-after header value from GitHub API responses
 *
 * GitHub's secondary rate limiting responses include a retry-after header
 * that can contain either:
 * - A number of seconds to wait
 * - An HTTP date when to retry
 *
 * @param retryAfterHeader - Value from 'retry-after' HTTP header
 * @returns Delay in milliseconds (capped at 5 minutes, minimum 60 seconds)
 *
 * @example
 * ```typescript
 * // Parse numeric seconds
 * const delay1 = parseRetryAfter('120'); // Returns 120000 (120 seconds in ms)
 *
 * // Parse HTTP date
 * const delay2 = parseRetryAfter('Wed, 21 Oct 2025 07:28:00 GMT');
 *
 * // Use in error handling
 * try {
 *   await makeAPIRequest();
 * } catch (error) {
 *   if (error.status === 403 && error.headers['retry-after']) {
 *     const retryDelay = parseRetryAfter(error.headers['retry-after']);
 *     console.log(`Secondary rate limit hit, waiting ${retryDelay / 1000}s`);
 *     await new Promise(resolve => setTimeout(resolve, retryDelay));
 *   }
 * }
 * ```
 */
export function parseRetryAfter(retryAfterHeader?: string): number {
  if (!retryAfterHeader) return 60000 // Default to 60 seconds in milliseconds

  // Try parsing as numeric seconds first
  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10)
  if (!Number.isNaN(retryAfterSeconds)) {
    return Math.min(retryAfterSeconds * 1000, 300000) // Cap at 5 minutes
  }

  // Try parsing as HTTP date
  const retryDate = new Date(retryAfterHeader)
  if (!Number.isNaN(retryDate.getTime())) {
    const delayMs = Math.max(0, retryDate.getTime() - Date.now())
    return Math.min(delayMs, 300000) // Cap at 5 minutes
  }

  return 60000 // Default fallback: 60 seconds
}

/**
 * Check if rate limit usage is approaching a specified threshold
 *
 * This utility helps implement proactive rate limit management by detecting
 * when usage approaches dangerous levels before hitting the limit.
 *
 * @param info - Rate limit information object
 * @param threshold - Usage threshold as decimal (0.0-1.0, default: 0.9 for 90%)
 * @returns True if usage percentage >= threshold
 *
 * @example
 * ```typescript
 * const manager = new RateLimitManager();
 * const coreInfo = manager.getState().core;
 *
 * // Check if approaching 80% usage
 * if (isApproachingRateLimit(coreInfo, 0.8)) {
 *   console.warn('Rate limit usage high, implementing throttling');
 *   // Implement request throttling or queueing
 * }
 *
 * // Check if approaching 95% usage
 * if (isApproachingRateLimit(coreInfo, 0.95)) {
 *   console.error('Rate limit usage critical, pausing requests');
 *   // Stop making requests until reset
 * }
 * ```
 */
export function isApproachingRateLimit(
  info: RateLimitInfo | GraphQLRateLimitInfo,
  threshold = 0.9
): boolean {
  if (info.limit === 0) return false
  const percentageUsed = info.used / info.limit
  return percentageUsed >= threshold
}

/**
 * Calculate optimal delay between requests to avoid hitting rate limits
 *
 * This function calculates the ideal spacing between API requests to evenly
 * distribute the remaining quota over the time until reset, with a safety buffer.
 *
 * @param info - Rate limit information object
 * @returns Optimal delay in milliseconds between requests
 *
 * @example
 * ```typescript
 * const manager = new RateLimitManager();
 * const coreInfo = manager.getState().core;
 *
 * // Calculate optimal spacing for remaining requests
 * const optimalDelay = calculateOptimalDelay(coreInfo);
 * console.log(`Wait ${optimalDelay}ms between requests`);
 *
 * // Use in request queue or throttling
 * async function makeThrottledRequest() {
 *   const delay = calculateOptimalDelay(manager.getState().core);
 *   await new Promise(resolve => setTimeout(resolve, delay));
 *   return await makeAPIRequest();
 * }
 *
 * // Handle rate limit exceeded scenario
 * if (coreInfo.remaining === 0) {
 *   const waitTime = calculateOptimalDelay(coreInfo);
 *   console.log(`Rate limited, waiting ${waitTime / 1000} seconds`);
 * }
 * ```
 */
export function calculateOptimalDelay(info: RateLimitInfo | GraphQLRateLimitInfo): number {
  if (info.remaining === 0) {
    // Already rate limited, wait until reset
    return Math.max(0, info.reset.getTime() - Date.now())
  }

  const timeUntilReset = Math.max(0, info.reset.getTime() - Date.now())
  if (timeUntilReset === 0) return 0

  // Calculate average time per request to spread requests evenly
  const averageTimePerRequest = timeUntilReset / info.remaining

  // Add 10% buffer to be conservative
  return Math.floor(averageTimePerRequest * 1.1)
}
