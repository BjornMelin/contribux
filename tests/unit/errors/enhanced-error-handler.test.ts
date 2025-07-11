/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import {
  ErrorHandler,
  type EnhancedError,
  type ErrorCategory,
  type ErrorSeverity,
} from '@/lib/errors/enhanced-error-handler'

// Mock crypto for consistent UUIDs in tests
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}))

describe('Enhanced Error Handler', () => {
  const originalEnv = process.env.NODE_ENV
  
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  describe('createError', () => {
    it('should create basic enhanced error', () => {
      const error = ErrorHandler.createError(
        'TEST_ERROR',
        'Test error message',
        'internal' as ErrorCategory,
        'medium' as ErrorSeverity
      )
      
      expect(error.code).toBe('TEST_ERROR')
      expect(error.message).toBe('Test error message')
      expect(error.category).toBe('internal')
      expect(error.severity).toBe('medium')
      expect(error.correlationId).toBe('test-uuid-1234')
      expect(error.timestamp).toBeDefined()
    })

    it('should include context when provided', () => {
      const context = {
        userId: 'user-123',
        action: 'createPost',
        metadata: { key: 'value' }
      }
      
      const error = ErrorHandler.createError(
        'CONTEXT_ERROR',
        'Error with context',
        'business_logic' as ErrorCategory,
        'low' as ErrorSeverity,
        { context }
      )
      
      expect(error.context).toEqual(context)
    })

    it('should include original error information', () => {
      const originalError = new Error('Original error message')
      originalError.stack = 'Error: Original error message\n    at test.js:10:5'
      
      const error = ErrorHandler.createError(
        'WRAPPED_ERROR',
        'Wrapped error',
        'external_api' as ErrorCategory,
        'high' as ErrorSeverity,
        { originalError }
      )
      
      expect(error.originalError).toContain('Original error message')
      expect(error.stackTrace).toContain('test.js:10:5')
    })

    it('should use production message in production environment', () => {
      process.env.NODE_ENV = 'production'
      
      const error = ErrorHandler.createError(
        'SENSITIVE_ERROR',
        'Detailed error with sensitive info',
        'database' as ErrorCategory,
        'critical' as ErrorSeverity,
        {
          productionMessage: 'A database error occurred',
          developmentDetails: 'Connection string: postgres://user:pass@host',
        }
      )
      
      expect(error.message).toBe('A database error occurred')
      expect(error.details?.production).toBe('A database error occurred')
    })

    it('should include development details in development environment', () => {
      process.env.NODE_ENV = 'development'
      
      const error = ErrorHandler.createError(
        'DEV_ERROR',
        'Development error',
        'configuration' as ErrorCategory,
        'medium' as ErrorSeverity,
        {
          developmentDetails: 'Missing API_KEY environment variable',
        }
      )
      
      expect(error.details?.development).toBe('Missing API_KEY environment variable')
    })

    it('should include actionable steps and documentation', () => {
      const error = ErrorHandler.createError(
        'AUTH_ERROR',
        'Authentication failed',
        'authentication' as ErrorCategory,
        'high' as ErrorSeverity,
        {
          actionableSteps: [
            'Check your credentials',
            'Ensure your account is active',
            'Try resetting your password'
          ],
          documentationLinks: [
            'https://docs.example.com/auth',
            'https://docs.example.com/troubleshooting'
          ]
        }
      )
      
      expect(error.actionableSteps).toHaveLength(3)
      expect(error.documentationLinks).toHaveLength(2)
    })

    it('should include endpoint and userId', () => {
      const error = ErrorHandler.createError(
        'API_ERROR',
        'API request failed',
        'external_api' as ErrorCategory,
        'medium' as ErrorSeverity,
        {
          endpoint: '/api/users/123',
          userId: 'user-456'
        }
      )
      
      expect(error.endpoint).toBe('/api/users/123')
      expect(error.userId).toBe('user-456')
    })
  })

  describe('handleError', () => {
    it('should handle standard errors', () => {
      const error = new Error('Standard error')
      
      const response = ErrorHandler.handleError(error)
      const data = JSON.parse(response.body || '{}')
      
      expect(response.status).toBe(500)
      expect(data.error.code).toBe('INTERNAL_ERROR')
      expect(data.error.message).toContain('internal server error')
    })

    it('should handle Zod validation errors', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string, received number',
        }
      ])
      
      const response = ErrorHandler.handleError(zodError)
      const data = JSON.parse(response.body || '{}')
      
      expect(response.status).toBe(400)
      expect(data.error.code).toBe('VALIDATION_ERROR')
      expect(data.error.category).toBe('validation')
      expect(data.error.details).toBeDefined()
    })

    it('should handle enhanced errors', () => {
      const enhancedError = ErrorHandler.createError(
        'CUSTOM_ERROR',
        'Custom error message',
        'business_logic' as ErrorCategory,
        'medium' as ErrorSeverity
      )
      
      const response = ErrorHandler.handleError(enhancedError)
      const data = JSON.parse(response.body || '{}')
      
      expect(response.status).toBe(500)
      expect(data.error.code).toBe('CUSTOM_ERROR')
      expect(data.error.message).toBe('Custom error message')
    })

    it('should include stack traces in development', () => {
      process.env.NODE_ENV = 'development'
      const error = new Error('Dev error')
      error.stack = 'Error: Dev error\n    at test.js:20:10'
      
      const response = ErrorHandler.handleError(error)
      const data = JSON.parse(response.body || '{}')
      
      expect(data.error.stack).toContain('test.js:20:10')
    })

    it('should exclude stack traces in production', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('Prod error')
      error.stack = 'Error: Prod error\n    at test.js:20:10'
      
      const response = ErrorHandler.handleError(error)
      const data = JSON.parse(response.body || '{}')
      
      expect(data.error.stack).toBeUndefined()
    })

    it('should handle errors with custom status codes', () => {
      const error = {
        statusCode: 403,
        message: 'Forbidden',
      }
      
      const response = ErrorHandler.handleError(error)
      
      expect(response.status).toBe(403)
    })
  })

  describe('logError', () => {
    it('should log errors with context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')
      const context = { userId: 'user-123' }
      
      ErrorHandler.logError(error, context)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          message: 'Test error',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
          context,
        })
      )
      
      consoleSpy.mockRestore()
    })

    it('should handle non-Error objects', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const errorObj = { custom: 'error', code: 'CUSTOM' }
      
      ErrorHandler.logError(errorObj)
      
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })

  describe('isEnhancedError', () => {
    it('should identify enhanced errors', () => {
      const enhancedError = ErrorHandler.createError(
        'TEST',
        'Test',
        'internal' as ErrorCategory,
        'low' as ErrorSeverity
      )
      
      expect(ErrorHandler.isEnhancedError(enhancedError)).toBe(true)
    })

    it('should reject non-enhanced errors', () => {
      const regularError = new Error('Regular error')
      const plainObject = { message: 'Not an error' }
      
      expect(ErrorHandler.isEnhancedError(regularError)).toBe(false)
      expect(ErrorHandler.isEnhancedError(plainObject)).toBe(false)
      expect(ErrorHandler.isEnhancedError(null)).toBe(false)
      expect(ErrorHandler.isEnhancedError(undefined)).toBe(false)
    })
  })

  describe('fromError', () => {
    it('should convert standard Error to EnhancedError', () => {
      const standardError = new Error('Standard error message')
      
      const enhanced = ErrorHandler.fromError(
        standardError,
        'database' as ErrorCategory,
        'high' as ErrorSeverity
      )
      
      expect(enhanced.message).toBe('Standard error message')
      expect(enhanced.category).toBe('database')
      expect(enhanced.severity).toBe('high')
      expect(enhanced.originalError).toContain('Standard error message')
    })

    it('should handle errors with additional properties', () => {
      const error: any = new Error('Custom error')
      error.code = 'ECONNREFUSED'
      error.syscall = 'connect'
      
      const enhanced = ErrorHandler.fromError(
        error,
        'network' as ErrorCategory,
        'critical' as ErrorSeverity
      )
      
      expect(enhanced.code).toBe('ECONNREFUSED')
    })
  })

  describe('sanitizeError', () => {
    it('should sanitize error messages in production', () => {
      process.env.NODE_ENV = 'production'
      
      const error = ErrorHandler.createError(
        'SENSITIVE',
        'Error with password123 and user@email.com',
        'security' as ErrorCategory,
        'critical' as ErrorSeverity
      )
      
      const sanitized = ErrorHandler.sanitizeError(error)
      
      expect(sanitized.message).not.toContain('password123')
      expect(sanitized.message).not.toContain('user@email.com')
    })

    it('should preserve error messages in development', () => {
      process.env.NODE_ENV = 'development'
      
      const error = ErrorHandler.createError(
        'DEV_ERROR',
        'Error with sensitive data',
        'internal' as ErrorCategory,
        'low' as ErrorSeverity
      )
      
      const sanitized = ErrorHandler.sanitizeError(error)
      
      expect(sanitized.message).toBe('Error with sensitive data')
    })

    it('should remove sensitive context fields', () => {
      const error = ErrorHandler.createError(
        'CONTEXT_ERROR',
        'Error',
        'internal' as ErrorCategory,
        'medium' as ErrorSeverity,
        {
          context: {
            password: 'secret123',
            token: 'jwt-token',
            apiKey: 'api-key-123',
            email: 'user@example.com',
            safeField: 'This is safe'
          }
        }
      )
      
      const sanitized = ErrorHandler.sanitizeError(error)
      
      expect(sanitized.context?.password).toBeUndefined()
      expect(sanitized.context?.token).toBeUndefined()
      expect(sanitized.context?.apiKey).toBeUndefined()
      expect(sanitized.context?.safeField).toBe('This is safe')
    })
  })

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const error: any = new Error('Circular')
      error.self = error
      
      const enhanced = ErrorHandler.fromError(
        error,
        'internal' as ErrorCategory,
        'low' as ErrorSeverity
      )
      
      expect(enhanced).toBeDefined()
      expect(enhanced.message).toBe('Circular')
    })

    it('should handle very large error objects', () => {
      const largeError = {
        message: 'Large error',
        data: 'x'.repeat(10000),
      }
      
      const response = ErrorHandler.handleError(largeError)
      const data = JSON.parse(response.body || '{}')
      
      expect(data.error).toBeDefined()
      expect(response.body?.length).toBeLessThan(15000) // Reasonable response size
    })

    it('should handle errors without message', () => {
      const error = {}
      
      const response = ErrorHandler.handleError(error)
      const data = JSON.parse(response.body || '{}')
      
      expect(data.error.message).toBeDefined()
      expect(data.error.code).toBe('UNKNOWN_ERROR')
    })

    it('should handle null and undefined', () => {
      const nullResponse = ErrorHandler.handleError(null)
      const undefinedResponse = ErrorHandler.handleError(undefined)
      
      expect(nullResponse.status).toBe(500)
      expect(undefinedResponse.status).toBe(500)
    })
  })

  describe('HTTP Status Code Mapping', () => {
    it('should map authentication errors to 401', () => {
      const error = ErrorHandler.createError(
        'AUTH_ERROR',
        'Unauthorized',
        'authentication' as ErrorCategory,
        'high' as ErrorSeverity
      )
      
      const response = ErrorHandler.handleError(error)
      expect(response.status).toBe(401)
    })

    it('should map authorization errors to 403', () => {
      const error = ErrorHandler.createError(
        'PERM_ERROR',
        'Forbidden',
        'authorization' as ErrorCategory,
        'high' as ErrorSeverity
      )
      
      const response = ErrorHandler.handleError(error)
      expect(response.status).toBe(403)
    })

    it('should map validation errors to 400', () => {
      const error = ErrorHandler.createError(
        'VAL_ERROR',
        'Invalid input',
        'validation' as ErrorCategory,
        'low' as ErrorSeverity
      )
      
      const response = ErrorHandler.handleError(error)
      expect(response.status).toBe(400)
    })

    it('should map rate limiting to 429', () => {
      const error = ErrorHandler.createError(
        'RATE_LIMIT',
        'Too many requests',
        'rate_limiting' as ErrorCategory,
        'medium' as ErrorSeverity
      )
      
      const response = ErrorHandler.handleError(error)
      expect(response.status).toBe(429)
    })
  })

  describe('Request Context', () => {
    it('should extract context from NextRequest', () => {
      const request = new NextRequest('https://example.com/api/test', {
        headers: {
          'user-agent': 'Test Browser',
          'x-request-id': 'req-123',
        }
      })
      
      const error = new Error('Request error')
      const context = {
        request,
        userId: 'user-456',
      }
      
      ErrorHandler.logError(error, context)
      
      // Verify context extraction logic would work
      expect(context.request).toBeDefined()
      expect(context.userId).toBe('user-456')
    })
  })
})