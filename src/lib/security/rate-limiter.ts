/**
 * Rate Limiting Module
 * Provides distributed rate limiting using Upstash Redis with sliding window algorithm
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Request interface for rate limiting
interface RateLimitRequest {
  ip?: string
  headers?: Record<string, string | string[] | undefined>
  session?: {
    user?: {
      id: string
    }
  }
}

// Response interface for rate limiting
interface RateLimitResponse {
  setHeader: (name: string, value: string) => void
  status?: (code: number) => RateLimitResponse
  json?: (data: unknown) => RateLimitResponse
  send?: (data: string) => void
}

/**
 * Rate limit configurations for different endpoints
 */
export const rateLimitConfigs = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max 100 requests per window
  },
  api: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // max 1000 requests per window
  },
  search: {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // max 60 requests per minute
  },
} as const

/**
 * Create a rate limiter instance
 */
function createRateLimiter(config: { windowMs: number; max: number }) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    // Return a mock rate limiter that always allows requests
    return {
      limit: async () => ({
        success: true,
        limit: config.max,
        remaining: config.max,
        reset: Date.now() + config.windowMs,
      }),
    }
  }

  const redis = new Redis({ url, token })

  // Create rate limiter with sliding window algorithm
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.max, `${config.windowMs}ms`),
  })
}

/**
 * Rate limiters for different endpoint types
 */
export const authRateLimiter = createRateLimiter(rateLimitConfigs.auth)
export const apiRateLimiter = createRateLimiter(rateLimitConfigs.api)
export const searchRateLimiter = createRateLimiter(rateLimitConfigs.search)

/**
 * Check rate limit for a given identifier
 * @param limiter - The rate limiter instance to use
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @returns Rate limit result with success status and metadata
 */
export async function checkRateLimit(
  limiter: ReturnType<typeof createRateLimiter>,
  identifier: string
) {
  try {
    const result = await limiter.limit(identifier)

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: new Date(result.reset),
      retryAfter: result.success ? null : Math.ceil((result.reset - Date.now()) / 1000),
    }
  } catch (_error) {
    // On error, allow the request but log the issue
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: new Date(),
      retryAfter: null,
    }
  }
}

/**
 * Set rate limiting headers on the response
 */
function setRateLimitHeaders(res: RateLimitResponse, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', result.limit.toString())
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString())
  res.setHeader('X-RateLimit-Reset', result.reset.toISOString())

  if (result.retryAfter !== null) {
    res.setHeader('Retry-After', result.retryAfter.toString())
  }
}

/**
 * Handle rate limit exceeded response for Next.js API routes
 */
function handleNextJsRateLimitResponse(res: RateLimitResponse, result: RateLimitResult): boolean {
  if (!res.status || !res.json) {
    return false
  }

  const response = res.status(429)
  if (response?.json) {
    response.json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: result.retryAfter,
    })
    return true
  }

  return false
}

/**
 * Handle rate limit exceeded response for Express middleware
 */
function handleExpressRateLimitResponse(res: RateLimitResponse): boolean {
  if (!res.status || !res.send) {
    return false
  }

  const statusResponse = res.status(429)
  if (statusResponse?.send) {
    statusResponse.send('Too Many Requests')
    return true
  }

  return false
}

/**
 * Handle rate limit exceeded responses
 */
function handleRateLimitExceeded(res: RateLimitResponse, result: RateLimitResult): void {
  // Try Next.js response first
  if (handleNextJsRateLimitResponse(res, result)) {
    return
  }

  // Try Express response
  if (handleExpressRateLimitResponse(res)) {
    return
  }

  // Fallback - no specific response handling needed
}

/**
 * Express/Next.js middleware for rate limiting
 * @param limiter - The rate limiter instance to use
 * @param identifierFn - Function to extract identifier from request
 */
export function createRateLimitMiddleware(
  limiter: ReturnType<typeof createRateLimiter>,
  identifierFn: (req: RateLimitRequest) => string = req => req.ip ?? 'anonymous'
) {
  return async (req: RateLimitRequest, res: RateLimitResponse, next?: () => void) => {
    const identifier = identifierFn(req)
    const result = await checkRateLimit(limiter, identifier)

    setRateLimitHeaders(res, result)

    if (!result.success) {
      handleRateLimitExceeded(res, result)
      return
    }

    // Continue to next middleware
    if (next) {
      next()
    }
  }
}

/**
 * Helper function to get identifier from request
 * Prioritizes authenticated user ID, falls back to IP address
 */
export function getRequestIdentifier(req: RateLimitRequest): string {
  // Check for authenticated user
  if (req.session?.user?.id) {
    return `user:${req.session.user.id}`
  }

  // Check for API key
  if (req.headers?.['x-api-key']) {
    return `api:${req.headers['x-api-key']}`
  }

  // Fall back to IP address
  const forwarded = req.headers?.['x-forwarded-for']
  let ip: string | undefined

  if (forwarded) {
    // Handle both string and string array types
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
    ip = forwardedValue ? forwardedValue.split(',')[0]?.trim() : undefined
  } else {
    ip = req.ip
  }

  return `ip:${ip || 'anonymous'}`
}

/**
 * Rate limit result type
 */
export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: Date
  retryAfter: number | null
}
