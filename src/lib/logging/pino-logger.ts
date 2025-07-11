/**
 * Enhanced Pino Logger Integration
 * Bridges existing custom logging with high-performance Pino structured logging
 */

import type { Logger as PinoLogger } from 'pino'
import { env } from '@/lib/validation/env'
import {
  type LogContext,
  type PerformanceContext,
  pinoLogger,
  type SecurityEventContext,
} from './pino-config'

/**
 * Enhanced logger class that uses Pino for high-performance structured logging
 * while maintaining the existing API for backward compatibility
 */
export class PinoEnhancedLogger {
  private readonly logger: PinoLogger
  private readonly isDevelopment = env.NODE_ENV === 'development'
  private readonly isProduction = env.NODE_ENV === 'production'

  constructor(logger: PinoLogger = pinoLogger) {
    this.logger = logger
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): PinoEnhancedLogger {
    return new PinoEnhancedLogger(this.logger.child(context))
  }

  /**
   * Debug logging - only in development
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.logger.debug(context || {}, message)
    }
  }

  /**
   * Info logging
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(context || {}, message)
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(context || {}, message)
  }

  /**
   * Error logging with enhanced error serialization
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      ...(error instanceof Error && {
        error: {
          name: error.name,
          message: error.message,
          stack: this.isDevelopment ? error.stack : undefined,
        },
      }),
      ...(error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as Record<string, unknown>).code === 'string'
        ? { errorCode: (error as Record<string, unknown>).code }
        : {}),
    }

    this.logger.error(errorContext, message)
  }

  /**
   * Critical error logging - always includes stack trace
   */
  critical(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      ...(error instanceof Error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack, // Always include stack for critical errors
        },
      }),
    }

    this.logger.fatal(errorContext, message)
  }

  /**
   * Security event logging with special handling
   */
  security(message: string, context: SecurityEventContext): void {
    const securityContext = {
      ...context,
      security: true,
      timestamp: new Date().toISOString(),
    }

    // Use custom security level if available, otherwise use appropriate level
    const logLevel = context.severity === 'critical' ? 'fatal' : 'warn'

    if (this.logger.isLevelEnabled('security')) {
      // Use custom security level
      ;(this.logger as any).security(securityContext, message)
    } else {
      // Fallback to standard levels
      this.logger[logLevel](securityContext, message)
    }

    // In production, high/critical security events trigger additional alerting
    if (this.isProduction && (context.severity === 'high' || context.severity === 'critical')) {
      this.alertSecurityTeam(message, securityContext)
    }
  }

  /**
   * Performance logging with memory usage tracking
   */
  performance(message: string, context: PerformanceContext): void {
    const memoryUsage = process.memoryUsage()
    const performanceContext = {
      ...context,
      performance: true,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
      },
    }

    const level = context.duration > 1000 ? 'warn' : 'info'
    this.logger[level](performanceContext, message)
  }

  /**
   * Database operation logging
   */
  database(
    message: string,
    context: LogContext & { operation: string; duration?: number; success: boolean }
  ): void {
    const level = context.success
      ? context.duration && context.duration > 500
        ? 'warn'
        : 'info'
      : 'error'

    this.logger[level](
      {
        ...context,
        database: true,
      },
      message
    )
  }

  /**
   * API request logging
   */
  api(message: string, context: LogContext & { statusCode: number; duration?: number }): void {
    const level = context.statusCode >= 500 ? 'error' : context.statusCode >= 400 ? 'warn' : 'info'

    this.logger[level](
      {
        ...context,
        api: true,
      },
      message
    )
  }

  /**
   * Authentication logging
   */
  auth(message: string, context: LogContext & { success: boolean; reason?: string }): void {
    const securityContext: SecurityEventContext = {
      ...context,
      eventType: 'authentication',
      severity: context.success ? 'low' : 'medium',
      success: context.success,
      ...(context.reason && { reason: context.reason }),
    }
    this.security(message, securityContext)
  }

  /**
   * Rate limiting logging
   */
  rateLimit(message: string, context: LogContext & { limit: number; current: number }): void {
    this.security(message, {
      ...context,
      eventType: 'rate_limit',
      severity: 'medium',
      success: false,
    })
  }

  /**
   * MFA logging
   */
  mfa(
    message: string,
    context: LogContext & { eventType: 'enrollment' | 'verification' | 'disable'; success: boolean }
  ): void {
    this.security(message, {
      ...context,
      eventType: 'mfa',
      severity: context.success ? 'low' : 'medium',
      success: context.success,
    })
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
    const enhancedContext = {
      ...context,
      component: 'github-api',
    }

    this.logger[level](enhancedContext, message)
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
    const enhancedContext = {
      ...context,
      component: 'vector-search',
    }

    this.logger[level](enhancedContext, message)
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
    this.logger.debug(
      {
        ...context,
        component: 'cache',
      },
      message
    )
  }

  /**
   * HTTP request logging with correlation IDs
   */
  httpRequest(
    message: string,
    context: LogContext & {
      method: string
      path: string
      statusCode: number
      duration: number
      responseSize?: number
    }
  ): void {
    const level = context.statusCode >= 500 ? 'error' : context.statusCode >= 400 ? 'warn' : 'info'

    this.logger[level](
      {
        ...context,
        component: 'http-request',
      },
      message
    )
  }

  /**
   * Application startup logging
   */
  startup(message: string, context?: LogContext): void {
    this.logger.info(
      {
        ...context,
        component: 'startup',
      },
      message
    )
  }

  /**
   * Application shutdown logging
   */
  shutdown(message: string, context?: LogContext): void {
    this.logger.info(
      {
        ...context,
        component: 'shutdown',
      },
      message
    )
  }

  /**
   * Metric logging for observability
   */
  metric(
    message: string,
    context: LogContext & {
      metric: string
      value: number
      unit?: string
      tags?: Record<string, string>
    }
  ): void {
    this.logger.info(
      {
        ...context,
        component: 'metrics',
      },
      message
    )
  }

  /**
   * Business logic logging
   */
  business(
    message: string,
    context: LogContext & {
      event: string
      entity?: string
      entityId?: string
      action?: string
    }
  ): void {
    this.logger.info(
      {
        ...context,
        component: 'business',
      },
      message
    )
  }

  /**
   * Get the underlying Pino logger instance
   */
  getPinoLogger(): PinoLogger {
    return this.logger
  }

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: string): boolean {
    return this.logger.isLevelEnabled(level)
  }

  /**
   * Flush any pending log messages
   */
  flush(): void {
    this.logger.flush()
  }

  /**
   * Private method to alert security team
   */
  private alertSecurityTeam(message: string, context: SecurityEventContext): void {
    // In production, this would integrate with:
    // - Slack webhooks
    // - PagerDuty
    // - Email alerts
    // - Security incident management system

    // For now, we'll log to stderr with high priority
    process.stderr.write(
      `${JSON.stringify({
        alert: 'SECURITY_INCIDENT',
        severity: context.severity,
        message,
        context,
        timestamp: new Date().toISOString(),
      })}\n`
    )
  }
}

