/**
 * Next.js Middleware Integration for Pino HTTP Logging
 * Provides automatic HTTP request logging with correlation IDs
 */

import { randomUUID } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import type { ErrorClassification } from '@/lib/errors/error-classification'
import { RecoveryStrategy } from '@/lib/errors/error-classification'
import { createErrorLogger } from './pino-config'
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
        .then(response => {
          logResponse(requestLogger, context, response)
          return response
        })
        .catch(error => {
          logError(requestLogger, context, error)
          throw error
        })
    }
    logResponse(requestLogger, context, result)
    return result
  } catch (error) {
    logError(requestLogger, context, error)
    throw error
  }
}

/**
 * Enhanced API error monitoring middleware for Next.js 15 App Router
 * Integrates with ErrorMonitor and AlertingSystem for comprehensive error tracking
 */
export function withApiErrorMonitoring<T extends any[]>(
  handler: (...args: T) => Promise<Response>,
  options: {
    endpoint?: string
    component?: string
    trackPerformance?: boolean
    customContext?: Record<string, unknown>
  } = {}
): (...args: T) => Promise<Response> {
  return async (...args: T): Promise<Response> => {
    const startTime = Date.now()
    const requestId = generateRequestId()
    const endpoint = options.endpoint || 'unknown'

    // Create error monitoring logger
    const errorLogger = createErrorLogger({
      component: options.component || 'API',
      operation: endpoint,
      requestId,
    })

    // Extract request context for better error tracking
    let requestContext: Record<string, unknown> = {}

    // Attempt to extract request context from first argument (usually NextRequest)
    if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) {
      const request = args[0] as any
      requestContext = {
        url: request.url,
        method: request.method,
        userAgent: request.headers?.get('user-agent'),
        ip: extractIpAddress(request),
        ...options.customContext,
      }
    }

    // Log request start
    errorLogger.info(
      {
        event: 'api_request_start',
        endpoint,
        requestContext,
        timestamp: new Date().toISOString(),
      },
      `API request started: ${endpoint}`
    )

    try {
      const response = await handler(...args)
      const duration = Date.now() - startTime

      // Log successful response
      errorLogger.info(
        {
          event: 'api_request_success',
          endpoint,
          duration,
          status: response.status,
          requestId,
        },
        `API request completed: ${endpoint} (${duration}ms)`
      )

      // Track performance if enabled
      if (options.trackPerformance) {
        await trackApiPerformance(endpoint, duration, response.status, requestContext)
      }

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      // Classify and monitor the error
      const { classifyError } = await import('@/lib/errors/error-classification')
      const { ErrorMonitor } = await import('@/lib/errors/error-monitoring')
      const { alertingSystem } = await import('@/lib/errors/error-monitoring')

      const classification = classifyError(error)
      const errorMonitor = ErrorMonitor.getInstance()

      // Track error with context
      await errorMonitor.track(error, classification, {
        url: requestContext.url as string,
        userAgent: requestContext.userAgent as string,
        metadata: {
          endpoint,
          duration,
          requestId,
          ...requestContext,
        },
      })

      // Trigger alerts if needed
      await alertingSystem.processError(error, classification, {
        url: requestContext.url as string,
        userAgent: requestContext.userAgent as string,
        metadata: {
          endpoint,
          duration,
          requestId,
          ...requestContext,
        },
      })

      // Log error with enhanced context
      errorLogger.error(
        {
          event: 'api_request_error',
          endpoint,
          duration,
          requestId,
          error: {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          classification: {
            category: classification.category,
            severity: classification.severity,
            isTransient: classification.isTransient,
            userMessage: classification.userMessage,
          },
          requestContext,
        },
        `API request failed: ${endpoint} (${duration}ms)`
      )

      // Create appropriate error response
      const { createApiErrorResponse } = await import('@/lib/errors/webhook-error-boundary')
      return createApiErrorResponse(error, classification, {
        requestId,
        endpoint,
        duration,
      })
    }
  }
}

/**
 * Database operation error monitoring wrapper
 */
