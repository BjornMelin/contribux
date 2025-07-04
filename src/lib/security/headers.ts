/**
 * Basic Security Headers for Portfolio Application
 * Simple CORS and security headers following KISS principles
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * Add basic security headers to response
 * Security improvements: Removed 'unsafe-inline' from CSP to prevent XSS attacks
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Basic CORS headers
  response.headers.set('Access-Control-Allow-Origin', 'https://contribux.vercel.app')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')

  // Basic security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Secure CSP for portfolio site (basic fallback without nonce)
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://vercel.live; style-src 'self' https://fonts.googleapis.com 'sha256-tQjf8gvb2ROOMapIxFvFAYBeUJ0v1HCbOcSmDNXGtDo='; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://api.github.com https://vercel.live; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none';"
  )

  return response
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsOptions(request: NextRequest): NextResponse | null {
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    return addSecurityHeaders(response)
  }
  return null
}
