/**
 * Next.js Middleware for CSP Nonce Generation, Security Headers, and Authentication
 * Edge Runtime compatible - lightweight authentication check only
 */

import { type NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { buildCSP, generateNonce, getCSPDirectives } from '@/lib/security/csp'
import { isProduction, env } from '@/lib/validation/env'
import { enhancedRateLimitMiddleware } from '@/lib/security/rate-limiter'

export async function middleware(request: NextRequest) {
  // Apply enhanced rate limiting first
  const rateLimitResponse = await enhancedRateLimitMiddleware(request)
  if (rateLimitResponse.status === 429) {
    return rateLimitResponse
  }

  // Lightweight auth check for Edge Runtime compatibility
  const authResponse = await lightweightAuthCheck(request)
  if (authResponse) {
    return authResponse
  }

  // Generate unique nonce for this request
  const nonce = generateNonce()

  // Clone the request headers
  const requestHeaders = new Headers(request.headers)

  // Store nonce in request headers for later use
  requestHeaders.set('x-nonce', nonce)

  // Create response with updated headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Build CSP with nonce
  const csp = buildCSP(getCSPDirectives(), nonce)

  // Set security headers
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=(), display-capture=(), screen-wake-lock=(), web-share=()')

  // Enhanced security headers for modern web security
  if (isProduction()) {
    // HTTP Strict Transport Security (HSTS) - 2 years, include subdomains, preload
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    
    // Cross-Origin policies for enhanced security
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Cross-Origin-Resource-Policy', 'same-site')
    
    // Network Error Logging for monitoring
    response.headers.set('NEL', JSON.stringify({
      report_to: 'network-errors',
      max_age: 86400,
      include_subdomains: true,
      success_fraction: 0.01,
      failure_fraction: 1.0
    }))
    
    // Report-To header for modern reporting
    response.headers.set('Report-To', JSON.stringify([
      {
        group: 'csp-violations',
        max_age: 86400,
        endpoints: [{ url: '/api/security/csp-report' }]
      },
      {
        group: 'network-errors',
        max_age: 86400,
        endpoints: [{ url: '/api/security/network-report' }]
      }
    ]))
  } else {
    // Development-specific security headers (less strict)
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    response.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none')
    response.headers.set('Cross-Origin-Opener-Policy', 'unsafe-none')
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  }

  // Additional security headers for all environments
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  
  // Remove potentially dangerous headers
  response.headers.delete('X-Powered-By')
  response.headers.delete('Server')

  // Set CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const allowedOrigin = isProduction()
      ? 'https://contribux.vercel.app'
      : env.NEXTAUTH_URL || 'http://localhost:3000'

    response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Policy')
  }

  // Merge rate limit headers from the rate limit response
  if (rateLimitResponse.headers) {
    for (const [key, value] of rateLimitResponse.headers) {
      if (key.startsWith('X-RateLimit-')) {
        response.headers.set(key, value)
      }
    }
  }

  return response
}

/**
 * Lightweight authentication check for Edge Runtime
 * Avoids Node.js-specific imports for better performance
 */
async function lightweightAuthCheck(request: NextRequest): Promise<NextResponse | undefined> {
  const path = request.nextUrl.pathname

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/about', '/pricing', '/legal']
  if (publicRoutes.includes(path)) {
    return undefined
  }

  // Auth pages and public API routes
  if (
    path.startsWith('/auth/') ||
    path.startsWith('/api/auth/') ||
    path === '/api/health' ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  ) {
    return undefined
  }

  // For protected routes, perform lightweight token verification
  const token = extractToken(request)
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const payload = await verifyAccessToken(token)
    if (!payload || !payload.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    // Token is valid, continue to route
    return undefined
  } catch (_error) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
}

/**
 * Extract token from request headers or cookies
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

// Configure which routes use this middleware
export const config = {
  // Match all routes except static files and images
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
