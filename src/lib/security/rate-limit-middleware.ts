/**
 * Next.js API Route Rate Limiting Middleware
 * Provides easy-to-use rate limiting for Next.js API routes
 */

import { type NextRequest, NextResponse } from 'next/server'
import { apiRateLimiter, authRateLimiter, checkRateLimit, searchRateLimiter } from './rate-limiter'

/**
 * Rate limit a Next.js API route handler
 * @param handler - The API route handler function
 * @param limiterType - The type of rate limiter to use
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<Response>,
  limiterType: 'auth' | 'api' | 'search' = 'api'
) {
  return async (req: NextRequest) => {
    // Select the appropriate rate limiter
    const limiter =
      limiterType === 'auth'
        ? authRateLimiter
        : limiterType === 'search'
          ? searchRateLimiter
          : apiRateLimiter

    // Get identifier from request
    const identifier = getNextRequestIdentifier(req)

    // Check rate limit
    const result = await checkRateLimit(limiter, identifier)

    // Create response headers
    const headers = new Headers({
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toISOString(),
    })

    if (!result.success) {
      if (result.retryAfter) {
        headers.set('Retry-After', result.retryAfter.toString())
      }

      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
        },
        { status: 429, headers }
      )
    }

    // Call the original handler
    const response = await handler(req)

    // Add rate limit headers to response
    result.limit && response.headers.set('X-RateLimit-Limit', result.limit.toString())
    result.remaining && response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
    response.headers.set('X-RateLimit-Reset', result.reset.toISOString())

    return response
  }
}

/**
 * Get identifier from Next.js request
 */
function getNextRequestIdentifier(req: NextRequest): string {
  // Check for authenticated user (would need to parse JWT or session)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // In a real implementation, you'd decode the JWT to get user ID
    // For now, we'll use the token itself as identifier
    return `token:${authHeader.slice(7, 27)}` // Use first 20 chars of token
  }

  // Check for API key
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    return `api:${apiKey}`
  }

  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || 'unknown'

  return `ip:${ip || 'anonymous'}`
}

/**
 * Middleware for rate limiting specific paths
 * Can be used in middleware.ts
 */
export async function rateLimitMiddleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Determine rate limiter based on path
  let limiterType: 'auth' | 'api' | 'search' = 'api'

  if (path.startsWith('/api/auth/')) {
    limiterType = 'auth'
  } else if (path.startsWith('/api/search/')) {
    limiterType = 'search'
  }

  // Select the appropriate rate limiter
  const limiter =
    limiterType === 'auth'
      ? authRateLimiter
      : limiterType === 'search'
        ? searchRateLimiter
        : apiRateLimiter

  // Get identifier from request
  const identifier = getNextRequestIdentifier(req)

  // Check rate limit
  const result = await checkRateLimit(limiter, identifier)

  if (!result.success) {
    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': result.reset.toISOString(),
    }

    if (result.retryAfter) {
      rateLimitHeaders['Retry-After'] = result.retryAfter.toString()
    }

    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    )
  }

  // Continue with the request
  return NextResponse.next({
    headers: {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toISOString(),
    },
  })
}

/**
 * Simple rate limit check for use in API routes
 * Returns true if request should be allowed, false if rate limited
 */
export async function checkApiRateLimit(
  req: NextRequest,
  limiterType: 'auth' | 'api' | 'search' = 'api'
): Promise<{ allowed: boolean; headers: Record<string, string> }> {
  const limiter =
    limiterType === 'auth'
      ? authRateLimiter
      : limiterType === 'search'
        ? searchRateLimiter
        : apiRateLimiter

  const identifier = getNextRequestIdentifier(req)
  const result = await checkRateLimit(limiter, identifier)

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toISOString(),
  }

  if (!result.success && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString()
  }

  return {
    allowed: result.success,
    headers,
  }
}
