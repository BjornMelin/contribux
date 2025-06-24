/**
 * Route Protection Middleware
 * Provides authentication, authorization, and security middleware for Next.js routes
 */

import { timingSafeEqual } from 'crypto'
import Redis from 'ioredis'
import { type NextRequest, NextResponse } from 'next/server'
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible'
import { sql } from '@/lib/db/config'
import { env } from '@/lib/validation/env'
import type { AccessTokenPayload, User } from '@/types/auth'
import { createLogParams, logSecurityEvent } from './audit'
// import { checkConsentRequired } from './gdpr' // TODO: Re-enable when GDPR module is fully integrated
import { verifyAccessToken } from './jwt'

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/about', '/pricing', '/legal']

// API routes that require CSRF protection
const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// Rate limiting storage (fallback for in-memory when Redis unavailable)
const rateLimitStore = new Map<string, { count: number; reset: number }>()

// Redis client and rate limiter instances
let redisClient: Redis | null = null
let redisRateLimiter: RateLimiterRedis | null = null
let memoryRateLimiter: RateLimiterMemory | null = null
let redisAvailable = false

// Circuit breaker state for Redis failures
const circuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  timeout: 30000, // 30 seconds
  maxFailures: 5,
}

/**
 * Initialize Redis client and rate limiters
 */
function initializeRedis(): void {
  // Always initialize memory fallback first
  initializeMemoryRateLimiter()

  const redisUrl = env.REDIS_URL

  if (!redisUrl) {
    console.log('Redis URL not provided, using in-memory rate limiting fallback')
    return
  }

  try {
    redisClient = new Redis(redisUrl, {
      connectTimeout: 5000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      keepAlive: 30000,
      family: 0, // Use IPv4 and IPv6
    })

    // Configure Redis event handlers
    redisClient.on('connect', () => {
      console.log('Redis connected successfully')
      redisAvailable = true
      resetCircuitBreaker()
    })

    redisClient.on('error', error => {
      console.error('Redis connection error:', error)
      handleRedisFailure()
    })

    redisClient.on('close', () => {
      console.log('Redis connection closed')
      redisAvailable = false
    })

    // Initialize Redis rate limiter
    redisRateLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_middleware',
      points: 60, // Number of requests
      duration: 60, // Per 60 seconds
      blockDuration: 60, // Block for 60 seconds if limit exceeded
      execEvenly: true, // Execute requests evenly across duration
    })

    console.log('Redis rate limiter initialized')
  } catch (error) {
    console.error('Failed to initialize Redis:', error)
    handleRedisFailure()
  }
}

/**
 * Initialize memory-based rate limiter as fallback
 */
function initializeMemoryRateLimiter(): void {
  try {
    memoryRateLimiter = new RateLimiterMemory({
      keyPrefix: 'rl_memory',
      points: 60, // Number of requests
      duration: 60, // Per 60 seconds
      blockDuration: 60, // Block for 60 seconds if limit exceeded
      execEvenly: true,
    })
    console.log('Memory rate limiter initialized')
  } catch (error) {
    console.error('Failed to initialize memory rate limiter:', error)
    // Don't throw - allow the system to fall back to legacy implementation
  }
}

/**
 * Handle Redis failure and update circuit breaker
 */
function handleRedisFailure(): void {
  circuitBreakerState.failures++
  circuitBreakerState.lastFailure = Date.now()
  redisAvailable = false

  if (circuitBreakerState.failures >= circuitBreakerState.maxFailures) {
    circuitBreakerState.isOpen = true
    console.log('Circuit breaker opened due to Redis failures')
  }
}

/**
 * Reset circuit breaker state
 */
function resetCircuitBreaker(): void {
  circuitBreakerState.failures = 0
  circuitBreakerState.lastFailure = 0
  circuitBreakerState.isOpen = false
}

/**
 * Check if circuit breaker allows Redis usage
 */
function isCircuitBreakerOpen(): boolean {
  if (!circuitBreakerState.isOpen) {
    return false
  }

  // Check if timeout has passed
  if (Date.now() - circuitBreakerState.lastFailure > circuitBreakerState.timeout) {
    console.log('Circuit breaker timeout expired, attempting Redis reconnection')
    circuitBreakerState.isOpen = false
    circuitBreakerState.failures = Math.max(0, circuitBreakerState.failures - 1)
    return false
  }

  return true
}

/**
 * Get appropriate rate limiter based on availability
 */
function getRateLimiter(): RateLimiterRedis | RateLimiterMemory | null {
  if (redisRateLimiter && redisAvailable && !isCircuitBreakerOpen()) {
    return redisRateLimiter
  }

  if (!memoryRateLimiter) {
    try {
      initializeMemoryRateLimiter()
    } catch (error) {
      console.error('Failed to initialize memory rate limiter:', error)
      return null
    }
  }

  return memoryRateLimiter
}

