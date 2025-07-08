/**
 * Simple logger module for security and monitoring
 * Following KISS principles - only what we need
 */

export interface LogContext {
  [key: string]: unknown
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

class Logger {
  private readonly isDevelopment = process.env.NODE_ENV !== 'production'

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString()
    const _logEntry = {
      timestamp,
      level,
      message,
      ...context,
    }

    // In production, you might send to a logging service
    // For now, just use console methods
    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          // biome-ignore lint/suspicious/noConsole: Logger intentionally uses console for development
          console.debug(`[${timestamp}] DEBUG: ${message}`, context || {})
        }
        break
      case 'info':
        // biome-ignore lint/suspicious/noConsole: Logger intentionally uses console for output
        console.info(`[${timestamp}] INFO: ${message}`, context || {})
        break
      case 'warn':
        // biome-ignore lint/suspicious/noConsole: Logger intentionally uses console for warnings
        console.warn(`[${timestamp}] WARN: ${message}`, context || {})
        break
      case 'error':
        // biome-ignore lint/suspicious/noConsole: Logger intentionally uses console for errors
        console.error(`[${timestamp}] ERROR: ${message}`, context || {})
        break
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context)
  }
}

// Export singleton instance
export const logger = new Logger()