export function withDatabaseErrorMonitoring<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  operationName: string,
  options: {
    table?: string
    critical?: boolean
    customContext?: Record<string, unknown>
  } = {}
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now()
    const operationId = generateRequestId()

    const dbLogger = createErrorLogger({
      component: 'Database',
      operation: operationName,
      requestId: operationId,
    })

    dbLogger.debug(
      {
        event: 'db_operation_start',
        operation: operationName,
        table: options.table,
        operationId,
        context: options.customContext,
      },
      `Database operation started: ${operationName}`
    )

    try {
      const result = await operation(...args)
      const duration = Date.now() - startTime

      dbLogger.info(
        {
          event: 'db_operation_success',
          operation: operationName,
          table: options.table,
          duration,
          operationId,
        },
        `Database operation completed: ${operationName} (${duration}ms)`
      )

      // Track slow queries
      if (duration > 1000) {
        // > 1 second
        dbLogger.warn(
          {
            event: 'db_slow_query',
            operation: operationName,
            table: options.table,
            duration,
            operationId,
          },
          `Slow database operation detected: ${operationName} (${duration}ms)`
        )
      }

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Enhanced database error classification
      const classification = await classifyDatabaseError(error, {
        operation: operationName,
        table: options.table,
        duration,
        critical: options.critical,
      })

      // Track database error
      const { ErrorMonitor } = await import('@/lib/errors/error-monitoring')
      const { alertingSystem } = await import('@/lib/errors/error-monitoring')

      const errorMonitor = ErrorMonitor.getInstance()

      await errorMonitor.track(error, classification, {
        metadata: {
          operation: operationName,
          table: options.table,
          duration,
          operationId,
          ...options.customContext,
        },
      })

      // Trigger alerts for database issues
      await alertingSystem.processError(error, classification, {
        metadata: {
          operation: operationName,
          table: options.table,
          duration,
          operationId,
          ...options.customContext,
        },
      })

      dbLogger.error(
        {
          event: 'db_operation_error',
          operation: operationName,
          table: options.table,
          duration,
          operationId,
          error: {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code,
            constraint: (error as any)?.constraint,
          },
          classification: {
            category: classification.category,
            severity: classification.severity,
            isTransient: classification.isTransient,
          },
        },
        `Database operation failed: ${operationName} (${duration}ms)`
      )

      throw error
    }
  }
}

/**
 * External API call error monitoring wrapper
 */
export function withExternalApiErrorMonitoring<T extends any[], R>(
  apiCall: (...args: T) => Promise<R>,
  serviceName: string,
  options: {
    endpoint?: string
    timeout?: number
    retryable?: boolean
    customContext?: Record<string, unknown>
  } = {}
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now()
    const callId = generateRequestId()

    const apiLogger = createErrorLogger({
      component: 'ExternalAPI',
      operation: serviceName,
      requestId: callId,
    })

    apiLogger.debug(
      {
        event: 'external_api_call_start',
        service: serviceName,
        endpoint: options.endpoint,
        callId,
        context: options.customContext,
      },
      `External API call started: ${serviceName}`
    )

    try {
      const result = await apiCall(...args)
      const duration = Date.now() - startTime

      apiLogger.info(
        {
          event: 'external_api_call_success',
          service: serviceName,
          endpoint: options.endpoint,
          duration,
          callId,
        },
        `External API call completed: ${serviceName} (${duration}ms)`
      )

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Classify external API error
      const classification = await classifyExternalApiError(error, {
        service: serviceName,
        endpoint: options.endpoint,
        duration,
        retryable: options.retryable,
      })

      // Track external API error
      const { ErrorMonitor } = await import('@/lib/errors/error-monitoring')
      const { alertingSystem } = await import('@/lib/errors/error-monitoring')

      const errorMonitor = ErrorMonitor.getInstance()

      await errorMonitor.track(error, classification, {
        metadata: {
          service: serviceName,
          endpoint: options.endpoint,
          duration,
          callId,
          ...options.customContext,
        },
      })

      // Trigger alerts for external API issues
      await alertingSystem.processError(error, classification, {
        metadata: {
          service: serviceName,
          endpoint: options.endpoint,
          duration,
          callId,
          ...options.customContext,
        },
      })

      apiLogger.error(
        {
          event: 'external_api_call_error',
          service: serviceName,
          endpoint: options.endpoint,
          duration,
          callId,
          error: {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
            status: (error as any)?.status,
            statusText: (error as any)?.statusText,
          },
          classification: {
            category: classification.category,
            severity: classification.severity,
            isTransient: classification.isTransient,
          },
        },
        `External API call failed: ${serviceName} (${duration}ms)`
      )

      throw error
    }
  }
}

/**
 * Track API performance metrics
 */
async function trackApiPerformance(
  endpoint: string,
  duration: number,
  status: number,
  context: Record<string, unknown>
): Promise<void> {
  const performanceLogger = createErrorLogger({
    component: 'Performance',
    operation: 'api_tracking',
  })

  performanceLogger.info(
    {
      event: 'api_performance',
      endpoint,
      duration,
      status,
      performance: {
        responseTime: duration,
        statusCode: status,
        timestamp: Date.now(),
      },
      context,
    },
    `API performance tracked: ${endpoint}`
  )

  // Track slow endpoints
  if (duration > 2000) {
    // > 2 seconds
    performanceLogger.warn(
      {
        event: 'api_slow_response',
        endpoint,
        duration,
        status,
      },
      `Slow API response detected: ${endpoint} (${duration}ms)`
    )
  }
}

/**
 * Enhanced database error classification
 */
