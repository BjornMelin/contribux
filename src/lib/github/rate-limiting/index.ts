import type { GraphQLRateLimitInfo, RateLimitInfo } from '../types'

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

export class RateLimitManager {
  private state: RateLimitState
  private config: Required<RateLimitManagerConfig>

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

  getState(): RateLimitState {
    return { ...this.state }
  }

  isRateLimited(resource = 'core'): boolean {
    const info = this.state[resource]
    return info ? info.remaining === 0 : false
  }

  getResetTime(resource = 'core'): Date | null {
    const info = this.state[resource]
    return info?.reset ?? null
  }

  getPercentageUsed(resource = 'core'): number {
    const info = this.state[resource]
    if (!info) return 0
    return this.calculatePercentageUsed(info)
  }

  getTimeUntilReset(resource = 'core'): number {
    const resetTime = this.getResetTime(resource)
    if (!resetTime) return 0
    return Math.max(0, resetTime.getTime() - Date.now())
  }

  shouldWaitForReset(resource = 'core', minimumRemaining = 1): boolean {
    const info = this.state[resource]
    if (!info) return false
    return info.remaining < minimumRemaining
  }
}

/**
 * Calculate retry delay with exponential backoff and jitter
 * Following 2025 best practices:
 * - Uses full jitter (±50%) to prevent thundering herd
 * - Caps at 30 seconds maximum
 * - Uses proper exponential base of 2
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
 * Parse retry-after header value (seconds or HTTP date)
 * Returns delay in milliseconds
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
 * Check if we're approaching a rate limit threshold
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
 * Calculate optimal request spacing to avoid hitting rate limits
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
