/**
 * Pino Structured Logging - Main Export
 * High-performance structured logging for production debugging
 */

// Core Pino configuration and logger
export {
  pinoLogger,
  createPinoLogger,
  createChildLogger,
  type LogContext,
  type SecurityEventContext,
  type PerformanceContext,
} from './pino-config'

// Enhanced Pino logger with extended functionality
export {
  PinoEnhancedLogger,
  enhancedLogger,
  pinoSecurityLogger,
} from './pino-logger'

// Import for use within this file
import { enhancedLogger, pinoSecurityLogger } from './pino-logger'

// Middleware for Next.js integration
export {
  withRequestLogging,
  withApiLogging,
  withPerformanceLogging,
  withDatabaseLogging,
  getRequestContext,
  getRequestLogger,
  addRequestIdHeaders,
  generateRequestId,
  extractIpAddress,
  createRequestContext,
  type RequestContext,
} from './middleware'

// Compatibility layer for existing loggers
export {
  compatibilityLogger,
  compatibilityMonitoringLogger,
  compatibilityTelemetryLogger,
  compatibilitySecurityLogger,
  compatibilityTelemetrySecurityLogger,
  getPinoLogger,
  flushLogs,
  isLogLevelEnabled,
} from './compatibility'

// Re-export enhanced logger as default
export { enhancedLogger as default } from './pino-logger'

/**
 * Convenience function to create a logger with request context
 */
export function createRequestLogger(context: {
  requestId?: string
  userId?: string
  sessionId?: string
  ip?: string
  userAgent?: string
  path?: string
  method?: string
}) {
  const { enhancedLogger } = require('./pino-logger')
  return enhancedLogger.child(context)
}

/**
 * Convenience function to create a logger with trace context
 */
export function createTraceLogger(context: {
  traceId?: string
  spanId?: string
  operation?: string
  component?: string
}) {
  const { enhancedLogger } = require('./pino-logger')
  return enhancedLogger.child(context)
}

/**
 * Convenience function to create a logger with security context
 */
export function createSecurityLogger(context: {
  userId?: string
  sessionId?: string
  ip?: string
  component?: string
}) {
  const { enhancedLogger } = require('./pino-logger')
  return enhancedLogger.child(context)
}

/**
 * Convenience function to create a logger with performance context
 */
export function createPerformanceLogger(context: {
  operation?: string
  component?: string
  requestId?: string
}) {
  const { enhancedLogger } = require('./pino-logger')
  return enhancedLogger.child(context)
}

/**
 * Convenience function to create a logger with database context
 */
export function createDatabaseLogger(context: {
  operation?: string
  table?: string
  requestId?: string
}) {
  const { enhancedLogger } = require('./pino-logger')
  return enhancedLogger.child(context)
}

/**
 * Convenience function to create a logger with API context
 */
export function createApiLogger(context: {
  endpoint?: string
  method?: string
  requestId?: string
  version?: string
}) {
  const { enhancedLogger } = require('./pino-logger')
  return enhancedLogger.child(context)
}

/**
 * Export commonly used logger instances for different contexts
 */
export const logger = enhancedLogger
export const securityLogger = pinoSecurityLogger
export const requestLogger = createRequestLogger
export const traceLogger = createTraceLogger
export const performanceLogger = createPerformanceLogger
export const databaseLogger = createDatabaseLogger
export const apiLogger = createApiLogger
