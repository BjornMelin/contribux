import type { RequestError } from '@octokit/types'
import { describe, expect, it } from 'vitest'
import {
  ErrorMessages,
  extractErrorMessage,
  GitHubAuthenticationError,
  GitHubCacheError,
  GitHubClientError,
  GitHubGraphQLError,
  type GitHubGraphQLErrorData,
  GitHubRateLimitError,
  GitHubTokenExpiredError,
  GitHubWebhookError,
  GitHubWebhookPayloadError,
  GitHubWebhookSignatureError,
  isRateLimitError,
  isRequestError,
  isSecondaryRateLimitError,
} from '@/lib/github/errors'

describe('GitHub Error Classes', () => {
  describe('GitHubClientError', () => {
    it('should create basic client error', () => {
      const error = new GitHubClientError('Test error message')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.name).toBe('GitHubClientError')
      expect(error.message).toBe('Test error message')
    })

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new GitHubClientError('Test error')
      }).toThrow(GitHubClientError)

      expect(() => {
        throw new GitHubClientError('Test error')
      }).toThrow('Test error')
    })
  })

  describe('GitHubAuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new GitHubAuthenticationError()

      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.name).toBe('GitHubAuthenticationError')
      expect(error.message).toBe('Authentication failed')
    })

    it('should create authentication error with custom message', () => {
      const customMessage = 'Invalid token provided'
      const error = new GitHubAuthenticationError(customMessage)

      expect(error.message).toBe(customMessage)
    })

    it('should inherit from GitHubClientError', () => {
      const error = new GitHubAuthenticationError()
      expect(error).toBeInstanceOf(GitHubClientError)
    })
  })

  describe('GitHubRateLimitError', () => {
    it('should create rate limit error with all properties', () => {
      const message = 'Rate limit exceeded'
      const retryAfter = 3600
      const limit = 5000
      const remaining = 0
      const reset = new Date()

      const error = new GitHubRateLimitError(message, retryAfter, limit, remaining, reset)

      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.name).toBe('GitHubRateLimitError')
      expect(error.message).toBe(message)
      expect(error.retryAfter).toBe(retryAfter)
      expect(error.limit).toBe(limit)
      expect(error.remaining).toBe(remaining)
      expect(error.reset).toBe(reset)
    })

    it('should have readonly properties', () => {
      const error = new GitHubRateLimitError('Test', 60, 5000, 0, new Date())

      // Properties should be accessible
      expect(error.retryAfter).toBe(60)
      expect(error.limit).toBe(5000)
      expect(error.remaining).toBe(0)
      expect(error.reset).toBeInstanceOf(Date)
    })
  })

  describe('GitHubGraphQLError', () => {
    it('should create GraphQL error with errors array', () => {
      const message = 'GraphQL query failed'
      const errors: GitHubGraphQLErrorData[] = [
        {
          message: 'Field "invalidField" doesn\'t exist',
          type: 'INVALID_FIELD',
          path: ['user', 'invalidField'],
          locations: [{ line: 1, column: 15 }],
        },
        {
          message: 'Argument "first" must be positive',
          type: 'ARGUMENT_ERROR',
          path: ['repository', 'issues'],
          locations: [{ line: 2, column: 20 }],
        },
      ]
      const data = { user: { login: 'testuser' } }

      const error = new GitHubGraphQLError(message, errors, data)

      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.name).toBe('GitHubGraphQLError')
      expect(error.message).toBe(message)
      expect(error.errors).toEqual(errors)
      expect(error.data).toBe(data)
    })

    it('should create GraphQL error without data', () => {
      const errors: GitHubGraphQLErrorData[] = [
        { message: 'Syntax error', locations: [{ line: 1, column: 1 }] },
      ]

      const error = new GitHubGraphQLError('Syntax error', errors)

      expect(error.errors).toEqual(errors)
      expect(error.data).toBeUndefined()
    })

    it('should handle minimal error data', () => {
      const errors: GitHubGraphQLErrorData[] = [
        { message: 'Simple error' }, // Only message, no optional fields
      ]

      const error = new GitHubGraphQLError('Error', errors)
      expect(error.errors[0].message).toBe('Simple error')
      expect(error.errors[0].type).toBeUndefined()
      expect(error.errors[0].path).toBeUndefined()
      expect(error.errors[0].locations).toBeUndefined()
    })
  })

  describe('GitHubWebhookError', () => {
    it('should create webhook error with reason', () => {
      const message = 'Invalid signature'
      const reason = 'invalid-signature'

      const error = new GitHubWebhookError(message, reason)

      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.name).toBe('GitHubWebhookError')
      expect(error.message).toBe(message)
      expect(error.reason).toBe(reason)
    })

    it('should accept all valid reason types', () => {
      const reasons = [
        'invalid-signature',
        'missing-signature',
        'parse-error',
        'invalid-payload',
        'duplicate-delivery',
        'handler-error',
      ] as const

      reasons.forEach(reason => {
        const error = new GitHubWebhookError(`Error: ${reason}`, reason)
        expect(error.reason).toBe(reason)
      })
    })
  })

  describe('GitHubWebhookSignatureError', () => {
    it('should create signature error with algorithm and signature', () => {
      const message = 'SHA-256 signature mismatch'
      const algorithm = 'sha256'
      const providedSignature = 'sha256=abc123'

      const error = new GitHubWebhookSignatureError(message, algorithm, providedSignature)

      expect(error).toBeInstanceOf(GitHubWebhookError)
      expect(error.name).toBe('GitHubWebhookSignatureError')
      expect(error.reason).toBe('invalid-signature')
      expect(error.algorithm).toBe(algorithm)
      expect(error.providedSignature).toBe(providedSignature)
    })

    it('should create signature error with minimal data', () => {
      const error = new GitHubWebhookSignatureError('Invalid signature')

      expect(error.algorithm).toBeUndefined()
      expect(error.providedSignature).toBeUndefined()
    })
  })

  describe('GitHubWebhookPayloadError', () => {
    it('should create payload error with size and parse error', () => {
      const message = 'Payload too large'
      const payloadSize = 1048576 // 1MB
      const parseError = new Error('JSON parse error')

      const error = new GitHubWebhookPayloadError(message, payloadSize, parseError)

      expect(error).toBeInstanceOf(GitHubWebhookError)
      expect(error.name).toBe('GitHubWebhookPayloadError')
      expect(error.reason).toBe('parse-error')
      expect(error.payloadSize).toBe(payloadSize)
      expect(error.parseError).toBe(parseError)
    })

    it('should create payload error with minimal data', () => {
      const error = new GitHubWebhookPayloadError('Parse failed')

      expect(error.payloadSize).toBeUndefined()
      expect(error.parseError).toBeUndefined()
    })
  })

  describe('GitHubTokenExpiredError', () => {
    it('should create token expired error with default message', () => {
      const error = new GitHubTokenExpiredError()

      expect(error).toBeInstanceOf(GitHubAuthenticationError)
      expect(error.name).toBe('GitHubTokenExpiredError')
      expect(error.message).toBe('Token has expired')
      expect(error.expiredAt).toBeUndefined()
    })

    it('should create token expired error with custom message and expiry date', () => {
      const message = 'GitHub App token expired'
      const expiredAt = new Date('2024-01-01T00:00:00Z')

      const error = new GitHubTokenExpiredError(message, expiredAt)

      expect(error.message).toBe(message)
      expect(error.expiredAt).toBe(expiredAt)
    })
  })

  describe('GitHubCacheError', () => {
    it('should create cache error with operation type', () => {
      const message = 'Failed to store cache entry'
      const operation = 'set'

      const error = new GitHubCacheError(message, operation)

      expect(error).toBeInstanceOf(GitHubClientError)
      expect(error.name).toBe('GitHubCacheError')
      expect(error.message).toBe(message)
      expect(error.operation).toBe(operation)
    })

    it('should accept all valid operation types', () => {
      const operations = ['get', 'set', 'delete', 'clear'] as const

      operations.forEach(operation => {
        const error = new GitHubCacheError(`Cache ${operation} failed`, operation)
        expect(error.operation).toBe(operation)
      })
    })
  })
})

