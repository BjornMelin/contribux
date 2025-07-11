/**
 * Next.js API Route Rate Limiting Middleware
 * Provides easy-to-use rate limiting for Next.js API routes
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  checkRateLimit,
  getRateLimiterForEndpoint,
  getEnhancedRequestIdentifier,
} from './rate-limiter'

/**
 * Map limiter type to endpoint path
 */
function getLimiterEndpoint(
  limiterType: 'auth' | 'api' | 'search' | 'webauthn' | 'webhook' | 'admin' | 'public' | 'analytics' | 'security' | 'demo'
): string {
  const endpointMap: Record<typeof limiterType, string> = {
    auth: '/api/auth/',
    search: '/api/search/',
    webauthn: '/api/security/webauthn/',
    webhook: '/api/webhooks/',
    admin: '/api/admin/',
    public: '/api/health/',
    analytics: '/api/analytics/',
    security: '/api/security/',
    demo: '/api/demo/',
    api: '/api/'
  }
  
  return endpointMap[limiterType]
}

/**
 * Simple rate limit check for backwards compatibility
 * @param handler - The API route handler function
 * @param limiterType - The type of rate limiter to use
 */
export function withBasicRateLimit(
  handler: (req: NextRequest) => Promise<Response>,
  limiterType: 'auth' | 'api' | 'search' = 'api'
) {
  return withRateLimit(handler, { limiterType })
}

/**
 * Get identifier from Next.js request
 */
function _getNextRequestIdentifier(req: NextRequest): string {
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

  // Use the enhanced rate limiting system
  const { limiter, config, type } = getRateLimiterForEndpoint(path)

  // Get identifier from request
  const identifier = getEnhancedRequestIdentifier(req)

  // Check rate limit with context
  const result = await checkRateLimit(limiter, identifier, {
    endpoint: path,
    method: req.method,
    userAgent: req.headers.get('user-agent') || 'unknown',
  })

  if (!result.success) {
    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': result.reset.toISOString(),
      'X-RateLimit-Policy': `${config.max} requests per ${config.windowMs}ms`,
    }

    if (result.retryAfter) {
      rateLimitHeaders['Retry-After'] = result.retryAfter.toString()
    }

    return NextResponse.json(
      {
        error: 'Rate Limit Exceeded',
        message: config.message || 'Rate limit exceeded. Please try again later.',
        type: 'RATE_LIMIT_EXCEEDED',
        retryAfter: result.retryAfter,
        limit: result.limit,
        remaining: 0,
        reset: result.reset.toISOString(),
        endpoint: path,
        policy: `${config.max} requests per ${config.windowMs}ms`,
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    )
  }

  // Continue with the request, adding rate limit headers
  return NextResponse.next({
    headers: {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toISOString(),
      'X-RateLimit-Policy': `${config.max} requests per ${config.windowMs}ms`,
    },
  })
}

/**
 * Simple rate limit check for use in API routes
 * Returns true if request should be allowed, false if rate limited
 */
export async function checkApiRateLimit(
  req: NextRequest,
  limiterType:
    | 'auth'
    | 'api'
    | 'search'
    | 'webauthn'
    | 'webhook'
    | 'admin'
    | 'public'
    | 'analytics'
    | 'security'
    | 'demo' = 'api'
): Promise<{ allowed: boolean; headers: Record<string, string> }> {
  const endpoint = getLimiterEndpoint(limiterType)
  const { limiter, config } = getRateLimiterForEndpoint(endpoint)

  const identifier = getEnhancedRequestIdentifier(req)
  const result = await checkRateLimit(limiter, identifier, {
    endpoint: req.nextUrl.pathname,
    method: req.method,
    userAgent: req.headers.get('user-agent') || 'unknown',
  })

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toISOString(),
    'X-RateLimit-Policy': `${config.max} requests per ${config.windowMs}ms`,
  }

  if (!result.success && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString()
  }

  return {
    allowed: result.success,
    headers,
  }
}

/**
 * Comprehensive rate limiting wrapper for API routes
 * Automatically handles rate limiting and returns appropriate responses
 */
export function withRateLimit<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<Response>,
  options: {
    limiterType?:
      | 'auth'
      | 'api'
      | 'search'
      | 'webauthn'
      | 'webhook'
      | 'admin'
      | 'public'
      | 'analytics'
      | 'security'
      | 'demo'
    customIdentifier?: (req: NextRequest) => string
    skipRateLimit?: (req: NextRequest) => boolean
  } = {}
) {
  return async (req: NextRequest, ...args: T) => {
    // Allow skipping rate limit for certain conditions
    if (options.skipRateLimit?.(req)) {
      return handler(req, ...args)
    }

    // Get the rate limiter configuration
    const endpoint = options.limiterType ? getLimiterEndpoint(options.limiterType) : req.nextUrl.pathname
    const { limiter, config, type } = getRateLimiterForEndpoint(endpoint)

    // Get identifier (custom or default)
    const identifier = options.customIdentifier?.(req) || getEnhancedRequestIdentifier(req)

    // Check rate limit
    const result = await checkRateLimit(limiter, identifier, {
      endpoint: req.nextUrl.pathname,
      method: req.method,
      userAgent: req.headers.get('user-agent') || 'unknown',
    })

    // Create response headers
    const rateLimitHeaders = new Headers({
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toISOString(),
      'X-RateLimit-Policy': `${config.max} requests per ${config.windowMs}ms`,
    })

    if (!result.success) {
      if (result.retryAfter) {
        rateLimitHeaders.set('Retry-After', result.retryAfter.toString())
      }

      return NextResponse.json(
        {
          error: 'Rate Limit Exceeded',
          message: config.message || 'Rate limit exceeded. Please try again later.',
          type: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter,
          limit: result.limit,
          remaining: 0,
          reset: result.reset.toISOString(),
          endpoint: req.nextUrl.pathname,
          policy: `${config.max} requests per ${config.windowMs}ms`,
        },
        { status: 429, headers: rateLimitHeaders }
      )
    }

    // Call the original handler
    const response = await handler(req, ...args)

    // Add rate limit headers to response
    for (const [key, value] of rateLimitHeaders) {
      response.headers.set(key, value)
    }

    return response
  }
}

/**
 * Simple rate limit check for conditional logic in API routes
 */
export async function checkApiRateLimitStatus(
  req: NextRequest,
  options: {
    limiterType?:
      | 'auth'
      | 'api'
      | 'search'
      | 'webauthn'
      | 'webhook'
      | 'admin'
      | 'public'
      | 'analytics'
      | 'security'
      | 'demo'
    customIdentifier?: string
  } = {}
): Promise<{
  success: boolean
  limit: number
  remaining: number
  reset: Date
  retryAfter: number | null
  headers: Record<string, string>
}> {
  const endpoint = options.limiterType ? getLimiterEndpoint(options.limiterType) : req.nextUrl.pathname
  const { limiter, config } = getRateLimiterForEndpoint(endpoint)

  const identifier = options.customIdentifier || getEnhancedRequestIdentifier(req)
  const result = await checkRateLimit(limiter, identifier, {
    endpoint: req.nextUrl.pathname,
    method: req.method,
    userAgent: req.headers.get('user-agent') || 'unknown',
  })

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toISOString(),
    'X-RateLimit-Policy': `${config.max} requests per ${config.windowMs}ms`,
  }

  if (!result.success && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString()
  }

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfter: result.retryAfter,
    headers,
  }
}
