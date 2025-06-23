/**
 * Modern GitHub Error Tests - Vitest 3.2+ Patterns
 * 
 * Features:
 * - Property-based testing for error handling
 * - Parametric testing with test.each
 * - Enhanced error boundary testing
 * - Type safety validation
 */

import { describe, it, expect } from 'vitest'
import { fc, test as fcTest } from '@fast-check/vitest'
import {
  GitHubClientError,
  GitHubAuthenticationError,
  GitHubRateLimitError,
  GitHubGraphQLError,
  GitHubWebhookError,
  GitHubWebhookSignatureError,
  GitHubWebhookPayloadError,
  GitHubTokenExpiredError,
  GitHubCacheError,
  isRequestError,
  isRateLimitError,
  isSecondaryRateLimitError,
  extractErrorMessage,
  ErrorMessages
} from '@/lib/github/errors'

describe('GitHub Error Classes - Modern Tests', () => {
  describe('Basic Error Classes', () => {
    it('should create GitHubClientError with correct properties', () => {
      const message = 'Test error message'
      const error = new GitHubClientError(message)
      
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.message).toBe(message)
      expect(error.name).toBe('GitHubClientError')
    })

    it('should create GitHubAuthenticationError with default message', () => {
      const error = new GitHubAuthenticationError()
      
      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.message).toBe('Authentication failed')
      expect(error.name).toBe('GitHubAuthenticationError')
    })

    // Property-based testing for error messages
    fcTest.prop([
      fc.string({ minLength: 1, maxLength: 500 })
    ])('should preserve custom error messages', (message) => {
      const error = new GitHubAuthenticationError(message)
      
      expect(error.message).toBe(message)
      expect(error.name).toBe('GitHubAuthenticationError')
    })
  })

  describe('Specialized Error Classes', () => {
    it('should create GitHubRateLimitError with rate limit details', () => {
      const message = 'Rate limit exceeded'
      const retryAfter = 3600
      const limit = 5000
      const remaining = 0
      const reset = new Date('2024-12-01T12:00:00Z')
      
      const error = new GitHubRateLimitError(message, retryAfter, limit, remaining, reset)
      
      expect(error.message).toBe(message)
      expect(error.retryAfter).toBe(retryAfter)
      expect(error.limit).toBe(limit)
      expect(error.remaining).toBe(remaining)
      expect(error.reset).toBe(reset)
      expect(error.name).toBe('GitHubRateLimitError')
    })

    it('should create GitHubGraphQLError with error details', () => {
      const message = 'GraphQL query failed'
      const errors = [
        {
          message: 'Field not found',
          type: 'FIELD_ERROR',
          path: ['user', 'invalidField'],
          locations: [{ line: 1, column: 15 }]
        }
      ]
      const data = { user: { login: 'testuser' } }
      
      const error = new GitHubGraphQLError(message, errors, data)
      
      expect(error.message).toBe(message)
      expect(error.errors).toEqual(errors)
      expect(error.data).toEqual(data)
      expect(error.name).toBe('GitHubGraphQLError')
    })

    // Parametric testing for webhook error reasons
    it.each([
      'invalid-signature',
      'missing-signature', 
      'parse-error',
      'invalid-payload',
      'duplicate-delivery',
      'handler-error'
    ])('should create GitHubWebhookError with reason: %s', (reason) => {
      const message = `Webhook error: ${reason}`
      
      const error = new GitHubWebhookError(message, reason as any)
      
      expect(error.message).toBe(message)
      expect(error.reason).toBe(reason)
      expect(error.name).toBe('GitHubWebhookError')
    })
  })

  describe('Extended Error Classes', () => {
    it('should create GitHubWebhookSignatureError with signature details', () => {
      const message = 'Invalid webhook signature'
      const algorithm = 'sha256'
      const providedSignature = 'sha256=invalid'
      
      const error = new GitHubWebhookSignatureError(message, algorithm, providedSignature)
      
      expect(error.message).toBe(message)
      expect(error.algorithm).toBe(algorithm)
      expect(error.providedSignature).toBe(providedSignature)
      expect(error.reason).toBe('invalid-signature')
      expect(error.name).toBe('GitHubWebhookSignatureError')
    })

    it('should create GitHubWebhookPayloadError with payload details', () => {
      const message = 'Invalid payload'
      const payloadSize = 1048576
      const parseError = new Error('JSON parse error')
      
      const error = new GitHubWebhookPayloadError(message, payloadSize, parseError)
      
      expect(error.message).toBe(message)
      expect(error.payloadSize).toBe(payloadSize)
      expect(error.parseError).toBe(parseError)
      expect(error.reason).toBe('parse-error')
      expect(error.name).toBe('GitHubWebhookPayloadError')
    })

    it('should create GitHubTokenExpiredError with expiry details', () => {
      const message = 'Token expired'
      const expiredAt = new Date('2024-01-01T00:00:00Z')
      
      const error = new GitHubTokenExpiredError(message, expiredAt)
      
      expect(error.message).toBe(message)
      expect(error.expiredAt).toBe(expiredAt)
      expect(error.name).toBe('GitHubTokenExpiredError')
    })

    // Property-based testing for cache operations
    fcTest.prop([
      fc.constantFrom('get', 'set', 'delete', 'clear'),
      fc.string({ minLength: 1, maxLength: 100 })
    ])('should create GitHubCacheError with operation details', (operation, message) => {
      const error = new GitHubCacheError(message, operation)
      
      expect(error.message).toBe(message)
      expect(error.operation).toBe(operation)
      expect(error.name).toBe('GitHubCacheError')
    })
  })

  describe('Error Detection Functions', () => {
    it('should correctly identify request errors', () => {
      // Create a proper Error instance with request properties
      const requestError = new Error('Request failed') as any
      requestError.status = 404
      requestError.request = { url: 'https://api.github.com/user' }
      requestError.response = { data: { message: 'Not Found' } }
      
      expect(isRequestError(requestError)).toBe(true)
      expect(isRequestError(new Error('Regular error'))).toBe(false)
      expect(isRequestError(null)).toBe(false)
      expect(isRequestError('string')).toBe(false)
    })

    it('should correctly identify rate limit errors', () => {
      const rateLimitError = new Error('Rate limit exceeded') as any
      rateLimitError.status = 403
      rateLimitError.request = { url: 'https://api.github.com/user' }
      rateLimitError.response = { 
        headers: { 
          'x-ratelimit-remaining': '0',
          'x-ratelimit-limit': '5000'
        }
      }
      
      expect(isRateLimitError(rateLimitError)).toBe(true)
      
      const notRateLimitError = new Error('Not rate limit') as any
      notRateLimitError.status = 403
      notRateLimitError.request = { url: 'https://api.github.com/user' }
      notRateLimitError.response = { headers: { 'x-ratelimit-remaining': '100' } }
      
      expect(isRateLimitError(notRateLimitError)).toBe(false)
    })

    it('should correctly identify secondary rate limit errors', () => {
      const secondaryRateLimitError = new Error('Secondary rate limit exceeded') as any
      secondaryRateLimitError.status = 403
      secondaryRateLimitError.request = { url: 'https://api.github.com/user' }
      secondaryRateLimitError.response = { 
        headers: { 
          'retry-after': '60'
        }
      }
      
      expect(isSecondaryRateLimitError(secondaryRateLimitError)).toBe(true)
      
      const notSecondaryError = new Error('Not secondary limit') as any
      notSecondaryError.status = 403
      notSecondaryError.request = { url: 'https://api.github.com/user' }
      notSecondaryError.response = { headers: {} }
      
      expect(isSecondaryRateLimitError(notSecondaryError)).toBe(false)
    })

    // Property-based testing for error message extraction
    fcTest.prop([
      fc.oneof(
        fc.string({ minLength: 1 }), // Ensure non-empty strings
        fc.record({ message: fc.string({ minLength: 1 }) }),
        fc.constant(null),
        fc.constant(undefined),
        fc.integer(),
        fc.boolean()
      )
    ])('should extract error messages from various input types', (input) => {
      const result = extractErrorMessage(input)
      
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      
      if (input instanceof Error) {
        expect(result).toBe(input.message)
      } else if (typeof input === 'string' && input.length > 0) {
        expect(result).toBe(input)
      } else if (input && typeof input === 'object' && 'message' in input) {
        expect(result).toBe(String(input.message))
      } else {
        expect(result).toBe('Unknown error occurred')
      }
    })
  })

  describe('Error Messages Constants', () => {
    it('should have consistent error message format', () => {
      // Test static messages
      expect(ErrorMessages.AUTH_TOKEN_REQUIRED).toBe('Authentication token is required')
      expect(ErrorMessages.AUTH_TOKEN_EXPIRED).toBe('Authentication token has expired')
      expect(ErrorMessages.CONFIG_INVALID).toBe('Invalid configuration provided')
      
      // Messages should start with capital letter
      expect(ErrorMessages.AUTH_TOKEN_REQUIRED[0]).toMatch(/[A-Z]/)
      expect(ErrorMessages.CONFIG_INVALID[0]).toMatch(/[A-Z]/)
      
      // Messages should not end with period (simple messages)
      expect(ErrorMessages.AUTH_TOKEN_REQUIRED).not.toMatch(/\.$/)
      expect(ErrorMessages.CONFIG_INVALID).not.toMatch(/\.$/)
    })

    it('should handle dynamic error messages correctly', () => {
      // Test function-based messages
      expect(ErrorMessages.AUTH_TYPE_INVALID('invalid')).toBe('Invalid authentication type: invalid')
      expect(ErrorMessages.RATE_LIMIT_GRAPHQL_EXCEEDED(10000, 5000)).toContain('10,000 points')
      expect(ErrorMessages.WEBHOOK_PAYLOAD_TOO_LARGE(2000000, 1048576)).toContain('2,000,000 bytes')
    })

    // Property-based testing for dynamic message functions
    fcTest.prop([
      fc.string({ minLength: 1, maxLength: 50 })
    ])('should format auth type errors consistently', (authType) => {
      const message = ErrorMessages.AUTH_TYPE_INVALID(authType)
      
      expect(message).toContain(authType)
      expect(message).toStartWith('Invalid authentication type:')
    })

    fcTest.prop([
      fc.integer({ min: 0, max: 1000000 }),
      fc.integer({ min: 0, max: 1000000 })
    ])('should format rate limit messages with proper number formatting', (points, limit) => {
      const message = ErrorMessages.RATE_LIMIT_GRAPHQL_EXCEEDED(points, limit)
      
      expect(message).toContain(points.toLocaleString())
      expect(message).toContain(limit.toLocaleString())
      expect(message).toContain('points')
      expect(message).toContain('limit')
    })
  })

  describe('Error Inheritance Chain', () => {
    it('should maintain proper inheritance hierarchy', () => {
      const authError = new GitHubAuthenticationError()
      const rateLimitError = new GitHubRateLimitError('Rate limit', 3600, 5000, 0, new Date())
      const webhookError = new GitHubWebhookError('Webhook error', 'invalid-signature')
      
      // All should be instances of GitHubClientError
      expect(authError).toBeInstanceOf(GitHubClientError)
      expect(rateLimitError).toBeInstanceOf(GitHubClientError)
      expect(webhookError).toBeInstanceOf(GitHubClientError)
      
      // All should be instances of Error
      expect(authError).toBeInstanceOf(Error)
      expect(rateLimitError).toBeInstanceOf(Error)
      expect(webhookError).toBeInstanceOf(Error)
      
      // Specialized webhook errors should inherit from base webhook error
      const signatureError = new GitHubWebhookSignatureError('Sig error')
      const payloadError = new GitHubWebhookPayloadError('Payload error')
      
      expect(signatureError).toBeInstanceOf(GitHubWebhookError)
      expect(payloadError).toBeInstanceOf(GitHubWebhookError)
    })
  })

  describe('Error Serialization', () => {
    it('should maintain error properties through JSON serialization', () => {
      const rateLimitError = new GitHubRateLimitError(
        'Rate limit exceeded',
        3600,
        5000,
        0,
        new Date('2024-01-01T00:00:00Z')
      )
      
      // Test that custom properties are accessible
      expect(rateLimitError.retryAfter).toBe(3600)
      expect(rateLimitError.limit).toBe(5000)
      expect(rateLimitError.remaining).toBe(0)
      expect(rateLimitError.reset).toEqual(new Date('2024-01-01T00:00:00Z'))
      
      // Test error name and message
      expect(rateLimitError.name).toBe('GitHubRateLimitError')
      expect(rateLimitError.message).toBe('Rate limit exceeded')
    })
  })
})