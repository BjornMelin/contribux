import { type NextRequest, NextResponse } from 'next/server'
import { enhancedSecurityMiddleware } from './lib/security/enhanced-middleware'
import { addSecurityHeaders, handleCorsOptions } from './lib/security/headers'
import { monitoringMiddleware } from './lib/middleware/monitoring-middleware'

/**
 * Portfolio middleware
 * Balanced approach: Enhanced security for demonstration, monitoring integration
 */
export async function middleware(request: NextRequest) {
  try {
    // Apply monitoring middleware first (tracks request timing)
    const monitoringResponse = await monitoringMiddleware(request)
    if (monitoringResponse && monitoringResponse !== NextResponse.next()) {
      return monitoringResponse
    }

    // Try enhanced security middleware
    const enhancedResponse = await enhancedSecurityMiddleware(request)
    if (enhancedResponse) {
      return enhancedResponse
    }

    // Fallback to basic security
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
