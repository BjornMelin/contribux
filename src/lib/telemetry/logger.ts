/**
 * Enhanced Logger with OpenTelemetry Integration and Pino Structured Logging
 * 
 * Extends the Pino logger with trace correlation and telemetry context
 */

import { 
  compatibilityTelemetryLogger, 
  type LogContext, 
  type SecurityEventContext 
} from '@/lib/logging'
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
  private enhanceContext<T extends LogContext>(context?: T): T & TelemetryLogContext {
    const traceContext = getTraceContext()
    return {
      ...context,
      ...traceContext,
    } as T & TelemetryLogContext
  }

  /**
   * Debug logging with trace context
   */
  debug(message: string, context?: LogContext): void {
    compatibilityTelemetryLogger.debug(message, this.enhanceContext(context))
  }

  /**
   * Info logging with trace context
   */
  info(message: string, context?: LogContext): void {
    compatibilityTelemetryLogger.info(message, this.enhanceContext(context))
  }

  /**
   * Warning logging with trace context
   */
  warn(message: string, context?: LogContext): void {
    compatibilityTelemetryLogger.warn(message, this.enhanceContext(context))
  }

  /**
   * Error logging with trace context
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    compatibilityTelemetryLogger.error(message, error, this.enhanceContext(context))
  }

  /**
   * Critical error logging with trace context
   */
  critical(message: string, error?: Error | unknown, context?: LogContext): void {
    compatibilityTelemetryLogger.critical(message, error, this.enhanceContext(context))
  }

  /**
   * Security event logging with trace context
   */
  security(message: string, context: SecurityEventContext): void {
    compatibilityTelemetryLogger.security(message, this.enhanceContext(context) as SecurityEventContext)
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
    compatibilityTelemetryLogger.githubApi(
      message,
      this.enhanceContext({
        ...context,
        component: 'github-api',
      })
    )
  }

  /**
   * Database operation logging with trace context
   */
  database(
    message: string,
    context: LogContext & { operation: string; duration?: number; success: boolean }
  ): void {
    compatibilityTelemetryLogger.database(message, this.enhanceContext(context))
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
    compatibilityTelemetryLogger.vectorSearch(
      message,
      this.enhanceContext({
        ...context,
        component: 'vector-search',
      })
    )
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
    compatibilityTelemetryLogger.cache(
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
    compatibilityTelemetryLogger.performance(message, this.enhanceContext(context))
  }

  /**
   * API request logging with trace context
   */
  api(message: string, context: LogContext & { statusCode: number; duration?: number }): void {
    compatibilityTelemetryLogger.api(message, this.enhanceContext(context))
  }

  /**
   * Authentication logging with trace context
   */
  auth(message: string, context: LogContext & { success: boolean; reason?: string }): void {
    compatibilityTelemetryLogger.auth(
      message,
      this.enhanceContext(context) as LogContext & { success: boolean; reason?: string }
    )
  }

  /**
   * Rate limiting logging with trace context
   */
  rateLimit(message: string, context: LogContext & { limit: number; current: number }): void {
    compatibilityTelemetryLogger.rateLimit(
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
    compatibilityTelemetryLogger.mfa(
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
