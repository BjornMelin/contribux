/**
 * Rate Limiting Bridge Module
 * Bridges the existing security middleware with the new Upstash Redis rate limiter
 */

import {
  apiRateLimiter,
  authRateLimiter,
  checkRateLimit,
  getRequestIdentifier,
  searchRateLimiter,
} from './rate-limiter'

// Request interface for rate limiting compatibility
interface RateLimitRequest {
  ip?: string
  headers?: Record<string, string | string[] | undefined>
  session?: {
    user?: {
      id: string
    }
  }
}

/**
 * Get rate limiter for a specific endpoint type
 * This function maintains compatibility with existing code
 */
export function getRateLimiter(type: 'auth' | 'api' | 'search' = 'api') {
  const limiter =
    type === 'auth' ? authRateLimiter : type === 'search' ? searchRateLimiter : apiRateLimiter

  // Return a compatible interface for the existing middleware
  return {
    limit: async (req: string | RateLimitRequest) => {
      const identifier = typeof req === 'string' ? req : getRequestIdentifier(req)
      return await checkRateLimit(limiter, identifier)
    },
  }
}

export type { RateLimitResult } from './rate-limiter'
// Re-export for convenience
export { checkRateLimit, getRequestIdentifier } from './rate-limiter'
