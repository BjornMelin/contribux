/**
 * Route Protection Middleware
 * Provides authentication, authorization, and security middleware for Next.js routes
 */

import { timingSafeEqual } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/config'
import type { AccessTokenPayload, User } from '@/types/auth'
import { logSecurityEvent } from './audit'
import { checkConsentRequired } from './gdpr'
import { verifyAccessToken } from './jwt'

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/about', '/pricing', '/legal']

// API routes that require CSRF protection
const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// Rate limiting storage (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; reset: number }>()

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

    // Load user from database
    const userResult = await sql`
      SELECT * FROM users 
      WHERE id = ${payload.sub} 
      LIMIT 1
    `

    if (userResult.length === 0) {
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
    if (!(req as NextRequest & { auth?: unknown }).auth) {
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
      const auth = (req as NextRequest & { auth?: { user: User } }).auth
      if (!auth) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const missingConsents: string[] = []

      for (const consentType of consentTypes) {
        if (await checkConsentRequired(auth.user.id, consentType)) {
          missingConsents.push(consentType)
        }
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
    const auth = (req as NextRequest & { auth?: { user: User } }).auth
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!auth.user.two_factor_enabled) {
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
 * Rate limiting implementation
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
  if (process.env.MAINTENANCE_MODE !== 'true') {
    return false
  }

  // Check for bypass token
  const bypassToken = request.headers.get('X-Maintenance-Bypass')
  if (bypassToken && process.env.MAINTENANCE_BYPASS_TOKEN) {
    return bypassToken !== process.env.MAINTENANCE_BYPASS_TOKEN
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

  await logSecurityEvent({
    event_type: options.event_type,
    event_severity: options.success ? 'info' : 'warning',
    user_id: auth?.user?.id,
    ip_address: ip,
    user_agent: userAgent,
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
    return forwarded.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback to request IP (may not be available in all environments)
  return null
}

/**
 * Clean up expired rate limit records (run periodically)
 */
export function cleanupRateLimits() {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.reset < now) {
      rateLimitStore.delete(key)
    }
  }
}

// Run cleanup every minute
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 60 * 1000)
}
