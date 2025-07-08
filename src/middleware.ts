/**
 * Next.js Middleware for CSP Nonce Generation
 * Generates unique nonces per request for enhanced security
 */

import { buildCSP, generateNonce, getCSPDirectives } from '@/lib/security/csp'
import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
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
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Set CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const allowedOrigin =
      process.env.NODE_ENV === 'production'
        ? 'https://contribux.vercel.app'
        : process.env.NEXTAUTH_URL || 'http://localhost:3000'

    response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  return response
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