// Initialize rate limiters on module load
initializeRedis()

// Extend NextRequest to include auth context
declare module 'next/server' {
  interface NextRequest {
    auth?: {
      user: User
      session_id: string
      token_payload: AccessTokenPayload
    }
  }
}

/**
 * Main authentication middleware
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse | undefined> {
  const path = request.nextUrl.pathname

  // Check maintenance mode first
  if (await checkMaintenanceMode(request)) {
    return NextResponse.json(
      { error: 'Service under maintenance', maintenance: true },
      { status: 503 }
    )
  }

  // Skip auth for public routes
  if (PUBLIC_ROUTES.includes(path)) {
    return undefined
  }

  // Skip auth for auth routes
  if (path.startsWith('/auth/')) {
    return undefined
  }

  try {
    // Extract token from header or cookie
    const token = extractToken(request)

    if (!token) {
      await auditRequest(request, {
        event_type: 'authorization_failure',
        resource: path,
        success: false,
        error: 'No authentication token provided',
      })

      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Verify token
    const payload = await verifyAccessToken(token)

    // Check if payload is valid and has required properties
    if (!payload || !payload.sub) {
      await auditRequest(request, {
        event_type: 'authorization_failure',
        resource: path,
        success: false,
        error: 'Invalid token payload',
      })

      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Load user from database
    const userResult = await sql`
      SELECT * FROM users 
      WHERE id = ${payload.sub} 
      LIMIT 1
    `

    if (!userResult || userResult.length === 0) {
      await auditRequest(request, {
        event_type: 'authorization_failure',
        resource: path,
        success: false,
        error: 'User not found',
      })

      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const user = userResult[0] as User

    // Check if account is locked
    if (user.locked_at) {
      await auditRequest(request, {
        event_type: 'authorization_failure',
        resource: path,
        success: false,
        error: 'Account locked',
      })

      return NextResponse.json({ error: 'Account locked' }, { status: 403 })
    }
    // Attach auth context to request
    ;(
      request as NextRequest & {
        auth: { user: User; session_id: string; token_payload: AccessTokenPayload }
      }
    ).auth = {
      user,
      session_id: payload.session_id,
      token_payload: payload,
    }

    // Check rate limiting
    const rateLimitResult = await rateLimit(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
            'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
          },
        }
      )
    }

    // Validate CSRF for mutations
    if (CSRF_PROTECTED_METHODS.includes(request.method)) {
      if (!(await validateCSRF(request))) {
        await auditRequest(request, {
          event_type: 'security_violation',
          resource: path,
          success: false,
          error: 'CSRF validation failed',
        })

        return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
      }
    }

    // Continue to route handler
    return undefined
  } catch (error) {
    // Handle specific errors
    if (error instanceof Error && error.message === 'Token expired') {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    // Log internal errors but don't expose details
    console.error('Auth middleware error:', error)

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Middleware decorator to require authentication
 */
export function requireAuth<T = unknown>(
  handler: (req: NextRequest, params: T) => Promise<NextResponse>,
  options?: { errorMessage?: string }
) {
  return async (req: NextRequest, params: T): Promise<NextResponse> => {
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string; token_payload: AccessTokenPayload }
    }
    if (!authReq.auth) {
      return NextResponse.json(
        { error: options?.errorMessage || 'Authentication required' },
        { status: 401 }
      )
    }

    return handler(req, params)
  }
}

/**
 * Middleware decorator to require specific consents
 */
export function requireConsent(consentTypes: string[]) {
  return <T = unknown>(handler: (req: NextRequest, params: T) => Promise<NextResponse>) => {
    return async (req: NextRequest, params: T): Promise<NextResponse> => {
      const authReq = req as NextRequest & {
        auth?: { user: User; session_id: string; token_payload: AccessTokenPayload }
      }
      if (!authReq.auth) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const missingConsents: string[] = []

      for (const consentType of consentTypes) {
        // TODO: Re-enable when GDPR module is fully integrated
        // if (await checkConsentRequired(authReq.auth.user.id, consentType)) {
        //   missingConsents.push(consentType)
        // }
      }

      if (missingConsents.length > 0) {
        return NextResponse.json(
          {
            error: 'Consent required',
            required_consents: missingConsents,
            consent_url: '/settings/privacy',
          },
          { status: 403 }
        )
      }

      return handler(req, params)
    }
  }
}

/**
 * Middleware decorator to require two-factor authentication
 */
