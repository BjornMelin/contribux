import type { RateLimitInfo, GraphQLRateLimitInfo } from '../types'

export interface RateLimitState {
  core: RateLimitInfo
  search: RateLimitInfo
  graphql: GraphQLRateLimitInfo
  [key: string]: RateLimitInfo | GraphQLRateLimitInfo
}

export class RateLimitManager {
  private state: RateLimitState = {
    core: { limit: 5000, remaining: 5000, reset: new Date(), used: 0 },
    search: { limit: 30, remaining: 30, reset: new Date(), used: 0 },
    graphql: { limit: 5000, remaining: 5000, reset: new Date(), used: 0, cost: 0, nodeCount: 0 }
  }

  updateFromHeaders(headers: Record<string, any>, resource: string = 'core'): void {
    const limit = parseInt(headers['x-ratelimit-limit'] || '0', 10)
    const remaining = parseInt(headers['x-ratelimit-remaining'] || '0', 10)
    const reset = parseInt(headers['x-ratelimit-reset'] || '0', 10)
    const used = parseInt(headers['x-ratelimit-used'] || '0', 10)

    if (limit > 0) {
      this.state[resource] = {
        limit,
        remaining,
        reset: new Date(reset * 1000),
        used
      }
    }
  }

  updateFromGraphQLResponse(rateLimitData: any): void {
    if (rateLimitData) {
      this.state.graphql = {
        limit: rateLimitData.limit,
        remaining: rateLimitData.remaining,
        reset: new Date(rateLimitData.resetAt),
        used: rateLimitData.limit - rateLimitData.remaining,
        cost: rateLimitData.cost || 0,
        nodeCount: rateLimitData.nodeCount || 0
      }
    }
  }

  getState(): RateLimitState {
    return { ...this.state }
  }

  isRateLimited(resource: string = 'core'): boolean {
    const info = this.state[resource]
    return info ? info.remaining === 0 : false
  }

  getResetTime(resource: string = 'core'): Date | null {
    const info = this.state[resource]
    return info ? info.reset : null
  }

  getPercentageUsed(resource: string = 'core'): number {
    const info = this.state[resource]
    if (!info || info.limit === 0) return 0
    return ((info.limit - info.remaining) / info.limit) * 100
  }
}

export function calculateRetryDelay(retryCount: number, baseDelay: number = 1000): number {
  // Exponential backoff with jitter
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), 60000) // Max 60 seconds
  const jitter = Math.random() * 0.3 * exponentialDelay // 0-30% jitter
  return Math.floor(exponentialDelay + jitter)
}

export function parseRetryAfter(retryAfterHeader?: string): number {
  if (!retryAfterHeader) return 60 // Default to 60 seconds

  const retryAfter = parseInt(retryAfterHeader, 10)
  if (!isNaN(retryAfter)) {
    return retryAfter
  }

  // Try parsing as date
  const retryDate = new Date(retryAfterHeader)
  if (!isNaN(retryDate.getTime())) {
    return Math.max(0, Math.floor((retryDate.getTime() - Date.now()) / 1000))
  }

  return 60 // Default fallback
}