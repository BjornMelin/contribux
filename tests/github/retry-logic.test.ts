import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github'
import {
  GitHubClientError,
  GitHubRateLimitError,
  GitHubTokenExpiredError,
  isRateLimitError,
  isSecondaryRateLimitError,
} from '@/lib/github/errors'
import { calculateRetryDelay } from '@/lib/github/retry-logic'
import {
  waitFor,
  RetryTestHelper,
  createGitHubError,
  createRateLimitHeaders,
} from './test-helpers'

describe('GitHub Client Retry Logic', () => {
  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    nock.cleanAll()
    vi.useRealTimers()
  })

  describe('Exponential backoff with jitter', () => {
    it('should calculate retry delays with exponential backoff', () => {
      // Mock Math.random to get deterministic results
      const mockRandom = vi.spyOn(Math, 'random')
      mockRandom.mockReturnValue(0.5) // Middle of jitter range

      const baseDelay = 1000
      const expectedDelays = [
        1000, // 2^0 * 1000
        2000, // 2^1 * 1000
        4000, // 2^2 * 1000
        8000, // 2^3 * 1000
        16000, // 2^4 * 1000
      ]

      const retryDelays = []
      for (let i = 0; i < 5; i++) {
        const delay = calculateRetryDelay(i, baseDelay)
        retryDelays.push(delay)
      }

      // With mocked random at 0.5, jitter is 0, so we get exact exponential values
      retryDelays.forEach((delay, index) => {
        expect(delay).toBe(expectedDelays[index])
      })

      mockRandom.mockRestore()
    })

    it('should add random jitter to prevent thundering herd', () => {
      const client = new GitHubClient()

      // Generate multiple delays for the same retry count
      const delays = Array(10)
        .fill(null)
        .map(() => client.calculateRetryDelay(2, 1000))

      // All delays should be within expected range (4000ms ±10%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(3600) // 4000 * 0.9
        expect(delay).toBeLessThanOrEqual(4400) // 4000 * 1.1
      })

      // At least some delays should be different due to jitter
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)
    })

    it('should cap maximum retry delay', () => {
      const client = new GitHubClient()

      const delay = client.calculateRetryDelay(10, 1000) // Very high retry count
      expect(delay).toBeLessThanOrEqual(30000) // 30 second max
      expect(delay).toBeGreaterThanOrEqual(27000) // 30000 * 0.9 (with jitter)
    })
  })

  describe('Transient vs permanent error handling', () => {
    it('should retry on transient 5xx server errors', async () => {
      const { RetryManager } = await import('@/lib/github/retry-logic')
      const { GitHubClientError } = await import('@/lib/github/errors')
      
      const manager = new RetryManager({
        retries: 2,
        retryAfterBaseValue: 1000,
        doNotRetry: [400, 401, 403, 404, 422],
        enabled: true,
        calculateDelay: () => 0, // No delay for testing
      })

      let attempts = 0
      const operation = async () => {
        attempts++
        if (attempts < 3) {
          const error = new GitHubClientError('Server Error') as GitHubClientError & { status: number }
          error.status = 500
          throw error
        }
        return 'success'
      }

      const result = await manager.executeWithRetry(operation)
      
      expect(attempts).toBe(3)
      expect(result).toBe('success')
    })

    it('should not retry on permanent 4xx client errors', async () => {
      const { RetryManager } = await import('@/lib/github/retry-logic')
      const { GitHubClientError } = await import('@/lib/github/errors')
      
      const manager = new RetryManager({
        retries: 3,
        retryAfterBaseValue: 1000,
        doNotRetry: [400, 401, 403, 404, 422],
        enabled: true,
        calculateDelay: () => 0,
      })

      let attempts = 0
      const operation = async () => {
        attempts++
        const error = new GitHubClientError('Not Found') as GitHubClientError & { status: number }
        error.status = 404
        throw error
      }

      await expect(manager.executeWithRetry(operation)).rejects.toThrow('Not Found')
      expect(attempts).toBe(1) // Should not retry
    })

    it('should respect retry-after header with fake timers', async () => {
      const { RetryManager } = await import('@/lib/github/retry-logic')
      const { GitHubRateLimitError } = await import('@/lib/github/errors')
      
      const manager = new RetryManager({
        retries: 1,
        retryAfterBaseValue: 1000,
        doNotRetry: [],
        enabled: true,
        calculateDelay: (retryCount, baseDelay, retryAfter) => {
          return retryAfter || 0 // Use retry-after if provided, otherwise no delay
        },
      })

      let attempts = 0
      const operation = async () => {
        attempts++
        if (attempts === 1) {
          const error = new GitHubRateLimitError('Rate Limited', 2) // 2 second retry-after
          throw error
        }
        return 'success'
      }

      const result = await manager.executeWithRetry(operation)
      
      expect(attempts).toBe(2)
      expect(result).toBe('success')
    })

    it('should handle concurrent retries without race conditions', async () => {
      const { RetryManager } = await import('@/lib/github/retry-logic')
      const { GitHubClientError } = await import('@/lib/github/errors')
      
      const manager = new RetryManager({
        retries: 1,
        retryAfterBaseValue: 1000,
        doNotRetry: [],
        enabled: true,
        calculateDelay: () => 0, // No delay for testing
      })

      const requestStatuses = new Map<string, number[]>()

      const createOperation = (key: string) => async () => {
        const attempts = requestStatuses.get(key) || []
        attempts.push(attempts.length + 1)
        requestStatuses.set(key, attempts)

        if (attempts.length === 1) {
          const error = new GitHubClientError('Service Error') as GitHubClientError & { status: number }
          error.status = 503
          throw error
        }
        return `${key} success`
      }

      // Make concurrent requests
      const [result1, result2] = await Promise.all([
        manager.executeWithRetry(createOperation('user1')),
        manager.executeWithRetry(createOperation('user2')),
      ])

      expect(result1).toBe('user1 success')
      expect(result2).toBe('user2 success')
      expect(requestStatuses.get('user1')).toEqual([1, 2])
      expect(requestStatuses.get('user2')).toEqual([1, 2])
    })

  })

  describe('Circuit breaker pattern', () => {
    it('should open circuit after threshold failures', async () => {
      const { RetryManager } = await import('@/lib/github/retry-logic')
      const { GitHubClientError } = await import('@/lib/github/errors')
      
      const mockNow = vi.spyOn(Date, 'now')
      let currentTime = 1000000
      mockNow.mockImplementation(() => currentTime)

      const manager = new RetryManager({
        retries: 0, // No retries to test circuit breaker directly
        retryAfterBaseValue: 1000,
        doNotRetry: [],
        enabled: true,
        calculateDelay: () => 0, // No delay for testing
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3,
          recoveryTimeout: 60000,
        },
      })

      let failureCount = 0
      const failingOperation = async () => {
        failureCount++
        const error = new GitHubClientError(`Failure ${failureCount}`) as GitHubClientError & { status: number }
        error.status = 500
        throw error
      }

      // Execute 3 operations that will fail to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await manager.executeWithRetry(failingOperation)
        } catch {
          // Expected to fail, ignore the error
        }
      }

      // Circuit should be open now - next operation should fail immediately with circuit breaker message
      await expect(manager.executeWithRetry(failingOperation)).rejects.toThrow(/circuit breaker/i)

      mockNow.mockRestore()
    })

    it('should recover from open state using fake timers', async () => {
      const { RetryManager } = await import('@/lib/github/retry-logic')
      const { GitHubClientError } = await import('@/lib/github/errors')
      
      const mockNow = vi.spyOn(Date, 'now')
      let currentTime = 1000000
      mockNow.mockImplementation(() => currentTime)

      const manager = new RetryManager({
        retries: 0,
        retryAfterBaseValue: 1000,
        doNotRetry: [],
        enabled: true,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 1,
          recoveryTimeout: 5000,
        },
      })

      // Trigger circuit open
      try {
        await manager.executeWithRetry(async () => {
          const error = new GitHubClientError('Test failure') as GitHubClientError & { status: number }
          error.status = 500
          throw error
        })
      } catch {
        // Expected
      }

      // Advance time past recovery timeout
      currentTime += 6000

      // Next operation should succeed if the operation is fixed
      const result = await manager.executeWithRetry(async () => {
        return 'success'
      })

      expect(result).toBe('success')

      mockNow.mockRestore()
    })
  })

  describe('GraphQL error handling', () => {
    it.skip('should retry on GraphQL rate limit errors', async () => {
      // This test involves full client integration and will be covered in integration tests
    })

    it.skip('should not retry on GraphQL syntax errors', async () => {
      // This test involves full client integration and will be covered in integration tests
    })
  })
})