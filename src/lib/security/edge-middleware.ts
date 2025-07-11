/**
 * Edge Middleware Security Module
 * Advanced security middleware for Edge Runtime compatibility
 */

import { type NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { generateNonce } from '@/lib/security/csp'
import { applyCORSHeaders, applySecurityHeaders } from '@/lib/security/csp-cors'
import { enhancedRateLimitMiddleware } from '@/lib/security/rate-limiter'
import { isDevelopment, isProduction } from '@/lib/validation/env'

export interface MiddlewareConfig {
  enableCSP: boolean
  enableCORS: boolean
  enableRateLimit: boolean
  enableAuth: boolean
  skipAuthPaths: string[]
  publicPaths: string[]
  apiPaths: string[]
}

/**
 * Default middleware configuration
 */
export const defaultMiddlewareConfig: MiddlewareConfig = {
  enableCSP: true,
  enableCORS: true,
  enableRateLimit: true,
  enableAuth: true,
  skipAuthPaths: ['/_next/', '/api/_next/', '/favicon.ico', '/api/health', '/api/auth/', '/auth/'],
  publicPaths: ['/', '/about', '/pricing', '/legal', '/privacy', '/terms'],
  apiPaths: ['/api/'],
}

/**
 * Enhanced security middleware factory
 */
export function createSecurityMiddleware(config: Partial<MiddlewareConfig> = {}) {
  const finalConfig = { ...defaultMiddlewareConfig, ...config }

  return async function securityMiddleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const response = NextResponse.next()

    // Early return for static assets
    if (shouldSkipMiddleware(pathname, finalConfig)) {
      return response
    }

    // Generate nonce for CSP
    const nonce = generateNonce()

    // Clone request headers and add nonce
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)

    // Create enhanced response with updated headers
    const enhancedResponse = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })

    // Apply rate limiting if enabled
    if (finalConfig.enableRateLimit) {
      const rateLimitResponse = await enhancedRateLimitMiddleware(request)
      if (rateLimitResponse.status === 429) {
        return rateLimitResponse
      }

      // Merge rate limit headers
      mergeHeaders(enhancedResponse, rateLimitResponse)
    }

    // Apply authentication if enabled
    if (finalConfig.enableAuth) {
      const authResponse = await handleAuthentication(request, finalConfig)
      if (authResponse) {
        return authResponse
      }
    }

    // Apply security headers if enabled
    if (finalConfig.enableCSP) {
      applySecurityHeaders(enhancedResponse, nonce)
    }

    // Apply CORS headers for API routes if enabled
    if (finalConfig.enableCORS && isApiRoute(pathname, finalConfig)) {
      applyCORSHeaders(enhancedResponse, request)
    }

    // Add request ID for tracing
    enhancedResponse.headers.set('X-Request-ID', generateRequestId())

    // Add response time header
    enhancedResponse.headers.set('X-Response-Time', Date.now().toString())

    return enhancedResponse
  }
}

/**
 * Check if middleware should be skipped for this path
 */
function shouldSkipMiddleware(pathname: string, config: MiddlewareConfig): boolean {
  // Skip for static files
  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return true
  }

  // Skip for Next.js internals
  if (pathname.startsWith('/_next/')) {
    return true
  }

  // Skip for configured paths
  return config.skipAuthPaths.some(path => pathname.startsWith(path))
}

/**
 * Check if path is an API route
 */
function isApiRoute(pathname: string, config: MiddlewareConfig): boolean {
  return config.apiPaths.some(path => pathname.startsWith(path))
}

/**
 * Handle authentication for protected routes
 */
async function handleAuthentication(
  request: NextRequest,
  config: MiddlewareConfig
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl

  // Skip authentication for public paths
  if (config.publicPaths.includes(pathname)) {
    return null
  }

  // Skip authentication for configured paths
  if (config.skipAuthPaths.some(path => pathname.startsWith(path))) {
    return null
  }

  // Extract and verify token
  const token = extractToken(request)
  if (!token) {
    return createUnauthorizedResponse('Authentication required')
  }

  try {
    const payload = await verifyAccessToken(token)
    if (!payload || !payload.sub) {
      return createUnauthorizedResponse('Invalid token')
    }

    // Token is valid, continue
    return null
  } catch (_error) {
    if (isDevelopment()) {
    }
    return createUnauthorizedResponse('Authentication failed')
  }
}

/**
 * Extract authentication token from request
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

  // Check query parameter (less secure, for development only)
  if (isDevelopment()) {
    const urlToken = request.nextUrl.searchParams.get('token')
    if (urlToken) {
      return urlToken
    }
  }

  return null
}

/**
 * Create unauthorized response
 */
function createUnauthorizedResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="contribux", error="invalid_token"',
        'Cache-Control': 'no-store',
      },
    }
  )
}

/**
 * Merge headers from one response to another
 */
function mergeHeaders(target: NextResponse, source: NextResponse): void {
  const headersToCopy = [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-RateLimit-Policy',
    'Retry-After',
  ]

  for (const header of headersToCopy) {
    const value = source.headers.get(header)
    if (value) {
      target.headers.set(header, value)
    }
  }
}

