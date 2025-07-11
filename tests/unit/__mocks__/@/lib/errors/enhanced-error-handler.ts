/**
 * Mock for enhanced error handler
 */

export class ErrorHandler {
  static log(error: unknown, context?: string) {
    console.error('Mock ErrorHandler:', error, context)
  }

  static isEnhancedError(error: unknown): boolean {
    return error instanceof Error
  }

  static createError(message: string, code?: string) {
    const error = new Error(message)
    ;(error as any).code = code
    return error
  }
}

export class EnhancedError extends Error {
  code: string
  statusCode?: number

  constructor(message: string, code: string, statusCode?: number) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

export const handleAPIError = (error: unknown) => {
  console.error('Mock handleAPIError:', error)
  throw error
}

export const handleDatabaseError = (error: unknown) => {
  console.error('Mock handleDatabaseError:', error)
  throw error
}

export const handleAuthError = (error: unknown) => {
  console.error('Mock handleAuthError:', error)
  throw error
}