/**
 * Production-Ready Pino Configuration
 * High-performance structured logging with environment-specific settings
 */

import pino from 'pino'
import { env } from '@/lib/validation/env'

// Define log levels with numeric values
const _logLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  critical: 60,
}

// Custom log level for security events
const customLevels = {
  security: 55,
}

/**
 * Create production-optimized Pino configuration
 */
function createPinoConfig() {
  const isDevelopment = env.NODE_ENV === 'development'
  const isProduction = env.NODE_ENV === 'production'
  const isTest = env.NODE_ENV === 'test'

  // Base configuration
  const baseConfig: pino.LoggerOptions = {
    name: 'contribux',
    level: isDevelopment ? 'debug' : isProduction ? 'info' : 'error',
    customLevels,
    useOnlyCustomLevels: false,

    // Structured logging formatters
    formatters: {
      level: (label: string, number: number) => ({
        level: label,
        levelValue: number,
      }),

      // Add service metadata
      bindings: bindings => ({
        service: 'contribux',
        version: process.env.npm_package_version || '0.1.0',
        environment: env.NODE_ENV,
        pid: bindings.pid,
        hostname: bindings.hostname,
      }),
    },

    // Redact sensitive information
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        'password',
        'token',
        'apiKey',
        'secret',
        'accessToken',
        'refreshToken',
        'sessionId',
        'csrfToken',
        'email',
        'ip',
        'userAgent',
        'context.password',
        'context.token',
        'context.apiKey',
        'context.secret',
        'context.accessToken',
        'context.refreshToken',
        'context.sessionId',
        'context.csrfToken',
        'context.email',
        'context.ip',
        'context.userAgent',
      ],
      remove: true,
    },

    // Timestamp configuration
    timestamp: isProduction ? pino.stdTimeFunctions.isoTime : pino.stdTimeFunctions.isoTime,

    // Serializers for common objects
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },

    // Performance optimization - async logging is default
  }

  // Environment-specific configurations
  if (isDevelopment) {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname,version,service',
          singleLine: false,
          hideObject: false,
          messageFormat: '{levelname} - {msg}',
          errorLikeObjectKeys: ['err', 'error'],
          messageKey: 'msg',
          timestampKey: 'time',
          levelKey: 'level',
        },
      },
    }
  }

  if (isProduction) {
    return {
      ...baseConfig,
      // Production uses JSON output for log aggregation
      transport: {
        targets: [
          {
            target: 'pino/file',
            options: {
              destination: 1, // stdout
              mkdir: true,
            },
            level: 'info',
          },
          {
            target: 'pino/file',
            options: {
              destination: 2, // stderr
              mkdir: true,
            },
            level: 'error',
          },
        ],
      },
    }
  }

  if (isTest) {
    return {
      ...baseConfig,
      level: 'silent', // Minimal logging in tests
    }
  }

  return baseConfig
}

/**
 * Create a child logger with correlation context
 */
export function createChildLogger(parent: pino.Logger, context: Record<string, unknown>) {
  return parent.child(context)
}

/**
 * Create the main Pino logger instance
 */
export const createPinoLogger = () => {
  const config = createPinoConfig()
  return pino(config)
}
/**
 * Create Pino logger with OpenTelemetry integration for enhanced observability
 * Follows 2025 best practices for correlation with traces and metrics
 */
export const createPinoLoggerWithOtel = () => {
  const config = createPinoConfig()

  // Enhanced configuration for OpenTelemetry correlation
  const otelConfig: pino.LoggerOptions = {
    ...config,

    // Add OpenTelemetry correlation
    mixin() {
      const trace = require('@opentelemetry/api').trace
      const span = trace.getActiveSpan()

      if (span) {
        const spanContext = span.spanContext()
        return {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          traceFlags: spanContext.traceFlags,
        }
      }

      return {}
    },

    // Enhanced formatters with correlation IDs
    formatters: {
      ...config.formatters,

      // Add correlation metadata to all logs
      bindings: bindings => ({
        ...config.formatters?.bindings?.(bindings),
        correlationId: crypto.randomUUID(),
        timestamp: Date.now(),
      }),
    },
  }

  return pino(otelConfig)
}

/**
 * Create child logger with enhanced context for error monitoring
 */
export const createErrorLogger = (context: {
  component?: string
  operation?: string
  userId?: string
  sessionId?: string
  requestId?: string
}) => {
  const logger = createPinoLoggerWithOtel()

  return logger.child({
    context: {
      ...context,
      errorMonitoring: true,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Export the configured Pino instance
 */
export const pinoLogger = createPinoLogger()

/**
 * Types for enhanced logging
 */
export interface LogContext {
  userId?: string
  sessionId?: string
  requestId?: string
  traceId?: string
  spanId?: string
  ip?: string
  userAgent?: string
  path?: string
  method?: string
  statusCode?: number
  duration?: number
  component?: string
  operation?: string
  success?: boolean
  error?: Error | string
  [key: string]: unknown
}

/**
 * Security event context
 */
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
  resource?: string
  reason?: string
}

/**
 * Performance logging context
 */
export interface PerformanceContext extends LogContext {
  operation: string
  duration: number
  memoryUsage?: {
    heapUsed: number
    heapTotal: number
    external: number
  }
}

export default pinoLogger
