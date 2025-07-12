/**
 * Mock for enhanced error handler
 */

// Mock error handler functions - converted from static-only class
export function errorHandlerLog(error: unknown, context?: string) {
  console.error('Mock ErrorHandler:', error, context)
}

export function isEnhancedError(error: unknown): boolean {
  return error instanceof Error
}

interface ErrorWithCode extends Error {
  code?: string
}

export function createError(message: string, code?: string): ErrorWithCode {
  const error = new Error(message) as ErrorWithCode
  error.code = code
  return error
}

// Grouped exports for easier migration
export const ErrorHandler = {
  log: errorHandlerLog,
  isEnhancedError,
  createError,
} as const

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
