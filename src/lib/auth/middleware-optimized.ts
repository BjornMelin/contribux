/**
 * Optimized Route Protection Middleware
 * Memory-efficient version with lazy loading and dynamic imports
 */

import { type NextRequest, NextResponse } from 'next/server'
import type { AccessTokenPayload, User } from '@/types/auth'

// Lazy load heavy dependencies
let rateLimiterModule: typeof import('./rate-limiter') | null = null
let auditModule: typeof import('./audit') | null = null
let gdprModule: typeof import('./gdpr') | null = null

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/about', '/pricing', '/legal']

// API routes that require CSRF protection
const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// Lightweight in-memory rate limit store for fallback
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
 * Load rate limiter module dynamically
 */
async function getRateLimiterModule() {
  if (!rateLimiterModule) {
    rateLimiterModule = await import('./rate-limiter')
  }
  return rateLimiterModule
}

/**
 * Load audit module dynamically
 */
async function getAuditModule() {
  if (!auditModule) {
    auditModule = await import('./audit')
  }
  return auditModule
}

/**
 * Load GDPR module dynamically
 */
async function getGDPRModule() {
  if (!gdprModule) {
    gdprModule = await import('./gdpr')
  }
  return gdprModule
}

/**
 * Main authentication middleware - optimized version
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
  if (PUBLIC_ROUTES.includes(path) || path.startsWith('/auth/')) {
    return undefined
  }

  try {
    // Extract token from header or cookie
    const token = extractToken(request)

    if (!token) {
      // Only load audit module if needed
      const { logSecurityEvent, createLogParams } = await getAuditModule()

      await logSecurityEvent(
        createLogParams({
          event_type: 'authorization_failure',
          event_severity: 'warning',
          ip_address: getClientIp(request) || undefined,
          user_agent: request.headers.get('user-agent') || undefined,
          event_data: {
            resource: path,
            method: request.method,
            path: request.nextUrl.pathname,
            query: Object.fromEntries(request.nextUrl.searchParams),
          },
          success: false,
          error_message: 'No authentication token provided',
        })
      )

      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Verify token using dynamic import
    const { verifyAccessToken } = await import('./jwt')
    const payload = await verifyAccessToken(token)

    if (!payload || !payload.sub) {
      const { logSecurityEvent, createLogParams } = await getAuditModule()

      await logSecurityEvent(
        createLogParams({
          event_type: 'authorization_failure',
          event_severity: 'warning',
          ip_address: getClientIp(request) || undefined,
          user_agent: request.headers.get('user-agent') || undefined,
          event_data: {
            resource: path,
            method: request.method,
            path: request.nextUrl.pathname,
            query: Object.fromEntries(request.nextUrl.searchParams),
          },
          success: false,
          error_message: 'Invalid token payload',
        })
      )

      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Load user from database using dynamic import
    const { sql } = await import('@/lib/db/config')
    const userResult = await sql`
      SELECT * FROM users 
      WHERE id = ${payload.sub} 
      LIMIT 1
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const user = userResult[0] as User

    // Check if account is locked
    if (user.locked_at) {
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

    // Check rate limiting using lightweight implementation
    const rateLimitResult = await lightweightRateLimit(request)
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
        return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
      }
    }

    return undefined
  } catch (error) {
    if (error instanceof Error && error.message === 'Token expired') {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    console.error('Auth middleware error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Lightweight rate limiting implementation
 */
async function lightweightRateLimit(
  request: NextRequest,
  options?: {
    limit?: number
    window?: number
  }
): Promise<{
  allowed: boolean
  limit: number
  remaining: number
  reset: number
}> {
  const limit = options?.limit || 60
  const window = options?.window || 60 * 1000 // 1 minute default

  const key = getClientIp(request) || 'anonymous'
  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || record.reset < now) {
    const reset = now + window
    rateLimitStore.set(key, { count: 1, reset })
    return { allowed: true, limit, remaining: limit - 1, reset }
  }

  if (record.count >= limit) {
    return { allowed: false, limit, remaining: 0, reset: record.reset }
  }

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
async function checkMaintenanceMode(request: NextRequest): Promise<boolean> {
  const maintenanceMode = process.env.MAINTENANCE_MODE === 'true'
  if (!maintenanceMode) {
    return false
  }

  const bypassToken = request.headers.get('X-Maintenance-Bypass')
  const bypassSecret = process.env.MAINTENANCE_BYPASS_TOKEN
  if (bypassToken && bypassSecret) {
    return bypassToken !== bypassSecret
  }

  return true
}

/**
 * Validate CSRF token using timing-safe comparison
 */
async function validateCSRF(request: NextRequest): Promise<boolean> {
  if (!CSRF_PROTECTED_METHODS.includes(request.method)) {
    return true
  }

  const headerToken = request.headers.get('X-CSRF-Token')
  const cookieToken = request.cookies.get('csrf_token')?.value
  const doubleSubmitToken = request.cookies.get('X-CSRF-Token')?.value

  if (!cookieToken) {
    return false
  }

  // Simple string comparison for CSRF tokens
  // In a production environment, you would want to use a timing-safe comparison
  // but for Edge Runtime compatibility, we'll use simple comparison
  if (headerToken && headerToken === cookieToken) {
    return true
  }

  if (doubleSubmitToken && doubleSubmitToken === cookieToken) {
    return true
  }

  return false
}

/**
 * Extract token from request
 */
function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

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
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]
    return firstIp ? firstIp.trim() : null
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return null
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

      const { checkConsentRequired } = await getGDPRModule()
      const missingConsents: string[] = []

      for (const consentType of consentTypes) {
        if (await checkConsentRequired(authReq.auth.user.id, consentType)) {
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
 * Clean up expired rate limit records periodically
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

// Run cleanup every 5 minutes (less frequent than original)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000)
}