async function classifyDatabaseError(
  error: unknown,
  context: {
    operation: string
    table?: string
    duration: number
    critical?: boolean
  }
): Promise<ErrorClassification> {
  const { ErrorCategory, ErrorSeverity } = await import('@/lib/errors/error-classification')

  if (error instanceof Error) {
    // PostgreSQL/Neon specific error codes
    const pgError = error as any

    if (pgError.code === '23505') {
      // Unique violation
      return {
        category: ErrorCategory.VALIDATION_FAILED,
        severity: ErrorSeverity.LOW,
        isTransient: false,
        recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
        userMessage: 'Data already exists',
        technicalDetails: `Unique constraint violation in ${context.table}: ${error.message}`,
      }
    }

    if (pgError.code === '23503') {
      // Foreign key violation
      return {
        category: ErrorCategory.VALIDATION_FAILED,
        severity: ErrorSeverity.MEDIUM,
        isTransient: false,
        recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
        userMessage: 'Invalid reference to related data',
        technicalDetails: `Foreign key constraint violation in ${context.table}: ${error.message}`,
      }
    }

    if (pgError.code === '08006' || pgError.code === '08003') {
      // Connection issues
      return {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: context.critical ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [RecoveryStrategy.RETRY_BACKOFF, RecoveryStrategy.CIRCUIT_BREAK],
        userMessage: 'Database connectivity issue',
        technicalDetails: `Database connection error: ${error.message}`,
      }
    }

    if (pgError.code === '40001' || pgError.code === '40P01') {
      // Serialization/deadlock
      return {
        category: ErrorCategory.DATABASE_TRANSACTION,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [RecoveryStrategy.RETRY_IMMEDIATE, RecoveryStrategy.RETRY_BACKOFF],
        userMessage: 'Database operation conflict',
        technicalDetails: `Transaction conflict in ${context.operation}: ${error.message}`,
      }
    }
  }

  // Default database error classification
  return {
    category: ErrorCategory.DATABASE_QUERY,
    severity: context.critical ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
    isTransient: context.duration > 5000, // Assume timeout-related errors are transient
    recoveryStrategies:
      context.duration > 5000
        ? [RecoveryStrategy.RETRY_BACKOFF]
        : [RecoveryStrategy.USER_INTERVENTION],
    userMessage: 'Database operation failed',
    technicalDetails: error instanceof Error ? error.message : String(error),
  }
}

/**
 * Enhanced external API error classification
 */
async function classifyExternalApiError(
  error: unknown,
  context: {
    service: string
    endpoint?: string
    duration: number
    retryable?: boolean
  }
): Promise<ErrorClassification> {
  const { ErrorCategory, ErrorSeverity } = await import('@/lib/errors/error-classification')

  if (error instanceof Error) {
    const httpError = error as any

    // Rate limiting
    if (httpError.status === 429) {
      return {
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [RecoveryStrategy.RETRY_BACKOFF, RecoveryStrategy.CIRCUIT_BREAK],
        userMessage: 'Service temporarily unavailable due to rate limits',
        technicalDetails: `Rate limit exceeded for ${context.service}: ${error.message}`,
      }
    }

    // Unauthorized
    if (httpError.status === 401) {
      return {
        category: ErrorCategory.AUTH_EXPIRED,
        severity: ErrorSeverity.HIGH,
        isTransient: false,
        recoveryStrategies: [RecoveryStrategy.REFRESH_AUTH, RecoveryStrategy.USER_INTERVENTION],
        userMessage: 'Authentication required',
        technicalDetails: `Authentication failed for ${context.service}: ${error.message}`,
      }
    }

    // Service unavailable
    if (httpError.status >= 500) {
      return {
        category: ErrorCategory.THIRD_PARTY_SERVICE,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [RecoveryStrategy.RETRY_BACKOFF, RecoveryStrategy.CIRCUIT_BREAK],
        userMessage: 'External service temporarily unavailable',
        technicalDetails: `${context.service} service error: ${error.message}`,
      }
    }

    // Timeout
    if (error.message.includes('timeout') || context.duration > 30000) {
      return {
        category: ErrorCategory.NETWORK_TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [RecoveryStrategy.RETRY_BACKOFF],
        userMessage: 'Request timed out',
        technicalDetails: `Timeout calling ${context.service}: ${error.message}`,
      }
    }
  }

  // Default external API error
  return {
    category: ErrorCategory.THIRD_PARTY_SERVICE,
    severity: ErrorSeverity.MEDIUM,
    isTransient: context.retryable ?? true,
    recoveryStrategies: context.retryable
      ? [RecoveryStrategy.RETRY_BACKOFF]
      : [RecoveryStrategy.USER_INTERVENTION],
    userMessage: 'External service error',
    technicalDetails: error instanceof Error ? error.message : String(error),
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
    responseSize: responseSize ? Number.parseInt(responseSize, 10) : undefined,
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

    enhancedLogger.performance(
      `Operation ${operation} ${success ? 'completed' : 'failed'}`,
      performanceContext
    )
  }

  try {
    const result = handler()

    if (result instanceof Promise) {
      return result
        .then(value => {
          logPerformance(true)
          return value
        })
        .catch(error => {
          logPerformance(false, error)
          throw error
        })
    }
    logPerformance(true)
    return result
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

    enhancedLogger.database(
      `Database operation ${operation} ${success ? 'completed' : 'failed'}`,
      databaseContext
    )
  }

  try {
    const result = handler()

    if (result instanceof Promise) {
      return result
        .then(value => {
          logDatabase(true)
          return value
        })
        .catch(error => {
          logDatabase(false, error)
          throw error
        })
    }
    logDatabase(true)
    return result
  } catch (error) {
    logDatabase(false, error)
    throw error
  }
}

export default withRequestLogging
