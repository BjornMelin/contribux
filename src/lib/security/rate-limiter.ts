/**
 * Rate Limiting Module
 * Provides distributed rate limiting using Upstash Redis with sliding window algorithm
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { type NextRequest, NextResponse } from 'next/server'

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
  // Authentication endpoints - stricter limits to prevent brute force
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Reduced from 100 for better security
    message: 'Too many authentication attempts. Please try again later.',
  },

  // General API endpoints - balanced for normal usage
  api: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // Standard rate for API calls
    message: 'API rate limit exceeded. Please try again later.',
  },

  // Search endpoints - moderate limits due to computational cost
  search: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Reduced from 60 for better performance
    message: 'Search rate limit exceeded. Please try again in a minute.',
  },

  // WebAuthn/MFA endpoints - very strict limits
  webauthn: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Very strict for security-critical operations
    message: 'WebAuthn rate limit exceeded. Please wait before trying again.',
  },

  // GitHub webhooks - higher limits for legitimate traffic
  webhook: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Higher for webhook bursts
    message: 'Webhook rate limit exceeded.',
  },

  // Admin endpoints - very strict limits
  admin: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Lower limit for admin operations
    message: 'Admin rate limit exceeded. Please contact support.',
  },

  // Public endpoints - moderate limits
  public: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Generous for public access
    message: 'Public API rate limit exceeded. Please try again later.',
  },

  // Analytics/monitoring endpoints - strict limits
  analytics: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limited to prevent abuse
    message: 'Analytics rate limit exceeded.',
  },

  // Security reporting endpoints - strict limits with allowance for legitimate reports
  security: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Strict to prevent spam
    message: 'Security reporting rate limit exceeded.',
  },

  // Demo endpoints - very strict limits
  demo: {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Very low for demo purposes
    message: 'Demo rate limit exceeded. This is a demonstration endpoint.',
  },
} as const

/**
 * Create a rate limiter instance
 */
function createRateLimiter(config: { windowMs: number; max: number; message?: string }) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    // Enhanced fallback rate limiter with in-memory storage
    const fallbackStorage = new Map<string, { count: number; resetTime: number }>()

    // Cleanup expired entries every 5 minutes
    setInterval(
      () => {
        const now = Date.now()
        for (const [key, value] of fallbackStorage.entries()) {
          if (now > value.resetTime) {
            fallbackStorage.delete(key)
          }
        }
      },
      5 * 60 * 1000
    )

    return {
      limit: async (identifier: string) => {
        const now = Date.now()
        const resetTime = now + config.windowMs
        const existing = fallbackStorage.get(identifier)

        if (!existing || now > existing.resetTime) {
          // Reset or create new entry
          fallbackStorage.set(identifier, { count: 1, resetTime })
          return {
            success: true,
            limit: config.max,
            remaining: config.max - 1,
            reset: resetTime,
          }
        }

        if (existing.count >= config.max) {
          return {
            success: false,
            limit: config.max,
            remaining: 0,
            reset: existing.resetTime,
          }
        }

        existing.count++
        return {
          success: true,
          limit: config.max,
          remaining: config.max - existing.count,
          reset: existing.resetTime,
        }
      },
    }
  }

  const redis = new Redis({ url, token })

  // Enhanced production rate limiter with analytics and monitoring
  return new Ratelimit({
    redis,
    // Use sliding window for more accurate rate limiting
    limiter: Ratelimit.slidingWindow(config.max, `${config.windowMs}ms`),
    // Add analytics for monitoring
    analytics: true,
    // Add ephemeral cache for better performance
    ephemeralCache: new Map(),
    // Custom prefix for better organization
    prefix: '@contribux/ratelimit',
    // Add timeout for Redis operations
    timeout: 5000,
  })
}

/**
 * Rate limiters for different endpoint types
 */