export function requireTwoFactor<T = unknown>(
  handler: (req: NextRequest, params: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, params: T): Promise<NextResponse> => {
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string; token_payload: AccessTokenPayload }
    }
    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!authReq.auth.user.two_factor_enabled) {
      return NextResponse.json(
        {
          error: 'Two-factor authentication required',
          setup_url: '/settings/security/2fa',
        },
        { status: 403 }
      )
    }

    return handler(req, params)
  }
}

/**
 * Enhanced rate limiting implementation with Redis and in-memory fallback
 */
export async function rateLimit(
  request: NextRequest,
  options?: {
    limit?: number
    window?: number
    keyGenerator?: (req: NextRequest) => string
  }
): Promise<{
  allowed: boolean
  limit: number
  remaining: number
  reset: number
}> {
  const limit = options?.limit || 60
  const window = options?.window || 60 * 1000 // 1 minute default

  // Generate rate limit key
  const key = options?.keyGenerator
    ? options.keyGenerator(request)
    : getClientIp(request) || 'anonymous'

  try {
    // Get the appropriate rate limiter (Redis or memory)
    const rateLimiter = getRateLimiter()

    // If no rate limiter is available, fall back to legacy implementation
    if (!rateLimiter) {
      // Only warn if we expect Redis to be available and it's not a CI environment
      if (!process.env.CI && process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
        console.warn('No rate limiter available, using legacy fallback')
      }
      return await legacyRateLimit(request, options)
    }

    // Create custom rate limiter with specified options if different from defaults
    let customRateLimiter = rateLimiter
    if (limit !== 60 || window !== 60 * 1000) {
      try {
        if (redisRateLimiter && redisAvailable && !isCircuitBreakerOpen() && redisClient) {
          customRateLimiter = new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl_custom',
            points: limit,
            duration: Math.floor(window / 1000), // Convert to seconds
            blockDuration: Math.floor(window / 1000),
            execEvenly: true,
          })
        } else {
          customRateLimiter = new RateLimiterMemory({
            keyPrefix: 'rl_custom_memory',
            points: limit,
            duration: Math.floor(window / 1000), // Convert to seconds
            blockDuration: Math.floor(window / 1000),
            execEvenly: true,
          })
        }
      } catch (error) {
        // Only warn if this is a genuine configuration issue, not expected test behavior
        if (!process.env.CI && process.env.NODE_ENV !== 'test') {
          console.warn('Failed to create custom rate limiter, using default:', error)
        }
        customRateLimiter = rateLimiter
      }
    }

    // Attempt rate limiting
    // Check if consume method exists (for test environment compatibility)
    if (typeof customRateLimiter.consume !== 'function') {
      if (process.env.NODE_ENV === 'test') {
        // In test environment, if consume is not a function, use fallback silently
        return await legacyRateLimit(request, options)
      }
      throw new Error('Rate limiter consume method is not available')
    }

    const result = await customRateLimiter.consume(key)

    // Ensure result is defined and has the expected properties
    if (!result) {
      // Only warn about unexpected undefined results in development/production
      if (!process.env.CI && process.env.NODE_ENV !== 'test') {
        console.warn('Rate limiter returned undefined result, using fallback')
      }
      return await legacyRateLimit(request, options)
    }

    return {
      allowed: true,
      limit,
      remaining: result.remainingPoints !== undefined ? result.remainingPoints : limit - 1,
      reset: Date.now() + (result.msBeforeNext || window),
    }
  } catch (rejRes: unknown) {
    // Rate limit exceeded
    if (rejRes && typeof rejRes === 'object' && 'remainingPoints' in rejRes) {
      const rateLimitError = rejRes as { remainingPoints: number; msBeforeNext?: number }
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset: Date.now() + (rateLimitError.msBeforeNext || window),
      }
    }

    // Fallback to original implementation for any other errors
    // Only log errors that indicate real issues, not expected test failures
    if (!process.env.CI && process.env.NODE_ENV !== 'test') {
      console.error('Rate limiter error, falling back to basic implementation:', rejRes)
    }
    return await legacyRateLimit(request, options)
  }
}

/**
 * Legacy rate limiting implementation (fallback)
 */
async function legacyRateLimit(
  request: NextRequest,
  options?: {
    limit?: number
    window?: number
    keyGenerator?: (req: NextRequest) => string
  }
): Promise<{
  allowed: boolean
  limit: number
  remaining: number
  reset: number
}> {
  const limit = options?.limit || 60
  const window = options?.window || 60 * 1000 // 1 minute default

  // Generate rate limit key
  const key = options?.keyGenerator
    ? options.keyGenerator(request)
    : getClientIp(request) || 'anonymous'

  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || record.reset < now) {
    // Create new record
    const reset = now + window
    rateLimitStore.set(key, { count: 1, reset })

    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      reset,
    }
  }

  // Check if limit exceeded
  if (record.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      reset: record.reset,
    }
  }

  // Increment count
  record.count++
  rateLimitStore.set(key, record)

  return {
    allowed: true,
    limit,
    remaining: limit - record.count,
    reset: record.reset,
  }
}