/**
 * Generate unique request ID for tracing
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 10)
  return `req_${timestamp}_${randomPart}`
}

/**
 * Security event logger for middleware
 */
export interface SecurityEvent {
  type: 'auth_failure' | 'rate_limit' | 'csp_violation' | 'cors_violation' | 'suspicious_request'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  metadata: Record<string, any>
  timestamp: string
  requestId: string
  userAgent?: string
  ip?: string
  path: string
}

/**
 * Log security events (placeholder for external service integration)
 */
export function logSecurityEvent(_event: SecurityEvent): void {
  if (isDevelopment()) {
  }

  // In production, this would send to your security monitoring service
  // Example: Sentry, Datadog, custom logging service, etc.
  if (isProduction()) {
    // Example implementation:
    // await fetch('/api/security/events', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(event),
    // })
  }
}

/**
 * Create security event from request
 */
export function createSecurityEvent(
  type: SecurityEvent['type'],
  severity: SecurityEvent['severity'],
  message: string,
  request: NextRequest,
  metadata: Record<string, any> = {}
): SecurityEvent {
  return {
    type,
    severity,
    message,
    metadata,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId(),
    userAgent: request.headers.get('user-agent') || undefined,
    ip: getClientIP(request),
    path: request.nextUrl.pathname,
  }
}

/**
 * Get client IP address from request
 */
function getClientIP(request: NextRequest): string | undefined {
  // Check for forwarded IP headers (common in production)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  const cfIP = request.headers.get('cf-connecting-ip')
  if (cfIP) {
    return cfIP
  }

  // Fallback to request.ip if available
  return request.ip || undefined
}

/**
 * Validate request against security policies
 */
export function validateRequest(request: NextRequest): { valid: boolean; violations: string[] } {
  const violations: string[] = []

  // Check for suspicious user agents
  const userAgent = request.headers.get('user-agent')
  if (!userAgent || userAgent.length < 10) {
    violations.push('Suspicious or missing user agent')
  }

  // Check for suspicious headers
  const suspiciousHeaders = ['x-forwarded-host', 'x-originating-ip', 'x-cluster-client-ip']
  for (const header of suspiciousHeaders) {
    if (request.headers.get(header)) {
      violations.push(`Potentially dangerous header: ${header}`)
    }
  }

  // Check request size (basic protection against large payloads)
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number.parseInt(contentLength) > 10 * 1024 * 1024) {
    // 10MB limit
    violations.push('Request payload too large')
  }

  // Check for common attack patterns in URL
  const { pathname, search } = request.nextUrl
  const fullPath = pathname + search
  const attackPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
  ]

  for (const pattern of attackPatterns) {
    if (pattern.test(fullPath)) {
      violations.push(`Suspicious pattern detected in URL: ${pattern.source}`)
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  }
}

/**
 * Default security middleware instance
 */
export const securityMiddleware = createSecurityMiddleware()

/**
 * Export commonly used configurations
 */
export const middlewareConfigs = {
  // Minimal security for development
  development: {
    enableCSP: false,
    enableRateLimit: false,
    enableAuth: false,
  },

  // Full security for production
  production: {
    enableCSP: true,
    enableCORS: true,
    enableRateLimit: true,
    enableAuth: true,
  },

  // API-only security
  apiOnly: {
    enableCSP: false,
    enableCORS: true,
    enableRateLimit: true,
    enableAuth: true,
    publicPaths: [],
    apiPaths: ['/api/'],
  },
} as const

// Export configuration constants for tests
export const RATE_LIMIT_CONFIG = {
  global: {
    window: 60000, // 1 minute
    requests: 1000,
  },
  perIp: {
    window: 60000, // 1 minute
    requests: 100,
  },
  perUser: {
    window: 60000, // 1 minute
    requests: 200,
  },
} as const

export const DDOS_CONFIG = {
  burstThreshold: 50, // requests per burst window
  burstWindow: 10000, // 10 seconds
  blockDuration: 300000, // 5 minutes
  suspiciousThreshold: 25,
} as const

export const GEO_BLOCKING_CONFIG = {
  blockedCountries: ['CN', 'RU', 'KP', 'IR'],
  allowedCountries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK'],
  enableStrictMode: isProduction(),
} as const

export const BOT_DETECTION_CONFIG = {
  maxFingerprints: 1000,
  fingerprintWindow: 3600000, // 1 hour
  suspiciousPatterns: [
    /bot/i,
    /spider/i,
    /crawler/i,
    /scraper/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /puppeteer/i,
  ],
} as const

/**
 * Enhanced edge middleware function for tests
 */
export async function enhancedEdgeMiddleware(
  request: NextRequest
): Promise<NextResponse | undefined> {
  try {
    const middleware = createSecurityMiddleware()
    const response = await middleware(request)

    // Return undefined for allowed requests (200 status)
    if (response && response.status === 200) {
      return undefined
    }

    // Return response for blocked/rate-limited requests
    return response || undefined
  } catch (_error) {
    if (isDevelopment()) {
    }
    return undefined
  }
}
