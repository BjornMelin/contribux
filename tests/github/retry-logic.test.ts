import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github'
import {
  GitHubClientError,
  GitHubRateLimitError,
  GitHubTokenExpiredError,
  isRateLimitError,
  isSecondaryRateLimitError
} from '@/lib/github/errors'

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
      const client = new GitHubClient()

      const baseDelay = 1000
      const retryDelays = []

      for (let i = 0; i < 5; i++) {
        const delay = client.calculateRetryDelay(i, baseDelay)
        retryDelays.push(delay)
      }

      // Each delay should be roughly double the previous (with reduced jitter ±10%)
      expect(retryDelays[0]).toBeLessThanOrEqual(baseDelay * 1.1) // 0th retry: base delay + jitter
      expect(retryDelays[1]).toBeGreaterThan(baseDelay * 1.8) // 1st retry: 2^1 * base with jitter
      expect(retryDelays[1]).toBeLessThanOrEqual(baseDelay * 2.2)
      expect(retryDelays[2]).toBeGreaterThan(baseDelay * 3.6) // 2nd retry: 2^2 * base with jitter
      expect(retryDelays[2]).toBeLessThanOrEqual(baseDelay * 4.4)
    })

    it('should add random jitter to prevent thundering herd', () => {
      const client = new GitHubClient()

      // Generate multiple delays for the same retry count
      const delays = Array(10).fill(null).map(() => 
        client.calculateRetryDelay(2, 1000)
      )

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)

      // All delays should be within expected range (4000ms ±10%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(3600) // 4000 * 0.9
        expect(delay).toBeLessThanOrEqual(4400)    // 4000 * 1.1
      })
    })

    it('should cap maximum retry delay', () => {
      const client = new GitHubClient()

      const delay = client.calculateRetryDelay(10, 1000) // Very high retry count
      expect(delay).toBeLessThanOrEqual(30000) // 30 second max
    })
  })

  describe('Transient vs permanent error handling', () => {
    it('should retry on transient 5xx server errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 2,
          retryAfterBaseValue: 1, // Minimal delay
          doNotRetry: [400, 401, 403, 404, 422],
          calculateDelay: () => 1 // Fixed minimal delay for testing
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(3)
        .reply(() => {
          attemptCount++
          if (attemptCount < 3) {
            return [500, { message: 'Internal Server Error' }]
          }
          return [200, { login: 'testuser' }]
        })

      const result = await client.rest.users.getAuthenticated()
      
      expect(attemptCount).toBe(3)
      expect(result.data.login).toBe('testuser')
    }, 10000)

    it('should retry on 502 Bad Gateway errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { 
          retries: 1,
          calculateDelay: () => 1 // Fixed minimal delay for testing
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [502, { message: 'Bad Gateway' }]
          }
          return [200, { name: 'repo', full_name: 'owner/repo' }]
        })

      const result = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      
      expect(attemptCount).toBe(2)
      expect(result.data.name).toBe('repo')
    })

    it('should retry on 503 Service Unavailable errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { 
          retries: 1,
          calculateDelay: () => 10 // Short delay for testing
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/repos/owner/repo/issues')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [503, { message: 'Service Unavailable' }]
          }
          return [200, [{ title: 'Test Issue' }]]
        })

      const result = await client.rest.issues.listForRepo({ 
        owner: 'owner', 
        repo: 'repo' 
      })
      
      expect(attemptCount).toBe(2)
      expect((result.data as any)[0]?.title).toBe('Test Issue')
    }, 10000)

    it('should NOT retry on permanent 4xx client errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 3,
          doNotRetry: [400, 401, 403, 404, 422]
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .reply(() => {
          attemptCount++
          return [401, { message: 'Bad credentials' }]
        })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
      
      expect(attemptCount).toBe(1) // Should not retry
    }, 5000)

    it('should NOT retry on 422 Unprocessable Entity errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 3 }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .post('/repos/owner/repo/issues')
        .reply(() => {
          attemptCount++
          return [422, { 
            message: 'Validation Failed',
            errors: [{ field: 'title', code: 'missing' }]
          }]
        })

      await expect(client.rest.issues.create({
        owner: 'owner',
        repo: 'repo',
        title: ''
      })).rejects.toThrow()
      
      expect(attemptCount).toBe(1)
    }, 10000)
  })

  describe('Rate limit retry handling', () => {
    it('should retry after primary rate limit with proper delay', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { 
          retries: 2,
          calculateDelay: () => 10 // Very short delay for testing
        },
        throttle: {
          onRateLimit: () => true, // Always retry
          onSecondaryRateLimit: () => true
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [403, 
              { message: 'API rate limit exceeded' },
              {
                'x-ratelimit-limit': '5000',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': Math.floor((Date.now() + 1000) / 1000).toString(), // 1 second instead of 60
                'retry-after': '1' // Short retry after for testing
              }
            ]
          }
          return [200, { login: 'testuser' }]
        })

      const result = await client.rest.users.getAuthenticated()
      
      expect(attemptCount).toBe(2)
      expect(result.data.login).toBe('testuser')
    }, 15000)

    it('should retry after secondary rate limit', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { 
          retries: 2,
          calculateDelay: () => 10 // Very short delay for testing
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/search/repositories')
        .query({ q: 'test' })
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [403, 
              { message: 'You have exceeded a secondary rate limit' },
              { 'retry-after': '1' } // Short retry after for testing
            ]
          }
          return [200, { total_count: 0, items: [] }]
        })

      const result = await client.rest.search.repos({ q: 'test' })
      
      expect(attemptCount).toBe(2)
      expect(result.data.total_count).toBe(0)
    }, 15000)

    it('should extract retry delay from Retry-After header', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      // Direct test of the retry delay calculation function
      const { calculateRetryDelay } = await import('@/lib/github/retry-logic')
      
      // Test the function directly with a retry-after value
      const delay = calculateRetryDelay(1, 1000, 120000) // 120 seconds in ms
      
      // Should return a value close to 120000ms (with small jitter)
      expect(delay).toBeGreaterThan(115000) // Allow for jitter
      expect(delay).toBeLessThan(125000) // Allow for jitter
    }, 10000)
  })

  describe('Circuit breaker functionality', () => {
    it('should implement circuit breaker to prevent cascading failures', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 1, // Reduce retries for faster test
          calculateDelay: () => 1, // Very short delay
          circuitBreaker: {
            enabled: true,
            failureThreshold: 2, // Lower threshold
            recoveryTimeout: 1000 // Minimum required timeout
          }
        },
        throttle: {
          enabled: false // Disable throttling to test only circuit breaker
        }
      })

      let attemptCount = 0

      // Mock multiple failures to trigger circuit breaker
      nock('https://api.github.com')
        .get('/user')
        .times(10)
        .reply(() => {
          attemptCount++
          return [500, { message: 'Internal Server Error' }]
        })

      // Make requests sequentially to ensure proper circuit breaker behavior
      for (let i = 0; i < 3; i++) {
        try {
          await client.rest.users.getAuthenticated()
        } catch (error) {
          // Expected failures
        }
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Circuit breaker should prevent excessive attempts
      // With failureThreshold=2, after 2 failures the circuit should open
      // Each request can retry once, so max should be 4 attempts before circuit opens
      expect(attemptCount).toBeLessThanOrEqual(4)
    }, 10000)

    it('should allow requests after circuit breaker recovery timeout', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 1,
          calculateDelay: () => 1, // Very short delay
          circuitBreaker: {
            enabled: true,
            failureThreshold: 2,
            recoveryTimeout: 1000 // Minimum required timeout
          }
        }
      })

      let attemptCount = 0

      // First, trigger circuit breaker with failures
      nock('https://api.github.com')
        .get('/user')
        .times(3)
        .reply(() => {
          attemptCount++
          return [500, { message: 'Internal Server Error' }]
        })

      // Trigger circuit breaker
      try {
        await client.rest.users.getAuthenticated()
      } catch (error) {
        // Expected
      }

      try {
        await client.rest.users.getAuthenticated()
      } catch (error) {
        // Expected - should trip circuit breaker
      }

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Now mock successful response
      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser' })

      // This should succeed after circuit breaker recovery
      const result = await client.rest.users.getAuthenticated()
      expect(result.data.login).toBe('testuser')
    }, 10000)
  })

  describe('GraphQL retry logic', () => {
    it('should retry GraphQL queries on server errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 2, calculateDelay: () => 10 }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .post('/graphql')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [500, { message: 'Internal Server Error' }]
          }
          return [200, {
            data: { viewer: { login: 'testuser' } }
          }]
        })

      const result = await client.graphql(`query { viewer { login } }`)
      
      expect(attemptCount).toBe(2)
      expect((result as any).viewer?.login).toBe('testuser')
    }, 10000)

    it('should NOT retry GraphQL queries on query errors', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 3, calculateDelay: () => 10 }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .post('/graphql')
        .reply(() => {
          attemptCount++
          return [200, {
            errors: [
              {
                message: 'Field \'invalidField\' doesn\'t exist on type \'User\'',
                locations: [{ line: 1, column: 25 }]
              }
            ]
          }]
        })

      await expect(client.graphql(`query { viewer { invalidField } }`))
        .rejects.toThrow()
      
      expect(attemptCount).toBe(1) // Should not retry on GraphQL errors
    }, 10000)

    it('should handle GraphQL rate limiting in queries', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 2, calculateDelay: () => 10 }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .post('/graphql')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [200, {
              errors: [
                {
                  type: 'RATE_LIMITED',
                  message: 'API rate limit exceeded'
                }
              ]
            }]
          }
          return [200, {
            data: { viewer: { login: 'testuser' } }
          }]
        })

      const result = await client.graphql(`query { viewer { login } }`)
      
      expect(attemptCount).toBe(2)
      expect((result as any).viewer?.login).toBe('testuser')
    }, 10000)
  })

  describe('Custom retry strategies', () => {
    it('should support custom retry conditions', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 3,
          calculateDelay: () => 10, // Very short delay for testing
          shouldRetry: (error: any, retryCount: number) => {
            // Custom logic: retry on 418 (I'm a teapot) for testing
            return error.status === 418 && retryCount < 2
          }
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(3)
        .reply(() => {
          attemptCount++
          if (attemptCount < 3) {
            return [418, { message: "I'm a teapot" }]
          }
          return [200, { login: 'testuser' }]
        })

      const result = await client.rest.users.getAuthenticated()
      
      expect(attemptCount).toBe(3)
      expect(result.data.login).toBe('testuser')
    }, 10000)

    it('should support custom retry delay calculation', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const customDelays = [10, 20, 30] // Very short delays for testing
      let delayIndex = 0

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 3,
          calculateDelay: (retryCount: number) => {
            return customDelays[delayIndex++] || 10
          }
        }
      })

      let attemptCount = 0
      const attemptTimes: number[] = []

      nock('https://api.github.com')
        .get('/user')
        .times(4)
        .reply(() => {
          attemptCount++
          attemptTimes.push(Date.now())
          if (attemptCount < 4) {
            return [500, { message: 'Internal Server Error' }]
          }
          return [200, { login: 'testuser' }]
        })

      const result = await client.rest.users.getAuthenticated()
      
      expect(attemptCount).toBe(4)
      expect(result.data.login).toBe('testuser')
    }, 10000)
  })

  describe('Error context and logging', () => {
    it('should preserve original error context through retries', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 2, calculateDelay: () => 10 }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/repos/owner/nonexistent')
        .times(1)
        .reply(() => {
          attemptCount++
          return [404, { 
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/rest'
          }]
        })

      try {
        await client.rest.repos.get({ owner: 'owner', repo: 'nonexistent' })
      } catch (error: any) {
        expect(error.status).toBe(404)
        expect(error.response?.data?.message).toBe('Not Found')
        expect(attemptCount).toBe(1) // Should not retry 404
      }
    }, 10000)

    it('should log retry attempts when configured', async () => {
      vi.useRealTimers() // Use real timers for this test
      
      const retryLogs: string[] = []

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 2,
          calculateDelay: () => 10, // Very short delay for testing
          onRetry: (error: any, retryCount: number) => {
            retryLogs.push(`Retry ${retryCount}: ${error.status}`)
          }
        }
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(3)
        .reply(() => {
          attemptCount++
          if (attemptCount < 3) {
            return [502, { message: 'Bad Gateway' }]
          }
          return [200, { login: 'testuser' }]
        })

      const result = await client.rest.users.getAuthenticated()
      
      expect(retryLogs).toEqual(['Retry 1: 502', 'Retry 2: 502'])
      expect(result.data.login).toBe('testuser')
    }, 10000)
  })

  describe('Retry configuration validation', () => {
    it('should validate retry configuration on client creation', () => {
      expect(() => {
        new GitHubClient({
          retry: {
            retries: -1 // Invalid
          }
        })
      }).toThrow('Retry count cannot be negative')

      expect(() => {
        new GitHubClient({
          retry: {
            retries: 11 // Too high
          }
        })
      }).toThrow('Maximum retry count is 10')
    })

    it('should use sensible defaults for retry configuration', () => {
      const client = new GitHubClient()
      const config = client.getRetryConfig()

      expect(config.retries).toBe(3)
      expect(config.retryAfterBaseValue).toBe(1000)
      expect(config.doNotRetry).toContain(400)
      expect(config.doNotRetry).toContain(401)
      expect(config.doNotRetry).toContain(403)
      expect(config.doNotRetry).toContain(404)
      expect(config.doNotRetry).toContain(422)
    })
  })
})