export const authRateLimiter = createRateLimiter(rateLimitConfigs.auth)
export const apiRateLimiter = createRateLimiter(rateLimitConfigs.api)
export const searchRateLimiter = createRateLimiter(rateLimitConfigs.search)
export const webauthnRateLimiter = createRateLimiter(rateLimitConfigs.webauthn)
export const webhookRateLimiter = createRateLimiter(rateLimitConfigs.webhook)
export const adminRateLimiter = createRateLimiter(rateLimitConfigs.admin)
export const publicRateLimiter = createRateLimiter(rateLimitConfigs.public)
export const analyticsRateLimiter = createRateLimiter(rateLimitConfigs.analytics)
export const securityRateLimiter = createRateLimiter(rateLimitConfigs.security)
export const demoRateLimiter = createRateLimiter(rateLimitConfigs.demo)

/**
 * Check rate limit for a given identifier
 * @param limiter - The rate limiter instance to use
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @returns Rate limit result with success status and metadata
 */
export async function checkRateLimit(
  limiter: ReturnType<typeof createRateLimiter>,
  identifier: string,
  _context?: { endpoint?: string; method?: string; userAgent?: string }
) {
  try {
    const startTime = Date.now()
    const result = await limiter.limit(identifier)
    const duration = Date.now() - startTime

    // Log rate limit check for monitoring
    if (process.env.NODE_ENV === 'production') {
    }

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: new Date(result.reset),
      retryAfter: result.success ? null : Math.ceil((result.reset - Date.now()) / 1000),
      duration, // Add timing information
    }
  } catch (_error) {
    // Graceful fallback - allow request but log the issue
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: new Date(),
      retryAfter: null,
      duration: 0,
      error: true, // Flag to indicate error occurred
    }
  }
}

/**
 * Enhanced rate limiting middleware with comprehensive endpoint support
 * Automatically selects appropriate rate limiter based on request path
 */
export async function enhancedRateLimitMiddleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  const method = req.method
  const userAgent = req.headers.get('user-agent') || 'unknown'

  // Determine rate limiter based on path with enhanced routing
  let limiter: ReturnType<typeof createRateLimiter>
  let limiterType: keyof typeof rateLimitConfigs

  // Security-critical endpoints
  if (path.startsWith('/api/auth/')) {
    limiter = authRateLimiter
    limiterType = 'auth'
  } else if (path.startsWith('/api/security/webauthn/')) {
    limiter = webauthnRateLimiter
    limiterType = 'webauthn'
  } else if (path.startsWith('/api/security/')) {
    limiter = securityRateLimiter
    limiterType = 'security'
  } else if (path.startsWith('/api/webhooks/')) {
    limiter = webhookRateLimiter
    limiterType = 'webhook'
  } else if (path.startsWith('/api/search/')) {
    limiter = searchRateLimiter
    limiterType = 'search'
  } else if (path.startsWith('/api/admin/') || path.includes('/admin/')) {
    limiter = adminRateLimiter
    limiterType = 'admin'
  } else if (
    path.startsWith('/api/analytics/') ||
    path.startsWith('/api/metrics/') ||
    path.startsWith('/api/monitoring/')
  ) {
    limiter = analyticsRateLimiter
    limiterType = 'analytics'
  } else if (path.startsWith('/api/demo/')) {
    limiter = demoRateLimiter
    limiterType = 'demo'
  } else if (path.startsWith('/api/health/') || path.startsWith('/api/simple-health/')) {
    limiter = publicRateLimiter
    limiterType = 'public'
  } else if (path.startsWith('/api/')) {
    limiter = apiRateLimiter
    limiterType = 'api'
  } else {
    // No rate limiting for non-API routes
    return NextResponse.next()
  }

  // Get identifier from request with enhanced detection
  const identifier = getEnhancedRequestIdentifier(req)

  // Check rate limit with context
  const result = await checkRateLimit(limiter, identifier, {
    endpoint: path,
    method,
    userAgent,
  })

  if (!result.success) {
    const config = rateLimitConfigs[limiterType]
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

  // Add rate limit headers to successful responses
  const responseHeaders: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toISOString(),
    'X-RateLimit-Policy': `${rateLimitConfigs[limiterType].max} requests per ${rateLimitConfigs[limiterType].windowMs}ms`,
  }

  return NextResponse.next({
    headers: responseHeaders,
  })
}

