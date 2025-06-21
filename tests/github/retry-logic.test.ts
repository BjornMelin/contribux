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
  })

  afterEach(() => {
    nock.cleanAll()
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
    it('should retry on transient 5xx server errors using deterministic delays', async () => {
      const retryHelper = new RetryTestHelper([
        { error: createGitHubError(500, 'Internal Server Error') },
        { error: createGitHubError(500, 'Internal Server Error') },
        { data: { login: 'testuser' } },
      ])

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 2,
          retryAfterBaseValue: 0, // No delay for testing
          doNotRetry: [400, 401, 403, 404, 422],
          calculateDelay: () => 0, // Instant retry for testing
        },
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(3)
        .reply(() => {
          attemptCount++
          try {
            return retryHelper.execute()
          } catch (error) {
            const githubError = error as Error & { status: number }
            return [githubError.status, { message: githubError.message }]
          }
        })

      const result = await client.rest.users.getAuthenticated()

      expect(attemptCount).toBe(3)
      expect(retryHelper.getAttempts()).toBe(3)
      expect(result.data.login).toBe('testuser')
    })

    it('should not retry on permanent 4xx client errors', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 3,
          doNotRetry: [400, 401, 403, 404, 422],
          calculateDelay: () => 0, // Instant retry for testing
        },
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(1) // Only expect one attempt
        .reply(() => {
          attemptCount++
          return [404, { message: 'Not Found' }]
        })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()

      expect(attemptCount).toBe(1) // Should not retry
    })

    it('should respect retry-after header with deterministic behavior', async () => {
      const mockTime = Date.now()
      const retryAfterSeconds = 2

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 1,
          calculateDelay: (retryCount, baseDelay = 1000, retryAfter) => {
            // Use the retry-after value if provided
            return retryAfter || baseDelay
          },
        },
      })

      const delaysUsed: number[] = []
      // @ts-expect-error accessing private property for testing
      const retryManager = client.retryManager as any
      retryManager.options.onRetry = (error: any, retryCount: number, state: any) => {
        delaysUsed.push(Date.now() - state.lastAttempt.getTime())
      }

      let attemptCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [
              429,
              { message: 'Too Many Requests' },
              {
                'retry-after': retryAfterSeconds.toString(),
              },
            ]
          }
          return [200, { login: 'testuser' }]
        })

      const result = await client.rest.users.getAuthenticated()

      expect(attemptCount).toBe(2)
      expect(result.data.login).toBe('testuser')
      
      // Verify that retry-after was respected
      expect(delaysUsed[0]).toBeGreaterThanOrEqual(retryAfterSeconds * 1000)
      expect(delaysUsed[0]).toBeLessThanOrEqual(retryAfterSeconds * 1000 * 1.1) // Allow for jitter
    })

    it('should handle concurrent retries without race conditions', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 1,
          calculateDelay: () => 0, // Instant retry
        },
      })

      const requestStatuses = new Map<string, number[]>()

      // Set up different failure patterns for different endpoints
      nock('https://api.github.com')
        .get('/users/user1')
        .times(2)
        .reply(function () {
          const key = 'user1'
          const attempts = requestStatuses.get(key) || []
          attempts.push(attempts.length + 1)
          requestStatuses.set(key, attempts)

          if (attempts.length === 1) {
            return [503, { message: 'Service Unavailable' }]
          }
          return [200, { login: 'user1' }]
        })

      nock('https://api.github.com')
        .get('/users/user2')
        .times(2)
        .reply(function () {
          const key = 'user2'
          const attempts = requestStatuses.get(key) || []
          attempts.push(attempts.length + 1)
          requestStatuses.set(key, attempts)

          if (attempts.length === 1) {
            return [502, { message: 'Bad Gateway' }]
          }
          return [200, { login: 'user2' }]
        })

      // Make concurrent requests
      const [result1, result2] = await Promise.all([
        client.rest.users.getByUsername({ username: 'user1' }),
        client.rest.users.getByUsername({ username: 'user2' }),
      ])

      expect(result1.data.login).toBe('user1')
      expect(result2.data.login).toBe('user2')
      expect(requestStatuses.get('user1')).toEqual([1, 2])
      expect(requestStatuses.get('user2')).toEqual([1, 2])
    })

  })

  describe('Circuit breaker pattern', () => {
    it('should open circuit after threshold failures without timing dependencies', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 0, // No retries
          circuitBreaker: {
            enabled: true,
            failureThreshold: 3,
            recoveryTimeout: 60000,
          },
        },
      })

      // Track circuit breaker state
      const circuitStates: string[] = []

      // Make requests that will fail
      for (let i = 0; i < 3; i++) {
        nock('https://api.github.com')
          .get('/user')
          .reply(500, { message: 'Internal Server Error' })

        try {
          await client.rest.users.getAuthenticated()
        } catch (error) {
          // Expected to fail
        }

        const circuitBreaker = (client as any).retryManager.circuitBreaker
        const isOpen = circuitBreaker ? circuitBreaker.isOpen() : false
        const state = isOpen ? 'OPEN' : 'CLOSED'
        circuitStates.push(state)
      }

      // Circuit should be open after 3 failures
      expect(circuitStates[2]).toBe('OPEN')

      // Next request should fail immediately without making HTTP call
      const scope = nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser' })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow(
        /circuit breaker is open/i
      )

      // Verify no HTTP request was made
      expect(scope.isDone()).toBe(false)

      nock.cleanAll()
    })

    it('should recover from open state using mock time', async () => {
      const mockNow = vi.spyOn(Date, 'now')
      let currentTime = 1000000

      mockNow.mockImplementation(() => currentTime)

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 0,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 1,
            recoveryTimeout: 5000, // 5 seconds
          },
        },
      })

      // Cause circuit to open
      nock('https://api.github.com')
        .get('/user')
        .reply(500, { message: 'Internal Server Error' })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()

      const circuitBreaker1 = (client as any).retryManager.circuitBreaker
      const state1 = circuitBreaker1 ? { state: circuitBreaker1.isOpen() ? 'OPEN' : 'CLOSED' } : { state: 'CLOSED' }
      expect(state1?.state).toBe('OPEN')

      // Advance time past recovery timeout
      currentTime += 6000

      // Circuit should now be half-open and allow a request
      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser' })

      const result = await client.rest.users.getAuthenticated()
      expect(result.data.login).toBe('testuser')

      const circuitBreaker2 = (client as any).retryManager.circuitBreaker
      const actualState = circuitBreaker2 ? circuitBreaker2.state : 'closed'
      const state2 = { state: actualState.toUpperCase() }
      expect(state2?.state).toBe('CLOSED') // Should be closed after successful request

      mockNow.mockRestore()
    })
  })

  describe('GraphQL error handling', () => {
    it('should retry on GraphQL rate limit errors', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 1,
          calculateDelay: () => 0,
        },
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .post('/graphql')
        .times(2)
        .reply(() => {
          attemptCount++
          if (attemptCount === 1) {
            return [
              200,
              {
                errors: [
                  {
                    type: 'RATE_LIMITED',
                    message: 'API rate limit exceeded',
                  },
                ],
              },
            ]
          }
          return [
            200,
            {
              data: {
                viewer: { login: 'testuser' },
              },
            },
          ]
        })

      const query = `query { viewer { login } }`
      const result = await client.graphql(query) as any

      expect(attemptCount).toBe(2)
      expect(result.data.viewer.login).toBe('testuser')
    })

    it('should not retry on GraphQL syntax errors', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 3,
          calculateDelay: () => 0,
        },
      })

      let attemptCount = 0

      nock('https://api.github.com')
        .post('/graphql')
        .times(1) // Only expect one attempt
        .reply(() => {
          attemptCount++
          return [
            200,
            {
              errors: [
                {
                  type: 'GRAPHQL_PARSE_FAILED',
                  message: 'Syntax error in GraphQL query',
                },
              ],
            },
          ]
        })

      const query = `query { invalid syntax }`
      await expect(client.graphql(query)).rejects.toThrow()

      expect(attemptCount).toBe(1) // Should not retry
    })
  })
})
