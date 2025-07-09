/**
 * Tests for Security Error Boundaries
 *
 * Covers all classes and functions in error-boundaries.ts including:
 * - SecurityError class
 * - withSecurityBoundary function
 * - createSecureErrorResponse function
 * - withApiSecurityBoundary function
 * - withRetryBoundary function
 * - CircuitBreaker class
 */

import {
  CircuitBreaker,
  SecurityError,
  SecurityErrorType,
  createSecureErrorResponse,
  withApiSecurityBoundary,
  withRetryBoundary,
  withSecurityBoundary,
} from '@/lib/security/error-boundaries'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ZodError, z } from 'zod'

// Mock the audit logger to avoid actual logging during tests
vi.mock('@/lib/security/audit-logger', () => ({
  AuditEventType: {
    SYSTEM_ERROR: 'system_error',
    API_ACCESS: 'api_access',
  },
  AuditSeverity: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
  },
  auditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('Security Error Boundaries', () => {
  describe('SecurityError', () => {
    it('should create SecurityError with all properties', () => {
      const error = new SecurityError(
        SecurityErrorType.AUTHENTICATION,
        'Test error message',
        401,
        { detail: 'test' },
        'User friendly message'
      )

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(SecurityError)
      expect(error.name).toBe('SecurityError')
      expect(error.type).toBe(SecurityErrorType.AUTHENTICATION)
      expect(error.message).toBe('Test error message')
      expect(error.statusCode).toBe(401)
      expect(error.details).toEqual({ detail: 'test' })
      expect(error.userMessage).toBe('User friendly message')
    })

    it('should create SecurityError with default values', () => {
      const error = new SecurityError(SecurityErrorType.VALIDATION, 'Validation failed')

      expect(error.statusCode).toBe(500)
      expect(error.details).toBeUndefined()
      expect(error.userMessage).toBeUndefined()
    })

    it('should support all error types', () => {
      const errorTypes = [
        SecurityErrorType.AUTHENTICATION,
        SecurityErrorType.AUTHORIZATION,
        SecurityErrorType.VALIDATION,
        SecurityErrorType.RATE_LIMIT,
        SecurityErrorType.SIGNATURE,
        SecurityErrorType.ENCRYPTION,
        SecurityErrorType.CONFIGURATION,
        SecurityErrorType.INTERNAL,
        SecurityErrorType.OPERATION_FAILED,
      ]

      errorTypes.forEach(type => {
        const error = new SecurityError(type, 'Test message')
        expect(error.type).toBe(type)
      })
    })
  })

  describe('withSecurityBoundary', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success')
      const context = {
        operationType: 'test-operation',
        userId: 'user123',
        ip: '192.168.1.1',
        metadata: { test: 'data' },
      }

      const result = await withSecurityBoundary(mockOperation, context)

      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledOnce()
    })

    it('should log and re-throw SecurityError', async () => {
      const testError = new SecurityError(SecurityErrorType.AUTHENTICATION, 'Auth failed', 401)
      const mockOperation = vi.fn().mockRejectedValue(testError)
      const context = {
        operationType: 'test-operation',
        userId: 'user123',
        ip: '192.168.1.1',
      }

      await expect(withSecurityBoundary(mockOperation, context)).rejects.toThrow(testError)

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system_error',
          severity: 'error',
          actor: {
            id: 'user123',
            type: 'user',
            ip: '192.168.1.1',
          },
          action: 'Error in test-operation',
          result: 'error',
          reason: 'Auth failed',
        })
      )
    })

    it('should log rate limit errors with warning severity', async () => {
      const testError = new SecurityError(SecurityErrorType.RATE_LIMIT, 'Rate limit exceeded', 429)
      const mockOperation = vi.fn().mockRejectedValue(testError)
      const context = {
        operationType: 'rate-limit-test',
        ip: '192.168.1.1',
      }

      await expect(withSecurityBoundary(mockOperation, context)).rejects.toThrow(testError)

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warning',
        })
      )
    })

    it('should call custom error handler', async () => {
      const testError = new Error('Custom error')
      const mockOperation = vi.fn().mockRejectedValue(testError)
      const mockErrorHandler = vi.fn()
      const context = {
        operationType: 'test-operation',
        ip: '192.168.1.1',
      }

      await expect(
        withSecurityBoundary(mockOperation, context, {
          onError: mockErrorHandler,
        })
      ).rejects.toThrow(testError)

      expect(mockErrorHandler).toHaveBeenCalledWith(testError, context)
    })

    it('should handle error handler failures gracefully', async () => {
      const testError = new Error('Original error')
      const mockOperation = vi.fn().mockRejectedValue(testError)
      const mockErrorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      const context = {
        operationType: 'test-operation',
        ip: '192.168.1.1',
      }

      // Should still throw the original error, not the handler error
      await expect(
        withSecurityBoundary(mockOperation, context, {
          onError: mockErrorHandler,
        })
      ).rejects.toThrow(testError)
    })

    it('should respect configuration options', async () => {
      const testError = new Error('Test error')
      const mockOperation = vi.fn().mockRejectedValue(testError)
      const context = {
        operationType: 'test-operation',
        ip: '192.168.1.1',
      }

      await expect(
        withSecurityBoundary(mockOperation, context, {
          logErrors: false,
          includeStackTrace: false,
          includeDetails: false,
        })
      ).rejects.toThrow(testError)

      // Should still be called since we're not testing the actual logging
      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).not.toHaveBeenCalled()
    })

    it('should include stack trace in development', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const testError = new Error('Test error')
      testError.stack = 'Error stack trace'
      const mockOperation = vi.fn().mockRejectedValue(testError)
      const context = {
        operationType: 'test-operation',
        ip: '192.168.1.1',
      }

      await expect(withSecurityBoundary(mockOperation, context)).rejects.toThrow(testError)

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            stack: 'Error stack trace',
          }),
        })
      )

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('createSecureErrorResponse', () => {
    beforeEach(() => {
      // Mock crypto.randomUUID
      vi.stubGlobal('crypto', {
        randomUUID: vi.fn().mockReturnValue('test-request-id'),
      })
    })

    it('should create response for SecurityError', () => {
      const error = new SecurityError(
        SecurityErrorType.AUTHENTICATION,
        'Auth failed',
        401,
        undefined,
        'Please log in'
      )

      const response = createSecureErrorResponse(error, 'req-123')

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(401)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('X-Request-ID')).toBe('req-123')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('should create response for ZodError', () => {
      const schema = z.object({ name: z.string() })
      let zodError: ZodError
      try {
        schema.parse({ name: 123 })
      } catch (error) {
        zodError = error as ZodError
      }

      if (!zodError) {
        throw new Error('Expected zodError to be set')
      }
      const response = createSecureErrorResponse(zodError)

      expect(response.status).toBe(400)
    })

    it('should handle rate limit errors', () => {
      const error = new Error('rate limit exceeded')
      const response = createSecureErrorResponse(error)

      expect(response.status).toBe(429)
    })

    it('should handle authentication errors', () => {
      const error = new Error('unauthorized access')
      const response = createSecureErrorResponse(error)

      expect(response.status).toBe(401)
    })

    it('should handle authorization errors', () => {
      const error = new Error('forbidden operation')
      const response = createSecureErrorResponse(error)

      expect(response.status).toBe(403)
    })

    it('should mask error details in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new SecurityError(
        SecurityErrorType.INTERNAL,
        'Sensitive internal error',
        500,
        undefined,
        'Something went wrong'
      )

      const response = createSecureErrorResponse(error)

      expect(response.status).toBe(500)

      process.env.NODE_ENV = originalEnv
    })

    it('should include error details in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const error = new SecurityError(SecurityErrorType.INTERNAL, 'Detailed internal error', 500)

      const response = createSecureErrorResponse(error)

      expect(response.status).toBe(500)

      process.env.NODE_ENV = originalEnv
    })

    it('should handle unknown errors', () => {
      const error = 'string error'
      const response = createSecureErrorResponse(error)

      expect(response.status).toBe(500)
    })
  })

  describe('withApiSecurityBoundary', () => {
    const createMockRequest = (url = 'https://example.com/api/test', method = 'GET') =>
      new NextRequest(url, { method })

    it('should wrap handler successfully', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new NextResponse('success', { status: 200 }))
      const wrappedHandler = withApiSecurityBoundary(mockHandler)
      const request = createMockRequest()

      const response = await wrappedHandler(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('X-Request-ID')).toBeTruthy()
      expect(response.headers.get('X-Response-Time')).toBeTruthy()
    })

    it('should handle handler errors', async () => {
      const testError = new SecurityError(SecurityErrorType.VALIDATION, 'Validation failed', 400)
      const mockHandler = vi.fn().mockRejectedValue(testError)
      const wrappedHandler = withApiSecurityBoundary(mockHandler)
      const request = createMockRequest()

      const response = await wrappedHandler(request)

      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('should extract request context for logging', async () => {
      const testError = new Error('Test error')
      const mockHandler = vi.fn().mockRejectedValue(testError)
      const wrappedHandler = withApiSecurityBoundary(mockHandler)
      const request = createMockRequest('https://example.com/api/users', 'POST')
      request.headers.set('user-agent', 'test-agent')
      request.headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1')

      await wrappedHandler(request)

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            method: 'POST',
            path: '/api/users',
            userAgent: 'test-agent',
          }),
        })
      )
    })

    it('should preserve existing request ID', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        new NextResponse('success', {
          status: 200,
          headers: { 'X-Request-ID': 'existing-id' },
        })
      )
      const wrappedHandler = withApiSecurityBoundary(mockHandler)
      const request = createMockRequest()

      const response = await wrappedHandler(request)

      expect(response.headers.get('X-Request-ID')).toBe('existing-id')
    })

    it('should add response time header', async () => {
      const mockHandler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return new NextResponse('success')
      })
      const wrappedHandler = withApiSecurityBoundary(mockHandler)
      const request = createMockRequest()

      const response = await wrappedHandler(request)

      const responseTime = response.headers.get('X-Response-Time')
      expect(responseTime).toBeTruthy()
      expect(responseTime).toMatch(/^\d+ms$/)
    })
  })

  describe('withRetryBoundary', () => {
    it('should execute operation successfully on first try', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success')

      const result = await withRetryBoundary(mockOperation)

      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(1)
    })

    it('should retry on network errors', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success')

      const result = await withRetryBoundary(mockOperation, {
        retryDelay: 1, // Speed up test
      })

      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(3)
    })

    it('should respect maxRetries limit', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(
        withRetryBoundary(mockOperation, {
          maxRetries: 2,
          retryDelay: 1,
        })
      ).rejects.toThrow('ECONNREFUSED')

      expect(mockOperation).toHaveBeenCalledTimes(2)
    })

    it('should not retry on non-retryable errors', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Invalid input'))

      await expect(withRetryBoundary(mockOperation)).rejects.toThrow('Invalid input')

      expect(mockOperation).toHaveBeenCalledTimes(1)
    })

    it('should use custom shouldRetry function', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Custom retryable'))
      const mockShouldRetry = vi.fn().mockReturnValue(true)

      await expect(
        withRetryBoundary(mockOperation, {
          maxRetries: 2,
          retryDelay: 1,
          shouldRetry: mockShouldRetry,
        })
      ).rejects.toThrow('Custom retryable')

      expect(mockShouldRetry).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Custom retryable' }),
        1
      )
      expect(mockOperation).toHaveBeenCalledTimes(2)
    })

    it('should call onRetry callback', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success')
      const mockOnRetry = vi.fn()

      await withRetryBoundary(mockOperation, {
        retryDelay: 1,
        onRetry: mockOnRetry,
      })

      expect(mockOnRetry).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'ECONNREFUSED' }),
        1
      )
    })

    it('should implement exponential backoff', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success')

      const startTime = Date.now()
      await withRetryBoundary(mockOperation, {
        retryDelay: 10,
        backoffMultiplier: 2,
      })
      const duration = Date.now() - startTime

      // Should have waited at least 10ms + 20ms = 30ms
      expect(duration).toBeGreaterThan(25)
    })
  })

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker
    const mockOnOpen = vi.fn()
    const mockOnClose = vi.fn()

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 100,
        onOpen: mockOnOpen,
        onClose: mockOnClose,
      })
      vi.clearAllMocks()
    })

    it('should execute operation when circuit is closed', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success')

      const result = await circuitBreaker.execute(mockOperation)

      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledOnce()
    })

    it('should open circuit after failure threshold', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failed'))

      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failed')
      }

      expect(mockOnOpen).toHaveBeenCalledOnce()

      // Next execution should be blocked
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker is open')
    })

    it('should transition to half-open after reset timeout', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failed')
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should now allow one attempt (half-open state)
      mockOperation.mockResolvedValueOnce('success')
      const result = await circuitBreaker.execute(mockOperation)

      expect(result).toBe('success')
      expect(mockOnClose).toHaveBeenCalledOnce()
    })

    it('should reset on successful operation in half-open state', async () => {
      const mockOperation = vi.fn()

      // Open the circuit
      mockOperation.mockRejectedValue(new Error('Failed'))
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failed')
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // Successful operation should close the circuit
      mockOperation.mockResolvedValue('success')
      await circuitBreaker.execute(mockOperation)

      const state = circuitBreaker.getState()
      expect(state.state).toBe('closed')
      expect(state.failures).toBe(0)
    })

    it('should return current state', () => {
      const state = circuitBreaker.getState()

      expect(state.state).toBe('closed')
      expect(state.failures).toBe(0)
      expect(state.lastFailureTime).toBe(0)
    })

    it('should track failure count and last failure time', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failed'))

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failed')

      const state = circuitBreaker.getState()
      expect(state.failures).toBe(1)
      expect(state.lastFailureTime).toBeGreaterThan(0)
    })

    it('should throw SecurityError when circuit is open', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Failed')
      }

      // Should throw SecurityError
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow(SecurityError)
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker is open')
    })
  })

  describe('edge cases and integration', () => {
    it('should handle concurrent operations with circuit breaker', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 50,
      })

      const mockOperation = vi.fn().mockRejectedValue(new Error('Failed'))

      // Execute multiple operations concurrently
      const promises = Array.from({ length: 5 }, () =>
        circuitBreaker.execute(mockOperation).catch(err => err.message)
      )

      const results = await Promise.all(promises)

      // Some should fail with original error, others with circuit breaker error
      expect(results).toContain('Failed')
      expect(results).toContain('Circuit breaker is open')
    })

    it('should handle complex retry scenarios', async () => {
      let attempts = 0
      const mockOperation = vi.fn().mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          throw new Error('ECONNREFUSED')
        }
        return 'success'
      })

      const result = await withRetryBoundary(mockOperation, {
        maxRetries: 5,
        retryDelay: 1,
      })

      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })

    it('should handle nested security boundaries', async () => {
      const innerOperation = vi
        .fn()
        .mockRejectedValue(new SecurityError(SecurityErrorType.VALIDATION, 'Inner error'))
      const outerOperation = vi.fn().mockImplementation(() =>
        withSecurityBoundary(innerOperation, {
          operationType: 'inner-operation',
          ip: '192.168.1.1',
        })
      )

      await expect(
        withSecurityBoundary(outerOperation, {
          operationType: 'outer-operation',
          ip: '192.168.1.1',
        })
      ).rejects.toThrow('Inner error')

      // Both operations should log the error
      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledTimes(2)
    })
  })
})
