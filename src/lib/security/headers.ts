/**
 * Security Headers Utility
 * Works with middleware for dynamic CSP nonce generation
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { type CSPDirectives, buildCSP, defaultCSPDirectives } from './csp'

/**
 * Add security headers to response
 * Note: CSP with nonce is handled by middleware for most routes
 * This function provides a fallback for edge cases
 */
export function addSecurityHeaders(
  response: NextResponse,
  options: {
    nonce?: string
    cspDirectives?: CSPDirectives
  } = {}
): NextResponse {
  const { nonce, cspDirectives = defaultCSPDirectives } = options

  // Only set CSP if not already set by middleware
  if (!response.headers.has('Content-Security-Policy')) {
    const csp = buildCSP(cspDirectives, nonce)
    response.headers.set('Content-Security-Policy', csp)
  }

  // Set other security headers if not already set
  if (!response.headers.has('X-Frame-Options')) {
    response.headers.set('X-Frame-Options', 'DENY')
  }
  if (!response.headers.has('X-Content-Type-Options')) {
    response.headers.set('X-Content-Type-Options', 'nosniff')
  }
  if (!response.headers.has('Referrer-Policy')) {
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  }
  if (!response.headers.has('Permissions-Policy')) {
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  }

  return response
}

/**
 * Handle CORS for API routes
 * Used when middleware doesn't apply (e.g., static routes)
 */
export function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', 'https://contribux.vercel.app')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsOptions(request: NextRequest): NextResponse | null {
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    return addCorsHeaders(response)
  }
  return null
}
