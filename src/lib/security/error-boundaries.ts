/**
 * Security Error Boundaries
 * Implements secure error handling for sensitive operations
 * Prevents information leakage and provides graceful degradation
 */

import { type NextRequest, NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { AuditEventType, AuditSeverity, auditLogger } from './audit-logger'

// Error types for security operations
export enum SecurityErrorType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  SIGNATURE = 'signature',
  ENCRYPTION = 'encryption',
  CONFIGURATION = 'configuration',
  INTERNAL = 'internal',
  OPERATION_FAILED = 'operation_failed',
}

// Security error class
export class SecurityError extends Error {
  constructor(
    public type: SecurityErrorType,
    message: string,
    public statusCode = 500,
    public details?: unknown,
    public userMessage?: string
  ) {
    super(message)
    this.name = 'SecurityError'
  }
}

// Error response schema
const ErrorResponseSchema = z.object({
  error: z.string(),
  type: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  timestamp: z.string(),
})

// Error boundary configuration
export interface ErrorBoundaryConfig {
  logErrors: boolean
  includeStackTrace: boolean
  includeDetails: boolean
  defaultMessage: string
  onError?: (error: Error, context: BoundaryContext) => void
}

// Context interface for error boundaries
interface BoundaryContext {
  operationType: string
  userId?: string
  ip?: string
  metadata?: Record<string, unknown>
}

/**
 * Build audit log entry for errors
 */
function buildErrorAuditEntry(
  error: unknown,
  context: BoundaryContext,
  boundaryConfig: ErrorBoundaryConfig
) {
  const severity =
    error instanceof SecurityError && error.type === SecurityErrorType.RATE_LIMIT
      ? AuditSeverity.WARNING
      : AuditSeverity.ERROR

  return {
    type: AuditEventType.SYSTEM_ERROR,
    severity,
    actor: {
      id: context.userId,
      type: (context.userId ? 'user' : 'system') as 'user' | 'system' | 'api' | 'webhook',
      ip: context.ip,
    },
    action: `Error in ${context.operationType}`,
    result: 'error' as const,
    reason: error instanceof Error ? error.message : 'Unknown error',
    metadata: {
      ...context.metadata,
      errorType: error instanceof SecurityError ? error.type : 'unknown',
      stack: boundaryConfig.includeStackTrace && error instanceof Error ? error.stack : undefined,
    },
  }
}

/**
 * Handle error logging safely
 */
async function handleErrorLogging(
  error: unknown,
  context: BoundaryContext,
  boundaryConfig: ErrorBoundaryConfig
): Promise<void> {
  if (!boundaryConfig.logErrors) return

  const auditEntry = buildErrorAuditEntry(error, context, boundaryConfig)
  await auditLogger.log(auditEntry)
}

/**
 * Execute custom error handler safely
 */
function executeCustomErrorHandler(
  error: unknown,
  context: BoundaryContext,
  boundaryConfig: ErrorBoundaryConfig
): void {
  if (!boundaryConfig.onError) return

  try {
    boundaryConfig.onError(error as Error, context)
  } catch (_handlerError) {
    // Silently handle error in error handler to prevent cascading failures
  }
}

/**
 * Security error boundary wrapper for async operations
 */
export async function withSecurityBoundary<T>(
  operation: () => Promise<T>,
  context: {
    operationType: string
    userId?: string
    ip?: string
    metadata?: Record<string, unknown>
  },
  config?: Partial<ErrorBoundaryConfig>
): Promise<T> {
  const boundaryConfig: ErrorBoundaryConfig = {
    logErrors: true,
    includeStackTrace: process.env.NODE_ENV !== 'production',
    includeDetails: process.env.NODE_ENV !== 'production',
    defaultMessage: 'An error occurred processing your request',
    ...config,
  }

  try {
    return await operation()
  } catch (error) {
    // Log to audit system
    await handleErrorLogging(error, context, boundaryConfig)

    // Call custom error handler
    executeCustomErrorHandler(error, context, boundaryConfig)

    // Re-throw error for handling at higher level
    throw error
  }
}

/**
 * Analyze security error and return error details
 */
function analyzeSecurityError(error: SecurityError): {
  statusCode: number
  errorType: SecurityErrorType
  userMessage: string
} {
  return {
    statusCode: error.statusCode,
    errorType: error.type,
    userMessage: error.userMessage || 'An error occurred processing your request',
  }
}

/**
 * Analyze validation error and return error details
 */
function analyzeValidationError(): {
  statusCode: number
  errorType: SecurityErrorType
  userMessage: string
} {
  return {
    statusCode: 400,
    errorType: SecurityErrorType.VALIDATION,
    userMessage: 'Invalid request data',
  }
}

/**
 * Analyze generic error and return error details
 */