describe('Error Utility Functions', () => {
  describe('isRequestError', () => {
    it('should identify valid request errors', () => {
      const requestError = Object.assign(new Error('Not found'), {
        status: 404,
        request: { method: 'GET', url: '/test' },
        response: { status: 404, headers: {} },
      }) as RequestError

      expect(isRequestError(requestError)).toBe(true)
    })

    it('should reject non-request errors', () => {
      expect(isRequestError(new Error('Regular error'))).toBe(false)
      expect(isRequestError('string error')).toBe(false)
      expect(isRequestError(null)).toBe(false)
      expect(isRequestError(undefined)).toBe(false)
      expect(isRequestError({})).toBe(false)
    })

    it('should reject objects missing required properties', () => {
      expect(isRequestError({ status: 404 })).toBe(false) // Missing request and response
      expect(isRequestError({ status: 404, request: {} })).toBe(false) // Missing response
      expect(isRequestError({ request: {}, response: {} })).toBe(false) // Missing status
    })
  })

  describe('isRateLimitError', () => {
    it('should identify rate limit errors', () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        status: 403,
        request: { method: 'GET', url: '/test' },
        response: {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
          },
        },
      }) as RequestError & { response: { headers: Record<string, string> } }

      expect(isRateLimitError(rateLimitError)).toBe(true)
    })

    it('should reject non-rate-limit 403 errors', () => {
      const forbiddenError = Object.assign(new Error('Forbidden'), {
        status: 403,
        request: { method: 'GET', url: '/test' },
        response: {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '100', // Still has remaining
          },
        },
      }) as RequestError & { response: { headers: Record<string, string> } }

      expect(isRateLimitError(forbiddenError)).toBe(false)
    })

    it('should reject non-403 errors', () => {
      const notFoundError = Object.assign(new Error('Not found'), {
        status: 404,
        request: { method: 'GET', url: '/test' },
        response: {
          status: 404,
          headers: {
            'x-ratelimit-remaining': '0',
          },
        },
      }) as RequestError & { response: { headers: Record<string, string> } }

      expect(isRateLimitError(notFoundError)).toBe(false)
    })

    it('should handle missing headers', () => {
      const errorWithoutHeaders = Object.assign(new Error('Forbidden'), {
        status: 403,
        request: { method: 'GET', url: '/test' },
        response: { status: 403 },
      }) as RequestError

      expect(isRateLimitError(errorWithoutHeaders)).toBe(false)
    })
  })

  describe('isSecondaryRateLimitError', () => {
    it('should identify secondary rate limit errors', () => {
      const secondaryError = Object.assign(new Error('Secondary rate limit'), {
        status: 403,
        request: { method: 'POST', url: '/test' },
        response: {
          status: 403,
          headers: {
            'retry-after': '60',
          },
        },
      }) as RequestError & { response: { headers: Record<string, string> } }

      expect(isSecondaryRateLimitError(secondaryError)).toBe(true)
    })

    it('should reject errors without retry-after header', () => {
      const regularError = Object.assign(new Error('Forbidden'), {
        status: 403,
        request: { method: 'POST', url: '/test' },
        response: {
          status: 403,
          headers: {},
        },
      }) as RequestError & { response: { headers: Record<string, string> } }

      expect(isSecondaryRateLimitError(regularError)).toBe(false)
    })

    it('should reject non-403 errors even with retry-after', () => {
      const serviceUnavailable = Object.assign(new Error('Service unavailable'), {
        status: 503,
        request: { method: 'POST', url: '/test' },
        response: {
          status: 503,
          headers: {
            'retry-after': '60',
          },
        },
      }) as RequestError & { response: { headers: Record<string, string> } }

      expect(isSecondaryRateLimitError(serviceUnavailable)).toBe(false)
    })
  })

  describe('extractErrorMessage', () => {
    it('should extract message from Error objects', () => {
      const error = new Error('Test error message')
      expect(extractErrorMessage(error)).toBe('Test error message')
    })

    it('should extract message from custom error objects', () => {
      const customError = new GitHubClientError('Custom error')
      expect(extractErrorMessage(customError)).toBe('Custom error')
    })

    it('should return string errors as-is', () => {
      expect(extractErrorMessage('String error')).toBe('String error')
    })

    it('should extract message property from objects', () => {
      const errorObj = { message: 'Object error message', code: 500 }
      expect(extractErrorMessage(errorObj)).toBe('Object error message')
    })

    it('should handle null and undefined', () => {
      expect(extractErrorMessage(null)).toBe('Unknown error occurred')
      expect(extractErrorMessage(undefined)).toBe('Unknown error occurred')
    })

    it('should handle objects without message', () => {
      expect(extractErrorMessage({ code: 500 })).toBe('Unknown error occurred')
    })

    it('should handle primitive values', () => {
      expect(extractErrorMessage(42)).toBe('Unknown error occurred')
      expect(extractErrorMessage(true)).toBe('Unknown error occurred')
    })

    it('should convert non-string message properties to strings', () => {
      const errorObj = { message: 42 }
      expect(extractErrorMessage(errorObj)).toBe('42')
    })
  })
})

