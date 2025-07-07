import { type NextRequest, NextResponse } from 'next/server'

import { monitoringMiddleware } from './lib/middleware/monitoring-middleware'
import { securityMiddleware } from './lib/security/integrated-security-middleware'
import { addSecurityHeaders, handleCorsOptions } from './lib/security/headers'
import { createSpan, getCurrentTraceId } from './lib/telemetry/utils'
import { telemetryLogger } from './lib/telemetry/logger'

/**
 * Comprehensive Security Middleware with OpenTelemetry
 * Integrates all security components: rate limiting, request signing, IP allowlist,
 * audit logging, input validation, security headers, CORS, API key rotation, monitoring,
 * and distributed tracing
 */
export async function middleware(request: NextRequest) {
  return createSpan(
    'middleware.request',
    async (span) => {
      const startTime = Date.now()
      const url = new URL(request.url)
      
      // Add trace context to request headers for downstream services
      const traceId = getCurrentTraceId()
      const requestHeaders = new Headers(request.headers)
      if (traceId) {
        requestHeaders.set('x-trace-id', traceId)
      }

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'http.route': url.pathname,
        'http.user_agent': request.headers.get('user-agent') || 'unknown',
        'http.scheme': url.protocol.replace(':', ''),
        'http.host': url.hostname,
        'http.target': url.pathname + url.search,
      })

      telemetryLogger.api('Request started', {
        method: request.method,
        path: url.pathname,
        userAgent: request.headers.get('user-agent') ?? undefined,
        traceId,
        statusCode: 0, // Will be updated in response
      })

      try {
        // Apply monitoring middleware first (tracks request timing)
        const monitoringResponse = await monitoringMiddleware(request)
        if (monitoringResponse && monitoringResponse !== NextResponse.next()) {
          const duration = Date.now() - startTime
          span.setAttributes({
            'http.status_code': monitoringResponse.status,
            'middleware.blocked_by': 'monitoring',
          })
          
          telemetryLogger.api('Request blocked by monitoring middleware', {
            method: request.method,
            path: url.pathname,
            statusCode: monitoringResponse.status,
            duration,
          })

          return monitoringResponse
        }

        // Apply comprehensive integrated security middleware
        const securityResponse = await securityMiddleware(request)
        if (securityResponse) {
          const duration = Date.now() - startTime
          span.setAttributes({
            'http.status_code': securityResponse.status,
            'middleware.blocked_by': 'security',
          })

          telemetryLogger.api('Request blocked by security middleware', {
            method: request.method,
            path: url.pathname,
            statusCode: securityResponse.status,
            duration,
          })

          return securityResponse
        }

        // Fallback to basic security (should not reach here)
        const corsResponse = handleCorsOptions(request)
        if (corsResponse) {
          const duration = Date.now() - startTime
          span.setAttributes({
            'http.status_code': corsResponse.status,
            'middleware.blocked_by': 'cors',
          })

          telemetryLogger.api('Request handled by CORS', {
            method: request.method,
            path: url.pathname,
            statusCode: corsResponse.status,
            duration,
          })

          return corsResponse
        }

        // Create response with basic security headers and trace ID
        const response = NextResponse.next()
        const securedResponse = addSecurityHeaders(response)
        
        // Add trace ID to response headers for client correlation
        if (traceId) {
          securedResponse.headers.set('x-trace-id', traceId)
        }

        const duration = Date.now() - startTime
        span.setAttributes({
          'http.status_code': 200,
          'middleware.success': true,
        })

        telemetryLogger.api('Request completed successfully', {
          method: request.method,
          path: url.pathname,
          statusCode: 200,
          duration,
        })

        return securedResponse
      } catch (error) {
        const duration = Date.now() - startTime
        
        span.setAttributes({
          'http.status_code': 500,
          'middleware.error': true,
        })

        telemetryLogger.error('Middleware error', error, {
          method: request.method,
          path: url.pathname,
          duration,
        })

        // Fail securely with basic headers
        const response = NextResponse.next()
        const securedResponse = addSecurityHeaders(response)
        
        // Still add trace ID even on error
        if (traceId) {
          securedResponse.headers.set('x-trace-id', traceId)
        }

        return securedResponse
      }
    },
    {
      'http.method': request.method,
      'http.route': new URL(request.url).pathname,
      'middleware.type': 'comprehensive',
    }
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
