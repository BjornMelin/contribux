/**
 * Next.js Middleware Integration for Pino HTTP Logging
 * Provides automatic HTTP request logging with correlation IDs
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { enhancedLogger } from './pino-logger'

export interface RequestContext {
  requestId: string
  startTime: number
  method: string
  path: string
  userAgent?: string
  ip?: string
  userId?: string
  sessionId?: string
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return randomUUID()
}

/**
 * Extract IP address from request
 */
export function extractIpAddress(request: NextRequest): string | undefined {
  // Check various headers for IP address
  const headers = request.headers
  const forwarded = headers.get('x-forwarded-for')
  const realIp = headers.get('x-real-ip')
  const clientIp = headers.get('x-client-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  if (realIp) {
    return realIp
  }
  
  if (clientIp) {
    return clientIp
  }
  
  return undefined
}

/**
 * Create request context from NextRequest
 */
export function createRequestContext(request: NextRequest): RequestContext {
  const requestId = generateRequestId()
  const startTime = Date.now()
  const method = request.method
  const path = request.nextUrl.pathname
  const userAgent = request.headers.get('user-agent') || undefined
  const ip = extractIpAddress(request)
  
  return {
    requestId,
    startTime,
    method,
    path,
    userAgent,
    ip,
  }
}

/**
 * Middleware function for logging HTTP requests
 */
export function withRequestLogging(
  request: NextRequest,
  handler: (request: NextRequest, context: RequestContext) => Promise<NextResponse> | NextResponse
): Promise<NextResponse> | NextResponse {
  const context = createRequestContext(request)
  
  // Create child logger with request context
  const requestLogger = enhancedLogger.child({
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    userAgent: context.userAgent,
    ip: context.ip,
  })

  // Log incoming request
  requestLogger.info('HTTP request started', {
    method: context.method,
    path: context.path,
    userAgent: context.userAgent,
    ip: context.ip,
  })

  try {
    const result = handler(request, context)
    
    // Handle both sync and async responses
    if (result instanceof Promise) {
      return result
        .then((response) => {
          logResponse(requestLogger, context, response)
          return response
        })
        .catch((error) => {
          logError(requestLogger, context, error)
          throw error
        })
    } else {
      logResponse(requestLogger, context, result)
      return result
    }
  } catch (error) {
    logError(requestLogger, context, error)
    throw error
  }
}

/**
 * Log successful response
 */
function logResponse(
  logger: ReturnType<typeof enhancedLogger.child>,
  context: RequestContext,
  response: NextResponse
): void {
  const duration = Date.now() - context.startTime
  const statusCode = response.status
  const responseSize = response.headers.get('content-length')
  
  logger.httpRequest('HTTP request completed', {
    method: context.method,
    path: context.path,
    statusCode,
    duration,
    responseSize: responseSize ? parseInt(responseSize, 10) : undefined,
  })
}

/**
 * Log request error
 */
function logError(
  logger: ReturnType<typeof enhancedLogger.child>,
  context: RequestContext,
  error: unknown
): void {
  const duration = Date.now() - context.startTime
  
  logger.error('HTTP request failed', error, {
    method: context.method,
    path: context.path,
    duration,
  })
}

/**
 * Higher-order function to wrap API route handlers with logging
 */
export function withApiLogging<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    return withRequestLogging(request, async (req, context) => {
      // Add request context to the request object for access in handlers
      ;(req as any).context = context
      return handler(req, ...args)
    })
  }
}

/**
 * Utility to get request context from a request object
 */
export function getRequestContext(request: NextRequest): RequestContext | undefined {
  return (request as any).context
}

/**
 * Utility to get a logger with request context
 */
export function getRequestLogger(request: NextRequest): ReturnType<typeof enhancedLogger.child> {
  const context = getRequestContext(request)
  if (!context) {
    return enhancedLogger.child({})
  }
  
  return enhancedLogger.child({
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    userAgent: context.userAgent,
    ip: context.ip,
  })
}

/**
 * Response headers to add request ID for debugging
 */
export function addRequestIdHeaders(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('x-request-id', requestId)
  return response
}

/**
 * Middleware for performance monitoring
 */
export function withPerformanceLogging(
  operation: string,
  handler: () => Promise<any> | any
): Promise<any> | any {
  const startTime = Date.now()
  const startMemory = process.memoryUsage()
  
  const logPerformance = (success: boolean, error?: unknown) => {
    const duration = Date.now() - startTime
    const endMemory = process.memoryUsage()
    
    const performanceContext = {
      operation,
      duration,
      success,
      memoryUsage: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal,
        external: endMemory.external,
      },
    }
    
    if (error instanceof Error) {
      Object.assign(performanceContext, { error })
    } else if (error && typeof error === 'string') {
      Object.assign(performanceContext, { error })
    }
    
    enhancedLogger.performance(`Operation ${operation} ${success ? 'completed' : 'failed'}`, performanceContext)
  }
  
  try {
    const result = handler()
    
    if (result instanceof Promise) {
      return result
        .then((value) => {
          logPerformance(true)
          return value
        })
        .catch((error) => {
          logPerformance(false, error)
          throw error
        })
    } else {
      logPerformance(true)
      return result
    }
  } catch (error) {
    logPerformance(false, error)
    throw error
  }
}

/**
 * Database operation logging wrapper
 */
export function withDatabaseLogging<T>(
  operation: string,
  handler: () => Promise<T> | T
): Promise<T> | T {
  const startTime = Date.now()
  
  const logDatabase = (success: boolean, error?: unknown) => {
    const duration = Date.now() - startTime
    
    const databaseContext = {
      operation,
      duration,
      success,
    }
    
    if (error instanceof Error) {
      Object.assign(databaseContext, { error })
    } else if (error && typeof error === 'string') {
      Object.assign(databaseContext, { error })
    }
    
    enhancedLogger.database(`Database operation ${operation} ${success ? 'completed' : 'failed'}`, databaseContext)
  }
  
  try {
    const result = handler()
    
    if (result instanceof Promise) {
      return result
        .then((value) => {
          logDatabase(true)
          return value
        })
        .catch((error) => {
          logDatabase(false, error)
          throw error
        })
    } else {
      logDatabase(true)
      return result
    }
  } catch (error) {
    logDatabase(false, error)
    throw error
  }
}

export default withRequestLogging