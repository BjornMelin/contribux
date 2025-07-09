/**
 * Enhanced Logger with OpenTelemetry Integration
 *
 * Extends the existing logger with trace correlation and structured logging
 */

import { type LogContext, type SecurityEventContext, logger as baseLogger } from '@/lib/logger'
import { getTraceContext } from './utils'

/**
 * Enhanced log context that includes trace information
 */
export interface TelemetryLogContext extends LogContext {
  traceId?: string
  spanId?: string
}

/**
 * Enhanced logger class that automatically adds trace context
 */
class TelemetryLogger {
  /**
   * Add trace context to log context
   */
  private enhanceContext(context?: LogContext): TelemetryLogContext {
    const traceContext = getTraceContext()
    return {
      ...context,
      ...traceContext,
    }
  }

  /**
   * Debug logging with trace context
   */
  debug(message: string, context?: LogContext): void {
    baseLogger.debug(message, this.enhanceContext(context))
  }

  /**
   * Info logging with trace context
   */
  info(message: string, context?: LogContext): void {
    baseLogger.info(message, this.enhanceContext(context))
  }

  /**
   * Warning logging with trace context
   */
  warn(message: string, context?: LogContext): void {
    baseLogger.warn(message, this.enhanceContext(context))
  }

  /**
   * Error logging with trace context
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    baseLogger.error(message, error, this.enhanceContext(context))
  }

  /**
   * Critical error logging with trace context
   */
  critical(message: string, error?: Error | unknown, context?: LogContext): void {
    baseLogger.critical(message, error, this.enhanceContext(context))
  }

  /**
   * Security event logging with trace context
   */
  security(message: string, context: SecurityEventContext): void {
    baseLogger.security(message, this.enhanceContext(context) as SecurityEventContext)
  }

  /**
   * GitHub API operation logging
   */
  githubApi(
    message: string,
    context: LogContext & {
      operation: string
      duration?: number
      rateLimitRemaining?: number
      statusCode?: number
    }
  ): void {
    const level = context.statusCode && context.statusCode >= 400 ? 'error' : 'info'
    const enhancedContext = this.enhanceContext({
      ...context,
      component: 'github-api',
    })

    if (level === 'error') {
      this.error(message, undefined, enhancedContext)
    } else {
      this.info(message, enhancedContext)
    }
  }

  /**
   * Database operation logging with trace context
   */
  database(
    message: string,
    context: LogContext & { operation: string; duration?: number; success: boolean }
  ): void {
    baseLogger.database(message, context)
  }

  /**
   * Vector search operation logging
   */
  vectorSearch(
    message: string,
    context: LogContext & {
      operation: string
      duration?: number
      results?: number
      similarity?: number
    }
  ): void {
    const level = context.duration && context.duration > 100 ? 'warn' : 'info'
    const enhancedContext = this.enhanceContext({
      ...context,
      component: 'vector-search',
    })

    if (level === 'warn') {
      this.warn(message, enhancedContext)
    } else {
      this.info(message, enhancedContext)
    }
  }

  /**
   * Cache operation logging
   */
  cache(
    message: string,
    context: LogContext & {
      operation: 'hit' | 'miss' | 'set' | 'delete'
      key?: string
      ttl?: number
    }
  ): void {
    this.debug(
      message,
      this.enhanceContext({
        ...context,
        component: 'cache',
      })
    )
  }

  /**
   * Performance logging with trace context
   */
  performance(
    message: string,
    context: LogContext & { duration: number; operation: string }
  ): void {
    baseLogger.performance(message, context)
  }

  /**
   * API request logging with trace context
   */
  api(message: string, context: LogContext & { statusCode: number; duration?: number }): void {
    baseLogger.api(message, context)
  }

  /**
   * Authentication logging with trace context
   */
  auth(message: string, context: LogContext & { success: boolean; reason?: string }): void {
    baseLogger.auth(
      message,
      this.enhanceContext(context) as LogContext & { success: boolean; reason?: string }
    )
  }

  /**
   * Rate limiting logging with trace context
   */
  rateLimit(message: string, context: LogContext & { limit: number; current: number }): void {
    baseLogger.rateLimit(
      message,
      this.enhanceContext(context) as LogContext & { limit: number; current: number }
    )
  }

  /**
   * MFA logging with trace context
   */
  mfa(
    message: string,
    context: LogContext & { eventType: 'enrollment' | 'verification' | 'disable'; success: boolean }
  ): void {
    baseLogger.mfa(
      message,
      this.enhanceContext(context) as LogContext & {
        eventType: 'enrollment' | 'verification' | 'disable'
        success: boolean
      }
    )
  }
}

// Export singleton instance
export const telemetryLogger = new TelemetryLogger()

// Export enhanced security logger with trace context
export const telemetrySecurityLogger = {
  mfaEnrollment: (userId: string, method: string, success: boolean, context?: LogContext) =>
    telemetryLogger.mfa(`MFA enrollment ${success ? 'completed' : 'failed'}`, {
      userId,
      eventType: 'enrollment',
      success,
      method,
      ...context,
    }),

  mfaVerification: (userId: string, method: string, success: boolean, context?: LogContext) =>
    telemetryLogger.mfa(`MFA verification ${success ? 'succeeded' : 'failed'}`, {
      userId,
      eventType: 'verification',
      success,
      method,
      ...context,
    }),

  authenticationFailure: (reason: string, context?: LogContext) =>
    telemetryLogger.auth('Authentication failed', {
      success: false,
      reason,
      ...context,
    }),

  authenticationSuccess: (userId: string, context?: LogContext) =>
    telemetryLogger.auth('Authentication successful', {
      userId,
      success: true,
      ...context,
    }),

  csrfViolation: (context?: LogContext) =>
    telemetryLogger.security('CSRF token validation failed', {
      eventType: 'security_violation',
      severity: 'high',
      success: false,
      error: 'CSRF validation failed',
      ...context,
    }),

  rateLimitExceeded: (identifier: string, limit: number, current: number, context?: LogContext) =>
    telemetryLogger.rateLimit(`Rate limit exceeded for ${identifier}`, {
      limit,
      current,
      ...context,
    }),
}

export default telemetryLogger