/**
 * Enhanced request identifier with better user and context detection
 */
export function getEnhancedRequestIdentifier(req: NextRequest): string {
  // 1. Try to get authenticated user ID from session or JWT
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      // Extract user ID from JWT token (you might need to implement this)
      const tokenPayload = parseJWTPayload(authHeader.slice(7))
      if (tokenPayload?.sub) {
        return `user:${tokenPayload.sub}`
      }
    } catch {
      // Fall through to other methods
    }
  }

  // 2. Check for API key in various headers
  const apiKey = req.headers.get('x-api-key') || req.headers.get('api-key')
  if (apiKey) {
    return `api:${apiKey.substring(0, 16)}` // Use first 16 chars for privacy
  }

  // 3. Check for session cookie
  const sessionCookie = req.cookies.get('next-auth.session-token')
  if (sessionCookie) {
    return `session:${sessionCookie.value.substring(0, 16)}`
  }

  // 4. Get client IP with enhanced detection
  const clientIP = getClientIP(req)

  // 5. Add user agent fingerprint for better identification
  const userAgent = req.headers.get('user-agent')
  if (userAgent) {
    const uaHash = simpleHash(userAgent)
    return `ip:${clientIP}:${uaHash}`
  }

  return `ip:${clientIP}`
}

/**
 * Enhanced client IP detection with multiple fallbacks
 */
export function getClientIP(req: NextRequest): string {
  // Check various headers in order of preference
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded',
    'cf-connecting-ip', // Cloudflare
    'true-client-ip', // Cloudflare
    'x-vercel-forwarded-for', // Vercel
  ]

  for (const header of headers) {
    const value = req.headers.get(header)
    if (value) {
      // Handle comma-separated IPs (take the first one)
      const ip = value.split(',')[0]?.trim()
      if (ip && ip !== 'unknown') {
        return ip
      }
    }
  }

  // Fallback to a default value
  return '127.0.0.1'
}

/**
 * Simple hash function for user agent fingerprinting
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8)
}

/**
 * Parse JWT payload without verification (for identifier purposes only)
 */
/**
 * JWT payload interface
 */
interface JWTPayload {
  sub?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  iss?: string
  jti?: string
  [key: string]: unknown
}

function parseJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64').toString()
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Rate limit configuration selector for custom implementations
 */
export function getRateLimiterForEndpoint(path: string): {
  limiter: ReturnType<typeof createRateLimiter>
  config: (typeof rateLimitConfigs)[keyof typeof rateLimitConfigs]
  type: keyof typeof rateLimitConfigs
} {
  let limiter: ReturnType<typeof createRateLimiter>
  let type: keyof typeof rateLimitConfigs

  if (path.startsWith('/api/auth/')) {
    limiter = authRateLimiter
    type = 'auth'
  } else if (path.startsWith('/api/security/webauthn/')) {
    limiter = webauthnRateLimiter
    type = 'webauthn'
  } else if (path.startsWith('/api/security/')) {
    limiter = securityRateLimiter
    type = 'security'
  } else if (path.startsWith('/api/webhooks/')) {
    limiter = webhookRateLimiter
    type = 'webhook'
  } else if (path.startsWith('/api/search/')) {
    limiter = searchRateLimiter
    type = 'search'
  } else if (path.startsWith('/api/admin/') || path.includes('/admin/')) {
    limiter = adminRateLimiter
    type = 'admin'
  } else if (
    path.startsWith('/api/analytics/') ||
    path.startsWith('/api/metrics/') ||
    path.startsWith('/api/monitoring/')
  ) {
    limiter = analyticsRateLimiter
    type = 'analytics'
  } else if (path.startsWith('/api/demo/')) {
    limiter = demoRateLimiter
    type = 'demo'
  } else if (path.startsWith('/api/health/') || path.startsWith('/api/simple-health/')) {
    limiter = publicRateLimiter
    type = 'public'
  } else {
    limiter = apiRateLimiter
    type = 'api'
  }

  return {
    limiter,
    config: rateLimitConfigs[type],
    type,
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
