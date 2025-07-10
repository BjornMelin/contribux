/**
 * Compatibility Layer for Pino Integration
 * Provides seamless migration from existing custom loggers to Pino
 * while maintaining existing API contracts
 */

import { enhancedLogger, pinoSecurityLogger } from './pino-logger'
import type { LogContext, SecurityEventContext } from './pino-config'

/**
 * Enhanced logger that replaces the original logger while maintaining API compatibility
 */
export class CompatibilityLogger {
  /**
   * Debug logging - only in development
   */
  debug(message: string, context?: LogContext): void {
    enhancedLogger.debug(message, context)
  }

  /**
   * Info logging
   */
  info(message: string, context?: LogContext): void {
    enhancedLogger.info(message, context)
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: LogContext): void {
    enhancedLogger.warn(message, context)
  }

  /**
   * Error logging
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    enhancedLogger.error(message, error, context)
  }

  /**
   * Critical error logging - always logged
   */
  critical(message: string, error?: Error | unknown, context?: LogContext): void {
    enhancedLogger.critical(message, error, context)
  }

  /**
   * Security event logging with special handling
   */
  security(message: string, context: SecurityEventContext): void {
    enhancedLogger.security(message, context)
  }

  /**
   * MFA-specific logging
   */
  mfa(
    message: string,
    context: LogContext & { eventType: 'enrollment' | 'verification' | 'disable'; success: boolean }
  ): void {
    enhancedLogger.mfa(message, context)
  }

  /**
   * Authentication logging
   */
  auth(message: string, context: LogContext & { success: boolean; reason?: string }): void {
    enhancedLogger.auth(message, context)
  }

  /**
   * Rate limiting logging
   */
  rateLimit(message: string, context: LogContext & { limit: number; current: number }): void {
    enhancedLogger.rateLimit(message, context)
  }

  /**
   * Performance logging
   */
  performance(
    message: string,
    context: LogContext & { duration: number; operation: string }
  ): void {
    enhancedLogger.performance(message, context)
  }

  /**
   * Database operation logging
   */
  database(
    message: string,
    context: LogContext & { operation: string; duration?: number; success: boolean }
  ): void {
    enhancedLogger.database(message, context)
  }

  /**
   * API request logging
   */
  api(message: string, context: LogContext & { statusCode: number; duration?: number }): void {
    enhancedLogger.api(message, context)
  }
}

/**
 * Enhanced monitoring logger that maintains compatibility with existing monitoring logger
 */
export class CompatibilityMonitoringLogger {
  debug(message: string, context?: LogContext): void {
    enhancedLogger.debug(message, context)
  }

  info(message: string, context?: LogContext): void {
    enhancedLogger.info(message, context)
  }

  warn(message: string, context?: LogContext): void {
    enhancedLogger.warn(message, context)
  }

  error(message: string, context?: LogContext): void {
    enhancedLogger.error(message, undefined, context)
  }
}

/**
 * Enhanced telemetry logger that maintains compatibility with existing telemetry logger
 */
export class CompatibilityTelemetryLogger {
  /**
   * Debug logging with trace context
   */
  debug(message: string, context?: LogContext): void {
    enhancedLogger.debug(message, context)
  }

  /**
   * Info logging with trace context
   */
  info(message: string, context?: LogContext): void {
    enhancedLogger.info(message, context)
  }

  /**
   * Warning logging with trace context
   */
  warn(message: string, context?: LogContext): void {
    enhancedLogger.warn(message, context)
  }

  /**
   * Error logging with trace context
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    enhancedLogger.error(message, error, context)
  }

  /**
   * Critical error logging with trace context
   */
  critical(message: string, error?: Error | unknown, context?: LogContext): void {
    enhancedLogger.critical(message, error, context)
  }

  /**
   * Security event logging with trace context
   */
  security(message: string, context: SecurityEventContext): void {
    enhancedLogger.security(message, context)
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
    enhancedLogger.githubApi(message, context)
  }

  /**
   * Database operation logging with trace context
   */
  database(
    message: string,
    context: LogContext & { operation: string; duration?: number; success: boolean }
  ): void {
    enhancedLogger.database(message, context)
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
    enhancedLogger.vectorSearch(message, context)
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
    enhancedLogger.cache(message, context)
  }

  /**
   * Performance logging with trace context
   */
  performance(
    message: string,
    context: LogContext & { duration: number; operation: string }
  ): void {
    enhancedLogger.performance(message, context)
  }

  /**
   * API request logging with trace context
   */
  api(message: string, context: LogContext & { statusCode: number; duration?: number }): void {
    enhancedLogger.api(message, context)
  }

  /**
   * Authentication logging with trace context
   */
  auth(message: string, context: LogContext & { success: boolean; reason?: string }): void {
    enhancedLogger.auth(message, context)
  }

  /**
   * Rate limiting logging with trace context
   */
  rateLimit(message: string, context: LogContext & { limit: number; current: number }): void {
    enhancedLogger.rateLimit(message, context)
  }

  /**
   * MFA logging with trace context
   */
  mfa(
    message: string,
    context: LogContext & { eventType: 'enrollment' | 'verification' | 'disable'; success: boolean }
  ): void {
    enhancedLogger.mfa(message, context)
  }
}

/**
 * Export compatibility instances that can replace existing loggers
 */
export const compatibilityLogger = new CompatibilityLogger()
export const compatibilityMonitoringLogger = new CompatibilityMonitoringLogger()
export const compatibilityTelemetryLogger = new CompatibilityTelemetryLogger()

/**
 * Export compatibility security logger
 */
export const compatibilitySecurityLogger = {
  mfaEnrollment: pinoSecurityLogger.mfaEnrollment,
  mfaVerification: pinoSecurityLogger.mfaVerification,
  authenticationFailure: pinoSecurityLogger.authenticationFailure,
  authenticationSuccess: pinoSecurityLogger.authenticationSuccess,
  csrfViolation: pinoSecurityLogger.csrfViolation,
  rateLimitExceeded: pinoSecurityLogger.rateLimitExceeded,
}

/**
 * Export compatibility telemetry security logger
 */
export const compatibilityTelemetrySecurityLogger = {
  mfaEnrollment: pinoSecurityLogger.mfaEnrollment,
  mfaVerification: pinoSecurityLogger.mfaVerification,
  authenticationFailure: pinoSecurityLogger.authenticationFailure,
  authenticationSuccess: pinoSecurityLogger.authenticationSuccess,
  csrfViolation: pinoSecurityLogger.csrfViolation,
  rateLimitExceeded: pinoSecurityLogger.rateLimitExceeded,
}

/**
 * Migration helper to get the underlying Pino logger if needed
 */
export function getPinoLogger() {
  return enhancedLogger.getPinoLogger()
}

/**
 * Helper to create child loggers with additional context
 */
export function createChildLogger(context: LogContext) {
  return enhancedLogger.child(context)
}

/**
 * Helper to flush all pending log messages
 */
export function flushLogs() {
  enhancedLogger.flush()
}

/**
 * Helper to check if a log level is enabled
 */
export function isLogLevelEnabled(level: string): boolean {
  return enhancedLogger.isLevelEnabled(level)
}

export default compatibilityLogger
