import type { RateLimitInfo, GraphQLRateLimitInfo } from './types'

export interface RateLimitState {
  core?: RateLimitInfo
  search?: RateLimitInfo
  graphql?: GraphQLRateLimitInfo
  [resource: string]: RateLimitInfo | GraphQLRateLimitInfo | undefined
}

export class RateLimitManager {
  private rateLimits = new Map<string, RateLimitInfo>()
  private graphqlRateLimit: GraphQLRateLimitInfo | null = null

  updateFromHeaders(headers: Record<string, string>, resource: string = 'core'): void {
    const limit = Number.parseInt(headers['x-ratelimit-limit'] || '0', 10)
    const remaining = Number.parseInt(headers['x-ratelimit-remaining'] || '0', 10)
    const reset = Number.parseInt(headers['x-ratelimit-reset'] || '0', 10)
    const used = Number.parseInt(headers['x-ratelimit-used'] || '0', 10)

    this.rateLimits.set(resource, {
      limit,
      remaining,
      reset: new Date(reset * 1000),
      used
    })
  }

  updateFromGraphQLResponse(rateLimit: any): void {
    if (rateLimit) {
      this.graphqlRateLimit = {
        limit: rateLimit.limit || 0,
        remaining: rateLimit.remaining || 0,
        reset: new Date(rateLimit.resetAt || Date.now()),
        used: rateLimit.used || 0,
        cost: rateLimit.cost || 0,
        nodeCount: rateLimit.nodeCount || 0
      }
    }
  }

  getRateLimit(resource: string = 'core'): RateLimitInfo | null {
    return this.rateLimits.get(resource) || null
  }

  getGraphQLRateLimit(): GraphQLRateLimitInfo | null {
    return this.graphqlRateLimit
  }

  getPercentageUsed(resource: string = 'core'): number {
    const rateLimit = this.rateLimits.get(resource)
    if (!rateLimit || rateLimit.limit === 0) {
      return 0
    }
    return (rateLimit.used / rateLimit.limit) * 100
  }

  getTimeUntilReset(resource: string = 'core'): number {
    const rateLimit = this.rateLimits.get(resource)
    if (!rateLimit) {
      return 0
    }
    return Math.max(0, rateLimit.reset.getTime() - Date.now())
  }

  isRateLimited(resource: string = 'core'): boolean {
    const rateLimit = this.rateLimits.get(resource)
    return rateLimit ? rateLimit.remaining === 0 : false
  }

  getState(): Record<string, unknown> {
    const state: Record<string, unknown> = {}
    
    // Add REST rate limits
    for (const [resource, rateLimit] of this.rateLimits.entries()) {
      state[resource] = {
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        reset: rateLimit.reset.toISOString(),
        used: rateLimit.used,
        percentageUsed: this.getPercentageUsed(resource),
        timeUntilReset: this.getTimeUntilReset(resource)
      }
    }

    // Add GraphQL rate limit
    if (this.graphqlRateLimit) {
      state.graphql = {
        limit: this.graphqlRateLimit.limit,
        remaining: this.graphqlRateLimit.remaining,
        reset: this.graphqlRateLimit.reset.toISOString(),
        used: this.graphqlRateLimit.used,
        cost: this.graphqlRateLimit.cost,
        nodeCount: this.graphqlRateLimit.nodeCount,
        percentageUsed: this.graphqlRateLimit.limit > 0 
          ? (this.graphqlRateLimit.used / this.graphqlRateLimit.limit) * 100 
          : 0
      }
    }

    return state
  }

  reset(): void {
    this.rateLimits.clear()
    this.graphqlRateLimit = null
  }
}