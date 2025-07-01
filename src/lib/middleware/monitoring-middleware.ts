/**
 * Monitoring Integration Middleware
 * Tracks API requests and integrates with monitoring system
 */

import { type NextRequest, NextResponse } from 'next/server'
import { apiMonitoring } from '@/lib/api/monitoring'

// Request tracking interface
interface RequestInfo {
  method: string
  url: string
  timestamp: number
  userAgent?: string
  userId?: string
}

// Response tracking interface
interface ResponseInfo {
  statusCode: number
  duration: number
  cacheHit?: boolean
  error?: string
}

/**
 * Extract user ID from request (if authenticated)
 */
function extractUserId(request: NextRequest): string | undefined {
  // Try to get user ID from common authentication headers/cookies
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // In a real app, decode JWT or validate token to get user ID
    // For now, return undefined to maintain privacy
    return undefined
  }

  // Could also check cookies or other auth mechanisms
  return undefined
}

/**
 * Determine if response was from cache
 */
function isCacheHit(response: NextResponse): boolean {
  return (
    response.headers.get('x-cache-status') === 'HIT' ||
    response.headers.get('cache-control')?.includes('hit') === true
  )
}

/**
 * Extract error information from response
 */
function extractErrorInfo(response: NextResponse, statusCode: number): string | undefined {
  if (statusCode >= 400) {
    // Try to get error info from headers
    const errorHeader = response.headers.get('x-error-message')
    if (errorHeader) {
      return errorHeader
    }

    // Generic error messages based on status code
    if (statusCode >= 500) {
      return 'Internal server error'
    }

    if (statusCode === 404) {
      return 'Not found'
    }

    if (statusCode === 401) {
      return 'Unauthorized'
    }

    if (statusCode === 403) {
      return 'Forbidden'
    }

    if (statusCode === 429) {
      return 'Rate limit exceeded'
    }

    return `HTTP ${statusCode} error`
  }

  return undefined
}

/**
 * Main monitoring middleware function
 */
export function createMonitoringMiddleware() {
  return async (request: NextRequest): Promise<NextResponse | undefined> => {
    // Skip monitoring for static assets and internal routes
    const { pathname } = new URL(request.url)

    const skipPatterns = [
      '/_next/',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
      '/public/',
      '.css',
      '.js',
      '.map',
      '.ico',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
      '.woff',
      '.woff2',
      '.ttf',
      '.eot',
    ]

    const shouldSkip = skipPatterns.some(pattern => pathname.includes(pattern))
    if (shouldSkip) {
      return NextResponse.next()
    }

    // Record request start time
    const startTime = Date.now()

    // Extract request information
    const userAgent = request.headers.get('user-agent')
    const userId = extractUserId(request)
    const requestInfo: RequestInfo = {
      method: request.method,
      url: request.url,
      timestamp: startTime,
      userAgent: userAgent ?? undefined,
      userId: userId ?? undefined,
    }

    // Continue with the request
    const response = NextResponse.next()

    // Track the request after response is ready
    // Note: In Next.js middleware, we can't easily wait for the response to complete
    // So we schedule the tracking to happen shortly after
    setTimeout(() => {
      try {
        const duration = Date.now() - startTime
        const statusCode = response.status || 200

        const cacheHit = isCacheHit(response)
        const error = extractErrorInfo(response, statusCode)
        const responseInfo: ResponseInfo = {
          statusCode,
          duration,
          cacheHit: cacheHit ?? undefined,
          error: error ?? undefined,
        }

        // Track the request in monitoring system
        apiMonitoring.trackRequest(
          requestInfo.url,
          requestInfo.method,
          responseInfo.statusCode,
          responseInfo.duration,
          {
            userId: requestInfo.userId ?? undefined,
            userAgent: requestInfo.userAgent ?? undefined,
            cacheHit: responseInfo.cacheHit ?? undefined,
            error: responseInfo.error ?? undefined,
          }
        )
      } catch (_error) {
        // Silently fail - monitoring shouldn't break the app
      }
    }, 0)

    return response
  }
}

/**
 * Monitoring middleware with error handling
 */
export async function monitoringMiddleware(
  request: NextRequest
): Promise<NextResponse | undefined> {
  try {
    const middleware = createMonitoringMiddleware()
    return await middleware(request)
  } catch (_error) {
    // Always fail gracefully - monitoring should never break the app

    return NextResponse.next()
  }
}

/**
 * Utility to manually track custom events
 */
export function trackCustomEvent(
  eventType: string,
  url: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, unknown>
): void {
  try {
    apiMonitoring.trackRequest(url, 'CUSTOM', success ? 200 : 500, duration, {
      error: success ? undefined : `Custom event failed: ${eventType}`,
      ...metadata,
    })
  } catch (_error) {
    // Silently fail
  }
}

/**
 * Performance timing utilities
 */
export class PerformanceTimer {
  private startTime: number
  private markers: Map<string, number> = new Map()

  constructor() {
    this.startTime = Date.now()
  }

  /**
   * Mark a point in time
   */
  mark(name: string): void {
    this.markers.set(name, Date.now())
  }

  /**
   * Get duration from start
   */
  getDuration(): number {
    return Date.now() - this.startTime
  }

  /**
   * Get duration between two markers
   */
  getDurationBetween(start: string, end: string): number {
    const startTime = this.markers.get(start)
    const endTime = this.markers.get(end)

    if (!startTime || !endTime) {
      throw new Error(`Marker not found: ${!startTime ? start : end}`)
    }

    return endTime - startTime
  }

  /**
   * Get all marker durations from start
   */
  getAllDurations(): Record<string, number> {
    const result: Record<string, number> = {}

    for (const [name, time] of this.markers) {
      result[name] = time - this.startTime
    }

    return result
  }
}

// Export types
export type { RequestInfo, ResponseInfo }
