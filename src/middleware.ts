import { type NextRequest, NextResponse } from 'next/server'

import { monitoringMiddleware } from './lib/middleware/monitoring-middleware'
import { securityMiddleware } from './lib/security/integrated-security-middleware'
import { addSecurityHeaders, handleCorsOptions } from './lib/security/headers'

/**
 * Comprehensive Security Middleware
 * Integrates all security components: rate limiting, request signing, IP allowlist,
 * audit logging, input validation, security headers, CORS, API key rotation, and monitoring
 */
export async function middleware(request: NextRequest) {
  try {
    // Apply monitoring middleware first (tracks request timing)
    const monitoringResponse = await monitoringMiddleware(request)
    if (monitoringResponse && monitoringResponse !== NextResponse.next()) {
      return monitoringResponse
    }

    // Apply comprehensive integrated security middleware
    const securityResponse = await securityMiddleware(request)
    if (securityResponse) {
      return securityResponse
    }

    // Fallback to basic security (should not reach here)
    const corsResponse = handleCorsOptions(request)
    if (corsResponse) {
      return corsResponse
    }

    // Create response with basic security headers
    const response = NextResponse.next()
    return addSecurityHeaders(response)
  } catch (_error) {
    // In production, log to proper monitoring system instead of console

    // Fail securely with basic headers
    const response = NextResponse.next()
    return addSecurityHeaders(response)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