/**
 * Create a singleton instance of the enhanced logger
 */
export const enhancedLogger = new PinoEnhancedLogger()

/**
 * Export convenience functions for common use cases
 */
export const pinoSecurityLogger = {
  mfaEnrollment: (userId: string, method: string, success: boolean, context?: LogContext) =>
    enhancedLogger.mfa(`MFA enrollment ${success ? 'completed' : 'failed'}`, {
      userId,
      eventType: 'enrollment',
      success,
      method,
      ...context,
    }),

  mfaVerification: (userId: string, method: string, success: boolean, context?: LogContext) =>
    enhancedLogger.mfa(`MFA verification ${success ? 'succeeded' : 'failed'}`, {
      userId,
      eventType: 'verification',
      success,
      method,
      ...context,
    }),

  authenticationFailure: (reason: string, context?: LogContext) =>
    enhancedLogger.auth('Authentication failed', {
      success: false,
      reason,
      ...context,
    }),

  authenticationSuccess: (userId: string, context?: LogContext) =>
    enhancedLogger.auth('Authentication successful', {
      userId,
      success: true,
      ...context,
    }),

  csrfViolation: (context?: LogContext) =>
    enhancedLogger.security('CSRF token validation failed', {
      eventType: 'security_violation',
      severity: 'high',
      success: false,
      reason: 'CSRF validation failed',
      ...context,
    }),

  rateLimitExceeded: (identifier: string, limit: number, current: number, context?: LogContext) =>
    enhancedLogger.rateLimit(`Rate limit exceeded for ${identifier}`, {
      limit,
      current,
      ...context,
    }),
}

export default enhancedLogger