function analyzeGenericError(error: Error): {
  statusCode: number
  errorType: SecurityErrorType
  userMessage: string
} {
  // Check for specific error patterns
  if (error.message.includes('rate limit')) {
    return {
      statusCode: 429,
      errorType: SecurityErrorType.RATE_LIMIT,
      userMessage: 'Too many requests. Please try again later.',
    }
  }

  if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
    return {
      statusCode: 401,
      errorType: SecurityErrorType.AUTHENTICATION,
      userMessage: 'Authentication required',
    }
  }

  if (error.message.includes('forbidden') || error.message.includes('permission')) {
    return {
      statusCode: 403,
      errorType: SecurityErrorType.AUTHORIZATION,
      userMessage: 'Access denied',
    }
  }

  return {
    statusCode: 500,
    errorType: SecurityErrorType.INTERNAL,
    userMessage: 'An error occurred processing your request',
  }
}

/**
 * Create security headers for error response
 */
function createSecurityHeaders(requestId?: string): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
  })

  if (requestId) {
    headers.set('X-Request-ID', requestId)
  }

  return headers
}

/**
 * Create secure error response
 */
export function createSecureErrorResponse(error: unknown, requestId?: string): NextResponse {
  // Determine error details
  let statusCode = 500
  let errorType = SecurityErrorType.INTERNAL
  let userMessage = 'An error occurred processing your request'

  if (error instanceof SecurityError) {
    const details = analyzeSecurityError(error)
    statusCode = details.statusCode
    errorType = details.errorType
    userMessage = details.userMessage
  } else if (error instanceof ZodError) {
    const details = analyzeValidationError()
    statusCode = details.statusCode
    errorType = details.errorType
    userMessage = details.userMessage
  } else if (error instanceof Error) {
    const details = analyzeGenericError(error)
    statusCode = details.statusCode
    errorType = details.errorType
    userMessage = details.userMessage
  }

  const response = ErrorResponseSchema.parse({
    error: errorType,
    type: errorType,
    message: userMessage,
    requestId,
    timestamp: new Date().toISOString(),
  })

  const headers = createSecurityHeaders(requestId)

  return NextResponse.json(response, {
    status: statusCode,
    headers,
  })
}

/**
 * Wrap API route handler with security error boundary
 */
export function withApiSecurityBoundary(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
    const startTime = Date.now()

    try {
      // Add request ID to headers for tracing
      const response = await handler(request)

      // Add security headers if not already present
      if (!response.headers.has('X-Request-ID')) {
        response.headers.set('X-Request-ID', requestId)
      }
      if (!response.headers.has('X-Response-Time')) {
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
      }

      return response
    } catch (error) {
      // Extract context for logging
      const context = {
        operationType: `${request.method} ${new URL(request.url).pathname}`,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        metadata: {
          method: request.method,
          path: new URL(request.url).pathname,
          userAgent: request.headers.get('user-agent'),
        },
      }

      // Log error with context
      await withSecurityBoundary(
        async () => {
          throw error
        },
        context,
        { logErrors: true }
      ).catch(() => {
        // Silently catch to prevent double throwing during error handling
      })

      // Return secure error response
      return createSecureErrorResponse(error, requestId)
    }
  }
}

/**
 * Wrap sensitive operations with retry logic
 */
export async function withRetryBoundary<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelay?: number
    backoffMultiplier?: number
    shouldRetry?: (error: unknown, attempt: number) => boolean
    onRetry?: (error: unknown, attempt: number) => void
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 2,
    shouldRetry = error => {
      // Default: retry on network errors and 5xx status codes
      if (error instanceof Error) {
        return (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND')
        )
      }
      return false
    },
    onRetry,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error
      }

      if (onRetry) {
        onRetry(error, attempt)
      }

      // Exponential backoff
      const delay = retryDelay * backoffMultiplier ** (attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Circuit breaker for external service calls
 */
export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(
    private config: {
      failureThreshold: number
      resetTimeout: number
      onOpen?: () => void
      onClose?: () => void
    }
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'open' && Date.now() - this.lastFailureTime > this.config.resetTimeout) {
      this.state = 'half-open'
    }

    // Block if circuit is open
    if (this.state === 'open') {
      throw new SecurityError(
        SecurityErrorType.INTERNAL,
        'Circuit breaker is open',
        503,
        { failures: this.failures },
        'Service temporarily unavailable'
      )
    }

    try {
      const result = await operation()

      // Reset on success
      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failures = 0
        this.config.onClose?.()
      }

      return result
    } catch (error) {
      this.failures++
      this.lastFailureTime = Date.now()

      // Open circuit if threshold reached
      if (this.failures >= this.config.failureThreshold) {
        this.state = 'open'
        this.config.onOpen?.()
      }

      throw error
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    }
  }
}
