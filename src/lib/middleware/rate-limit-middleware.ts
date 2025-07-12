/**
 * Rate Limit Middleware Factory
 * Creates middleware functions for rate limiting
 */

import { type NextRequest, NextResponse } from 'next/server'
import { keyGenerators, MemoryStore, type RateLimitConfig, RateLimiter } from './rate-limiter'

// Re-export for test compatibility
export { keyGenerators, MemoryStore, RateLimiter, RedisStore } from './rate-limiter'

export interface RateLimitMiddlewareConfig
  extends Omit<RateLimitConfig, 'skip' | 'max' | 'keyGenerator'> {
  max: number | ((req: NextRequest) => number)
  keyGenerator?: 'ip' | 'user' | 'combined' | ((req: NextRequest) => string)
  skip?: (req: NextRequest) => boolean
  onLimitReached?: (context: { identifier: string; limit: number; windowMs: number }) => void
}

export type MiddlewareHandler = (req: NextRequest) => Promise<NextResponse>

export function rateLimitMiddleware(config: RateLimitMiddlewareConfig) {
  // Create store once outside the request handler to persist across requests
  const sharedStore = config.store || new MemoryStore()

  return async (request: NextRequest, handler: MiddlewareHandler): Promise<NextResponse> => {
    // Check skip condition at request level
    if (config.skip?.(request)) {
      return await handler(request)
    }

    // Generate identifier
    let identifier: string
    if (typeof config.keyGenerator === 'string') {
      const generator = keyGenerators[config.keyGenerator]
      identifier = generator(request)
    } else if (typeof config.keyGenerator === 'function') {
      identifier = config.keyGenerator(request)
    } else {
      // Default to IP-based identification
      identifier = keyGenerators.ip(request)
    }

    // Calculate dynamic max limit
    const maxLimit = typeof config.max === 'function' ? config.max(request) : config.max

    // Create rate limiter with dynamic max but shared store
    const rateLimiter = new RateLimiter({
      windowMs: config.windowMs,
      max: maxLimit,
      store: sharedStore,
      skip: () => false, // Skip is handled at middleware level
      onLimitReached: config.onLimitReached,
      message: config.message,
      standardHeaders: config.standardHeaders,
      legacyHeaders: config.legacyHeaders,
      slidingWindow: config.slidingWindow,
      points: config.points,
    })

    // Check rate limit
    const result = await rateLimiter.check(identifier)

    // If rate limited, return 429 response
    if (!result.allowed) {
      // Call limit reached callback
      config.onLimitReached?.({
        identifier,
        limit: result.limit,
        windowMs: config.windowMs,
      })

      const headers = new Headers({
        'x-ratelimit-limit': result.limit.toString(),
        'x-ratelimit-remaining': result.remaining.toString(),
        'x-ratelimit-reset': result.resetAt.toISOString(),
      })

      if (result.retryAfter) {
        headers.set('retry-after', result.retryAfter.toString())
      }

      return NextResponse.json(
        {
          error: `Too many requests from ${identifier}. Try again later.`,
          message: config.message || 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
        },
        { status: 429, headers }
      )
    }

    // Call the handler
    const response = await handler(request)

    // Add rate limit headers to successful response
    response.headers.set('x-ratelimit-limit', result.limit.toString())
    response.headers.set('x-ratelimit-remaining', result.remaining.toString())
    response.headers.set('x-ratelimit-reset', result.resetAt.toISOString())

    return response
  }
}
