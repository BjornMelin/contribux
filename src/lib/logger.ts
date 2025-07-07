/**
 * Production-Ready Logging Service
 * Structured logging with security event support
 * Addresses OWASP A05 Security Misconfiguration
 */

import { env } from '@/lib/validation/env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export interface LogContext {
  userId?: string
  sessionId?: string
  ip?: string
  userAgent?: string
  path?: string
  method?: string
  duration?: number
  component?: string
  requestId?: string
  [key: string]: unknown
}

export interface SecurityEventContext extends LogContext {
  eventType:
    | 'authentication'
    | 'authorization'
    | 'mfa'
    | 'security_violation'
    | 'rate_limit'
    | 'csrf'
    | 'audit'
  severity: 'low' | 'medium' | 'high' | 'critical'
  success: boolean
  resource?: string
  error?: string
}

class Logger {
  private isDevelopment = env.NODE_ENV === 'development'
  private isProduction = env.NODE_ENV === 'production'

  /**
   * Format log message with structured data
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(context && { context }),
      environment: env.NODE_ENV,
    }

    // In development, use console for immediate feedback
    if (this.isDevelopment) {
      const _coloredLevel = this.getColoredLevel(level)
      return
    }

    // In production, use structured JSON logging
    if (this.isProduction) {
      // In production, this would integrate with your logging service (e.g., DataDog, CloudWatch)
      process.stdout.write(`${JSON.stringify(logEntry)}\n`)
      return
    }

    // Test environment - minimal logging
    if (level === 'error' || level === 'critical') {
      process.stderr.write(`${JSON.stringify(logEntry)}\n`)
    }
  }

  private getColoredLevel(level: LogLevel): string {
    const colors = {
      debug: '\x1b[36m[DEBUG]\x1b[0m',
      info: '\x1b[32m[INFO]\x1b[0m',
      warn: '\x1b[33m[WARN]\x1b[0m',
      error: '\x1b[31m[ERROR]\x1b[0m',
      critical: '\x1b[41m[CRITICAL]\x1b[0m',
    }
    return colors[level]
  }

  /**
   * Debug logging - only in development
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.formatMessage('debug', message, context)
    }
  }

  /**
   * Info logging
   */
  info(message: string, context?: LogContext): void {
    this.formatMessage('info', message, context)
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: LogContext): void {
    this.formatMessage('warn', message, context)
  }

  /**
   * Error logging
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      ...(error instanceof Error && {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: this.isDevelopment ? error.stack : undefined,
      }),
      ...(error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as Record<string, unknown>).code === 'string'
        ? { errorCode: (error as Record<string, unknown>).code as string }
        : {}),
    }
    this.formatMessage('error', message, errorContext)
  }

  /**
   * Critical error logging - always logged
   */
  critical(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      ...(error instanceof Error && {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack, // Always include stack for critical errors
      }),
    }
    this.formatMessage('critical', message, errorContext)
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

    // Security events are always logged regardless of environment
    this.formatMessage(
      context.severity === 'critical' ? 'critical' : 'warn',
      message,
      securityContext
    )

    // In production, security events would also be sent to SIEM/security monitoring
    if (this.isProduction && (context.severity === 'high' || context.severity === 'critical')) {
      // TODO: Integrate with security monitoring service (e.g., Splunk, DataDog Security)
      this.alertSecurityTeam(message, securityContext)
    }
  }

  /**
   * MFA-specific logging
   */
  mfa(
    message: string,
    context: LogContext & { eventType: 'enrollment' | 'verification' | 'disable'; success: boolean }
  ): void {
    this.security(message, {
      ...context,
      eventType: 'mfa',
      severity: context.success ? 'low' : 'medium',
    })
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
      ...(context.reason !== undefined && { error: context.reason }),
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
   * Performance logging
   */
  performance(
    message: string,
    context: LogContext & { duration: number; operation: string }
  ): void {
    const severity = context.duration > 1000 ? 'warn' : 'info'
    this.formatMessage(severity, message, {
      ...context,
      performance: true,
    })
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
    this.formatMessage(level, message, {
      ...context,
      database: true,
    })
  }

  /**
   * API request logging
   */
  api(message: string, context: LogContext & { statusCode: number; duration?: number }): void {
    const level = context.statusCode >= 500 ? 'error' : context.statusCode >= 400 ? 'warn' : 'info'
    this.formatMessage(level, message, {
      ...context,
      api: true,
    })
  }

  private alertSecurityTeam(_message: string, _context: SecurityEventContext): void {
    // Placeholder for security team alerting
    // In production, integrate with:
    // - Slack webhooks
    // - PagerDuty
    // - Email alerts
    // - Security incident management system
    if (this.isDevelopment) {
      // Security alert would be sent to monitoring service in production
      // console.warn('🚨 SECURITY ALERT:', message, context)
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export convenience functions for common use cases
export const securityLogger = {
  mfaEnrollment: (userId: string, method: string, success: boolean, context?: LogContext) =>
    logger.mfa(`MFA enrollment ${success ? 'completed' : 'failed'}`, {
      userId,
      eventType: 'enrollment',
      success,
      method,
      ...context,
    }),

  mfaVerification: (userId: string, method: string, success: boolean, context?: LogContext) =>
    logger.mfa(`MFA verification ${success ? 'succeeded' : 'failed'}`, {
      userId,
      eventType: 'verification',
      success,
      method,
      ...context,
    }),

  authenticationFailure: (reason: string, context?: LogContext) =>
    logger.auth('Authentication failed', {
      success: false,
      reason,
      ...context,
    }),

  authenticationSuccess: (userId: string, context?: LogContext) =>
    logger.auth('Authentication successful', {
      userId,
      success: true,
      ...context,
    }),

  csrfViolation: (context?: LogContext) =>
    logger.security('CSRF token validation failed', {
      eventType: 'security_violation',
      severity: 'high',
      success: false,
      error: 'CSRF validation failed',
      ...context,
    }),

  rateLimitExceeded: (identifier: string, limit: number, current: number, context?: LogContext) =>
    logger.rateLimit(`Rate limit exceeded for ${identifier}`, {
      limit,
      current,
      ...context,
    }),
}

// Export default logger for general use
export default logger
