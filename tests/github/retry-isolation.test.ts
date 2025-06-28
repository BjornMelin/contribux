/**
 * Modern Retry Isolation Tests - Octokit Built-in Retry Patterns
 * Tests GitHub client retry behavior with modern Octokit patterns
 */

import { describe, expect, it } from 'vitest'
import { GitHubClient } from '../../src/lib/github/client'
import { createRequestContext, GitHubError } from '../../src/lib/github/errors'

describe('GitHub Client Retry Context - Modern Octokit Patterns', () => {
  it('should configure Octokit with proper retry settings', async () => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'ghp_test_token' },
      retry: { retries: 3, doNotRetry: ['400', '401', '404'] },
    })

    // Verify the client is configured properly
    expect(client.octokit).toBeDefined()

    // Test configuration is applied by checking internal properties
    // Modern Octokit stores retry config in plugin data
    const octokitWithRetry = client.octokit as unknown as { retry?: unknown }
    expect(octokitWithRetry.retry).toBeDefined()
  })

  it('should respect doNotRetry configuration in client validation', () => {
    expect(() => {
      new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
        retry: { retries: 3, doNotRetry: [404] }, // Should fail - numbers not allowed
      })
    }).toThrow('doNotRetry must be an array of strings')
  })

  it('should handle validation errors properly', () => {
    expect(() => {
      new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
        retry: { retries: -1 }, // Should fail - negative retries
      })
    }).toThrow('Retries must be a non-negative integer')

    expect(() => {
      new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
        retry: { retries: 15 }, // Should fail - too many retries
      })
    }).toThrow('Retries cannot exceed 10')
  })

  it('should store retry configuration internally for error context', () => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'ghp_test_token' },
      retry: { retries: 3, doNotRetry: ['400', '401'] },
    })

    // Test that configuration is stored internally for error context creation
    const internalRetryConfig = (
      client as unknown as { retryConfig: { retries: number; doNotRetry: string[] } }
    ).retryConfig
    expect(internalRetryConfig.retries).toBe(3)
    expect(internalRetryConfig.doNotRetry).toEqual(['400', '401'])
  })

  it('should verify Octokit plugin integration', () => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'ghp_test_token' },
      retry: { retries: 5, doNotRetry: [] },
    })

    // Verify Octokit instance has retry plugin loaded
    expect(client.octokit).toBeDefined()
    const octokitWithRetry = client.octokit as unknown as { retry?: unknown }
    expect(octokitWithRetry.retry).toBeDefined()
  })

  it('should handle error classification correctly', () => {
    // Test client error classification
    const clientError = new GitHubError('Bad Request', 'BAD_REQUEST', 400)
    expect(clientError.errorCategory).toBe('client')
    expect(clientError.isRetryable).toBe(false)

    const notFoundError = new GitHubError('Not Found', 'NOT_FOUND', 404)
    expect(notFoundError.errorCategory).toBe('client')
    expect(notFoundError.isRetryable).toBe(false)

    // Test server error classification
    const serverError = new GitHubError('Internal Server Error', 'SERVER_ERROR', 500)
    expect(serverError.errorCategory).toBe('server')
    expect(serverError.isRetryable).toBe(true)

    // Test retryable timeout error
    const timeoutError = new GitHubError('Request Timeout', 'TIMEOUT', 408)
    expect(timeoutError.errorCategory).toBe('client')
    expect(timeoutError.isRetryable).toBe(true) // Timeout is retryable

    // Test rate limit error
    const rateLimitError = new GitHubError('Rate Limit', 'RATE_LIMIT', 429)
    expect(rateLimitError.errorCategory).toBe('client')
    expect(rateLimitError.isRetryable).toBe(true) // Rate limits are retryable
  })

  it('should create proper request context for operations', () => {
    // Test request context creation
    const context = createRequestContext('GET', 'getUser', { username: 'testuser' }, 0, 2)

    expect(context.method).toBe('GET')
    expect(context.operation).toBe('getUser')
    expect(context.maxRetries).toBe(2)
    expect(context.retryAttempt).toBe(0)
    expect(context.timestamp).toBeDefined()
    expect(context.params).toEqual({ username: 'testuser' })
  })

  it('should use test environment defaults for retry configuration', () => {
    // In test environment, retries should default to 0
    const client = new GitHubClient({
      auth: { type: 'token', token: 'ghp_test_token' },
      // No retry config provided
    })

    const internalRetryConfig = (client as unknown as { retryConfig: { retries: number } })
      .retryConfig
    expect(internalRetryConfig.retries).toBe(0) // Test environment default
  })
})
