/**
 * Enhanced Error Handler for Contribux Application
 * Provides comprehensive error handling with context, correlation IDs, and environment-appropriate debugging
 */

import { type NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { randomUUID } from 'crypto'

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

// Error categories for better organization and handling
export type ErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'database'
  | 'external_api'
  | 'rate_limiting'
  | 'network'
  | 'configuration'
  | 'security'
  | 'internal'

// Enhanced error interface with comprehensive context
export interface EnhancedError {
  // Core error information
  code: string
  message: string
  category: ErrorCategory
  severity: ErrorSeverity

  // Context and debugging
  correlationId: string
  timestamp: string
  context?: Record<string, unknown>

  // Environment-specific details
  details?: {
    development?: string
    production?: string
  }

  // Actionable guidance
  actionableSteps?: string[]
  documentationLinks?: string[]

  // Technical information
  originalError?: string
  stackTrace?: string
  endpoint?: string
  userId?: string
}

// Environment configuration
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Enhanced Error Handler Class
 * Provides centralized error handling with rich context and debugging information
 */
export class ErrorHandler {
  /**
   * Create an enhanced error with comprehensive context
   */
  static createError(
    code: string,
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    options: {
      context?: Record<string, unknown>
      originalError?: Error | unknown
      endpoint?: string
      userId?: string
      actionableSteps?: string[]
      documentationLinks?: string[]
      developmentDetails?: string
      productionMessage?: string
    } = {}
  ): EnhancedError {
    const correlationId = randomUUID()
    const timestamp = new Date().toISOString()

    // Determine appropriate message based on environment
    const environmentMessage =
      isProduction && options.productionMessage ? options.productionMessage : message

    const error: EnhancedError = {
      code,
      message: environmentMessage,
      category,
      severity,
      correlationId,
      timestamp,
      context: options.context,
      endpoint: options.endpoint,
      userId: options.userId,
      actionableSteps: options.actionableSteps,
      documentationLinks: options.documentationLinks,
    }

    // Add environment-specific details
    if (isDevelopment || isTest) {
      error.details = {
        development: options.developmentDetails || message,
        production: options.productionMessage || 'An error occurred while processing your request',
      }

      // Include stack trace and original error in development
      if (options.originalError instanceof Error) {
        error.originalError = options.originalError.message
        error.stackTrace = options.originalError.stack
      } else if (typeof options.originalError === 'string') {
        error.originalError = options.originalError
      }
    }

    return error
  }

  /**
   * Handle authentication errors with specific context and guidance
   */
  static createAuthError(
    type: 'token_expired' | 'invalid_token' | 'no_token' | 'invalid_credentials' | 'account_locked',
    originalError?: Error | unknown,
    context?: Record<string, unknown>
  ): EnhancedError {
    const errorMap = {
      token_expired: {
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
        actionableSteps: [
          'Click the sign-in button to authenticate again',
          'If the issue persists, clear your browser cookies and try again',
        ],
        developmentDetails: 'JWT token has expired. Check token expiration time and refresh logic.',
        documentationLinks: ['/docs/authentication#token-refresh'],
      },
      invalid_token: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid authentication token. Please sign in again.',
        actionableSteps: [
          'Sign out and sign in again to obtain a new token',
          'If using API access, regenerate your API key',
        ],
        developmentDetails:
          'JWT token signature verification failed or token structure is invalid.',
        documentationLinks: ['/docs/authentication#troubleshooting'],
      },
      no_token: {
        code: 'AUTH_NO_TOKEN',
        message: 'Authentication required. Please sign in to access this resource.',
        actionableSteps: [
          'Navigate to the sign-in page',
          'Ensure cookies are enabled in your browser',
        ],
        developmentDetails: 'No authentication token found in request headers or cookies.',
        documentationLinks: ['/docs/authentication#getting-started'],
      },
      invalid_credentials: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid username or password. Please check your credentials and try again.',
        actionableSteps: [
          'Verify your username and password are correct',
          'Use the "Forgot Password" link if you need to reset your password',
          'Check if Caps Lock is enabled',
        ],
        developmentDetails: 'Credential validation failed during authentication attempt.',
        documentationLinks: ['/docs/authentication#password-reset'],
      },
      account_locked: {
        code: 'AUTH_ACCOUNT_LOCKED',
        message: 'Your account has been temporarily locked due to multiple failed login attempts.',
        actionableSteps: [
          'Wait 15 minutes before attempting to sign in again',
          'Contact support if you believe this is an error',
          'Use the "Forgot Password" link to reset your password',
        ],
        developmentDetails: 'Account locked due to rate limiting or security policy violations.',
        documentationLinks: ['/docs/security#account-lockout'],
      },
    }

    const config = errorMap[type]
    return ErrorHandler.createError(
      config.code,
      config.message,
      'authentication',
      type === 'account_locked' ? 'high' : 'medium',
      {
        originalError,
        context,
        actionableSteps: config.actionableSteps,
        developmentDetails: config.developmentDetails,
        documentationLinks: config.documentationLinks,
        productionMessage: config.message,
      }
    )
  }

  /**
   * Handle database errors with context and performance implications
   */
  static createDatabaseError(
    type:
      | 'connection_failed'
      | 'query_error'
      | 'validation_error'
      | 'timeout'
      | 'constraint_violation',
    originalError?: Error | unknown,
    context?: Record<string, unknown>
  ): EnhancedError {
    const errorMap = {
      connection_failed: {
        code: 'DB_CONNECTION_FAILED',
        message: 'Unable to connect to the database. Please try again in a moment.',
        severity: 'critical' as ErrorSeverity,
        actionableSteps: [
          'Refresh the page and try again',
          'Check if the service is experiencing issues on our status page',
        ],
        developmentDetails:
          'Database connection pool exhausted or network connectivity issues. Check DATABASE_URL and connection pool settings.',
        documentationLinks: ['/docs/database#troubleshooting'],
      },
      query_error: {
        code: 'DB_QUERY_ERROR',
        message: 'A database error occurred while processing your request.',
        severity: 'high' as ErrorSeverity,
        actionableSteps: [
          'Try again in a few moments',
          'If the error persists, contact support with the correlation ID',
        ],
        developmentDetails: 'SQL query execution failed. Check query syntax and database schema.',
        documentationLinks: ['/docs/database#query-optimization'],
      },
      validation_error: {
        code: 'DB_VALIDATION_ERROR',
        message: 'The provided data does not meet the required format.',
        severity: 'medium' as ErrorSeverity,
        actionableSteps: [
          'Check that all required fields are provided',
          'Ensure data types match the expected format',
          'Review the API documentation for correct field specifications',
        ],
        developmentDetails:
          'Database constraint validation failed. Check field types, lengths, and constraints.',
        documentationLinks: ['/docs/api#data-validation'],
      },
      timeout: {
        code: 'DB_QUERY_TIMEOUT',
        message: 'The request took too long to process. Please try again.',
        severity: 'medium' as ErrorSeverity,
        actionableSteps: [
          'Retry the request with a smaller dataset',
          'Consider breaking large operations into smaller chunks',
        ],
        developmentDetails:
          'Query execution exceeded timeout threshold. Consider adding indexes or optimizing query.',
        documentationLinks: ['/docs/database#performance-optimization'],
      },
      constraint_violation: {
        code: 'DB_CONSTRAINT_VIOLATION',
        message: 'The operation violates data integrity constraints.',
        severity: 'medium' as ErrorSeverity,
        actionableSteps: [
          'Ensure all referenced records exist',
          'Check for duplicate values in unique fields',
          'Verify foreign key relationships are valid',
        ],
        developmentDetails:
          'Database constraint violation (foreign key, unique, check, etc.). Review constraint definitions.',
        documentationLinks: ['/docs/database#constraints'],
      },
    }

    const config = errorMap[type]
    return ErrorHandler.createError(config.code, config.message, 'database', config.severity, {
      originalError,
      context,
      actionableSteps: config.actionableSteps,
      developmentDetails: config.developmentDetails,
      documentationLinks: config.documentationLinks,
      productionMessage: config.message,
    })
  }

  /**
   * Handle validation errors from Zod or other validation libraries
   */
  static createValidationError(
    zodError: ZodError,
    context?: Record<string, unknown>
  ): EnhancedError {
    const fieldErrors = zodError.errors.map(error => {
      const path = error.path.join('.')
      return `${path}: ${error.message}`
    })

    const actionableSteps = [
      'Review the following field errors and correct them:',
      ...fieldErrors.map(error => `• ${error}`),
      'Ensure all required fields are provided with correct data types',
    ]

    return ErrorHandler.createError(
      'VALIDATION_ERROR',
      'Invalid input data provided.',
      'validation',
      'medium',
      {
        context: {
          ...context,
          fieldErrors,
          invalidFields: zodError.errors.map(e => e.path.join('.')),
        },
        actionableSteps,
        developmentDetails: `Zod validation failed for fields: ${fieldErrors.join(', ')}`,
        documentationLinks: ['/docs/api#request-validation'],
        productionMessage:
          'Please check your input and ensure all required fields are provided correctly.',
      }
    )
  }

  /**
   * Handle rate limiting errors with retry guidance
   */
  static createRateLimitError(
    retryAfter: number,
    limit: number,
    window: number,
    context?: Record<string, unknown>
  ): EnhancedError {
    const retryAfterMinutes = Math.ceil(retryAfter / 60)

    return ErrorHandler.createError(
      'RATE_LIMIT_EXCEEDED',
      `Too many requests. Please wait ${retryAfterMinutes} minute(s) before trying again.`,
      'rate_limiting',
      'medium',
      {
        context: {
          ...context,
          retryAfter,
          limit,
          window,
          retryAfterMinutes,
        },
        actionableSteps: [
          `Wait ${retryAfterMinutes} minute(s) before making another request`,
          'Consider implementing exponential backoff in your client',
          'If you need higher rate limits, contact support to discuss your use case',
        ],
        developmentDetails: `Rate limit of ${limit} requests per ${window}s exceeded. Implement proper rate limiting in client code.`,
        documentationLinks: ['/docs/api#rate-limits'],
        productionMessage: `Rate limit exceeded. Please wait ${retryAfterMinutes} minute(s) before trying again.`,
      }
    )
  }

  /**
   * Convert enhanced error to HTTP response
   */
  static toHttpResponse(error: EnhancedError): NextResponse {
    const statusMap: Record<string, number> = {
      AUTH_TOKEN_EXPIRED: 401,
      AUTH_INVALID_TOKEN: 401,
      AUTH_NO_TOKEN: 401,
      AUTH_INVALID_CREDENTIALS: 401,
      AUTH_ACCOUNT_LOCKED: 423,
      DB_CONNECTION_FAILED: 503,
      DB_QUERY_ERROR: 500,
      DB_VALIDATION_ERROR: 400,
      DB_QUERY_TIMEOUT: 504,
      DB_CONSTRAINT_VIOLATION: 409,
      VALIDATION_ERROR: 400,
      RATE_LIMIT_EXCEEDED: 429,
    }

    const status = statusMap[error.code] || 500

    // Create response body with appropriate level of detail
    const responseBody: any = {
      error: {
        code: error.code,
        message: error.message,
        correlationId: error.correlationId,
        timestamp: error.timestamp,
        category: error.category,
        severity: error.severity,
      },
    }

    // Add actionable steps and documentation links if available
    if (error.actionableSteps?.length) {
      responseBody.error.actionableSteps = error.actionableSteps
    }

    if (error.documentationLinks?.length) {
      responseBody.error.documentationLinks = error.documentationLinks
    }

    // Add development-specific details in non-production environments
    if ((isDevelopment || isTest) && error.details) {
      responseBody.error.details = error.details
      responseBody.error.context = error.context

      if (error.originalError) {
        responseBody.error.originalError = error.originalError
      }

      if (error.stackTrace) {
        responseBody.error.stackTrace = error.stackTrace
      }
    }

    // Add rate limiting headers if applicable
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (error.code === 'RATE_LIMIT_EXCEEDED' && error.context) {
      headers['Retry-After'] = String(error.context.retryAfter || 60)
      headers['X-RateLimit-Limit'] = String(error.context.limit || 60)
      headers['X-RateLimit-Remaining'] = '0'
      headers['X-RateLimit-Reset'] = String(
        Date.now() + ((error.context.retryAfter as number) || 60) * 1000
      )
    }

    return NextResponse.json(responseBody, { status, headers })
  }

  /**
   * Log error for monitoring and alerting
   */
  static logError(error: EnhancedError, request?: NextRequest): void {
    const logData = {
      correlationId: error.correlationId,
      code: error.code,
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: error.timestamp,
      endpoint: error.endpoint,
      userId: error.userId,
      userAgent: request?.headers.get('user-agent'),
      ip: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip'),
      context: error.context,
    }

    // In production, send to monitoring service
    if (isProduction) {
      // TODO: Send to monitoring service (e.g., Sentry, DataDog)
      console.error('ERROR:', JSON.stringify(logData))
    } else {
      // In development, provide detailed console output
      console.error('Enhanced Error:', {
        ...logData,
        originalError: error.originalError,
        stackTrace: error.stackTrace,
      })
    }
  }
}

/**
 * Express-style error handling middleware for API routes
 */
export function withEnhancedErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      // Determine if this is already an enhanced error
      if (error && typeof error === 'object' && 'correlationId' in error) {
        const enhancedError = error as EnhancedError
        ErrorHandler.logError(enhancedError, args[0] as NextRequest)
        return ErrorHandler.toHttpResponse(enhancedError)
      }

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const enhancedError = ErrorHandler.createValidationError(error)
        ErrorHandler.logError(enhancedError, args[0] as NextRequest)
        return ErrorHandler.toHttpResponse(enhancedError)
      }

      // Handle generic errors
      const enhancedError = ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'An unexpected error occurred while processing your request.',
        'internal',
        'high',
        {
          originalError: error,
          developmentDetails: error instanceof Error ? error.message : String(error),
          actionableSteps: [
            'Try refreshing the page and attempting the action again',
            'If the problem persists, please contact support with the correlation ID',
          ],
          documentationLinks: ['/docs/troubleshooting'],
        }
      )

      ErrorHandler.logError(enhancedError, args[0] as NextRequest)
      return ErrorHandler.toHttpResponse(enhancedError)
    }
  }
}