/**
 * Check if maintenance mode is active
 */
export async function checkMaintenanceMode(request: NextRequest): Promise<boolean> {
  // Check process.env directly to allow for runtime changes (useful for testing)
  const maintenanceMode = process.env.MAINTENANCE_MODE === 'true'
  if (!maintenanceMode) {
    return false
  }

  // Check for bypass token
  const bypassToken = request.headers.get('X-Maintenance-Bypass')
  const bypassSecret = process.env.MAINTENANCE_BYPASS_TOKEN
  if (bypassToken && bypassSecret) {
    return bypassToken !== bypassSecret
  }

  return true
}

/**
 * Validate CSRF token
 */
export async function validateCSRF(request: NextRequest): Promise<boolean> {
  // Skip CSRF for safe methods
  if (!CSRF_PROTECTED_METHODS.includes(request.method)) {
    return true
  }

  // Get token from header
  const headerToken = request.headers.get('X-CSRF-Token')

  // Get token from cookie
  const cookieToken = request.cookies.get('csrf_token')?.value

  // Also check double-submit cookie pattern
  const doubleSubmitToken = request.cookies.get('X-CSRF-Token')?.value

  if (!cookieToken) {
    return false
  }

  // Validate using timing-safe comparison
  if (headerToken) {
    return timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))
  }

  if (doubleSubmitToken) {
    return timingSafeEqual(Buffer.from(doubleSubmitToken), Buffer.from(cookieToken))
  }

  return false
}

/**
 * Audit request for security logging
 */
export async function auditRequest(
  request: NextRequest,
  options: {
    event_type: string
    resource: string
    success: boolean
    error?: string
  }
) {
  const auth = (request as NextRequest & { auth?: { user: User; session_id: string } }).auth
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent')

  // Create parameters object with only defined values
  const logParams = createLogParams({
    event_type: options.event_type,
    event_severity: options.success ? 'info' : 'warning',
    user_id: auth?.user?.id,
    ip_address: ip || undefined,
    user_agent: userAgent || undefined,
    event_data: {
      resource: options.resource,
      method: request.method,
      session_id: auth?.session_id,
      path: request.nextUrl.pathname,
      query: Object.fromEntries(request.nextUrl.searchParams),
    },
    success: options.success,
    error_message: options.error,
  })

  await logSecurityEvent(logParams)
}

/**
 * Extract token from request
 */
function extractToken(request: NextRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Check cookie
  const cookieToken = request.cookies.get('access_token')?.value
  if (cookieToken) {
    return cookieToken
  }

  return null
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string | null {
  // Check various headers for IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]
    return firstIp ? firstIp.trim() : null
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback to request IP (may not be available in all environments)
  return null
}

/**
 * Get rate limiter status and configuration
 */
export function getRateLimiterStatus(): {
  redisAvailable: boolean
  memoryFallbackActive: boolean
  circuitBreakerOpen: boolean
  redisFailures: number
  activeStore: 'redis' | 'memory' | 'legacy'
} {
  const isRedisActive = redisRateLimiter && redisAvailable && !isCircuitBreakerOpen()

  return {
    redisAvailable,
    memoryFallbackActive: !!memoryRateLimiter,
    circuitBreakerOpen: circuitBreakerState.isOpen,
    redisFailures: circuitBreakerState.failures,
    activeStore: isRedisActive ? 'redis' : memoryRateLimiter ? 'memory' : 'legacy',
  }
}

/**
 * Graceful shutdown for Redis connections
 */
export async function shutdownRateLimiter(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit()
      console.log('Redis connection closed gracefully')
    } catch (error) {
      console.error('Error closing Redis connection:', error)
    }
  }
}

/**
 * Clean up expired rate limit records (run periodically for legacy fallback)
 */
export function cleanupRateLimits() {
  const now = Date.now()
  const entries = Array.from(rateLimitStore.entries())
  for (const [key, record] of entries) {
    if (record.reset < now) {
      rateLimitStore.delete(key)
    }
  }
}

// Run cleanup every minute for legacy store
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 60 * 1000)
}

// Graceful shutdown on process termination
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    await shutdownRateLimiter()
  })

  process.on('SIGINT', async () => {
    await shutdownRateLimiter()
  })
}