describe('ErrorMessages', () => {
  it('should provide static error messages', () => {
    expect(ErrorMessages.AUTH_TOKEN_REQUIRED).toBe('Authentication token is required')
    expect(ErrorMessages.AUTH_TOKEN_EXPIRED).toBe('Authentication token has expired')
    expect(ErrorMessages.CONFIG_INVALID).toBe('Invalid configuration provided')
    expect(ErrorMessages.RATE_LIMIT_EXCEEDED).toBe('GitHub API rate limit exceeded')
  })

  it('should provide dynamic error message functions', () => {
    expect(ErrorMessages.AUTH_TYPE_INVALID('oauth2')).toBe('Invalid authentication type: oauth2')
    expect(ErrorMessages.RATE_LIMIT_GRAPHQL_EXCEEDED(75000, 50000)).toBe(
      'Query exceeds maximum point limit: 75,000 points (limit: 50,000)'
    )
  })

  it('should format webhook error messages', () => {
    expect(ErrorMessages.WEBHOOK_PAYLOAD_TOO_LARGE(2097152, 1048576)).toBe(
      'Payload too large: 2,097,152 bytes (max: 1,048,576)'
    )

    expect(ErrorMessages.WEBHOOK_DUPLICATE_DELIVERY('12345-67890')).toBe(
      'Duplicate delivery ID: 12345-67890'
    )

    expect(ErrorMessages.WEBHOOK_ALGORITHM_UNSUPPORTED('md5')).toBe(
      'Unsupported signature algorithm: md5'
    )
  })

  it('should format DataLoader error messages', () => {
    expect(ErrorMessages.DATALOADER_BATCH_LENGTH_MISMATCH(5, 3)).toBe(
      'DataLoader batch function must return an array of the same length as the input array\nExpected: 5, received: 3'
    )

    expect(ErrorMessages.DATALOADER_KEY_NOT_FOUND('owner/repo')).toBe(
      'Repository not found: owner/repo'
    )
  })

  it('should format API error messages', () => {
    expect(ErrorMessages.API_ERROR('repository fetch', 'Not found')).toBe(
      'GitHub API error for repository fetch: Not found'
    )

    expect(ErrorMessages.TOKEN_REFRESH_FAILED('Invalid credentials')).toBe(
      'Failed to refresh token: Invalid credentials'
    )
  })

  it('should format webhook handler error messages', () => {
    expect(
      ErrorMessages.WEBHOOK_HANDLER_EXECUTION_FAILED('push', 'Database connection failed')
    ).toBe('Handler for push event failed: Database connection failed')
  })

  it('should provide validation error messages', () => {
    expect(ErrorMessages.VALIDATION_RETRY_COUNT_NEGATIVE).toBe('Retry count cannot be negative')
    expect(ErrorMessages.VALIDATION_CACHE_SIZE_INVALID).toBe(
      'Cache size must be between 100 and 100,000'
    )
    expect(ErrorMessages.VALIDATION_RECOVERY_TIMEOUT_INVALID).toBe(
      'Recovery timeout must be positive'
    )
    expect(ErrorMessages.VALIDATION_FAILURE_THRESHOLD_INVALID).toBe(
      'Failure threshold must be positive'
    )
  })

  it('should provide configuration error messages', () => {
    expect(ErrorMessages.CONFIG_TOKEN_ROTATION_NOT_CONFIGURED).toBe('Token rotation not configured')
    expect(ErrorMessages.CONFIG_CACHE_NOT_CONFIGURED).toBe('Cache not configured')
    expect(ErrorMessages.CONFIG_WEBHOOK_SECRET_REQUIRED).toBe(
      'Webhook secret is required and must be a non-empty string'
    )
  })

  it('should handle webhook validation errors', () => {
    expect(ErrorMessages.WEBHOOK_SECRET_TOO_SHORT).toBe(
      'Webhook secret must be at least 10 characters long'
    )
    expect(ErrorMessages.WEBHOOK_SIGNATURE_FORMAT_INVALID).toBe(
      'Signature format is invalid (must be algorithm=signature)'
    )
    expect(ErrorMessages.WEBHOOK_EVENT_TYPE_MISSING).toBe('Missing x-github-event header')
    expect(ErrorMessages.WEBHOOK_DELIVERY_ID_MISSING).toBe('Missing x-github-delivery header')
  })
})
