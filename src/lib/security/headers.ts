/**
 * Security Headers Utility
 * Works with middleware for dynamic CSP nonce generation
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { buildCSP, type CSPDirectives, defaultCSPDirectives } from './csp'

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
    includeCors?: boolean
  } = {}
): NextResponse {
  const { nonce, cspDirectives = defaultCSPDirectives, includeCors = true } = options

  // Set CSP (overwrite existing for security consistency)
  const csp = buildCSP(cspDirectives, nonce)
  response.headers.set('Content-Security-Policy', csp)

  // Set security headers (overwrite existing ones for security)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Add CORS headers by default (can be disabled)
  if (includeCors) {
    addCorsHeaders(response)
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
    return addSecurityHeaders(response, { includeCors: true })
  }
  return null
}
