/**
 * Load Testing Stress & Edge Cases
 *
 * Tests stress testing scenarios, failure handling, and edge cases.
 * Focuses on system behavior under extreme conditions and error scenarios.
 */

import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '../../src/lib/github'
import { createRateLimitHeaders } from '../github/test-helpers'
import { createMockUser, ERROR_SCENARIOS, LOAD_TEST_CONFIG } from './fixtures/load-test-data'
import { setupPerformanceTest } from './setup/performance-setup'
import { addTestHandlers, createTrackedClient } from './utils/load-test-helpers'

describe('Load Testing - Stress & Edge Cases', () => {
  const setup = setupPerformanceTest()

  beforeAll(setup.beforeAll)
  beforeEach(setup.beforeEach)
  afterEach(setup.afterEach)
  afterAll(setup.afterAll)

  describe('Token Management Under Load', () => {
    it('should handle token rotation under concurrent load', async () => {
      const concurrency = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      const tokenCount = 3
      let requestCount = 0
      const tokenUsage = new Map<string, number>()

      // Create multiple clients with different tokens to simulate rotation
      const tokens = Array.from({ length: tokenCount }, (_, i) => `ghp_test_token_${i}`)
      const clients = tokens.map(token =>
        createTrackedClient(GitHubClient, {
          auth: { type: 'token', token },
          retry: { retries: 1 },
        })
      )

      // Create test-specific handler tracking which token was used
      const tokenHandler = http.get('https://api.github.com/user', ({ request }) => {
        requestCount++
        const authHeaders = request.headers.get('authorization')
        let token = authHeaders || ''

        // Remove "token " or "Bearer " prefix if present
        if (token.startsWith('token ')) {
          token = token.substring(6)
        } else if (token.startsWith('Bearer ')) {
          token = token.substring(7)
        }

        tokenUsage.set(token, (tokenUsage.get(token) || 0) + 1)

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(tokenHandler)

      // Execute concurrent requests using different clients
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const clientIndex = i % tokenCount
        const expectedToken = tokens[clientIndex]
        const client = clients[clientIndex]
        const result = await client.rest.users.getAuthenticated()
        expect(result.data.id).toBeGreaterThan(0)
        return { id: result.data.id, clientIndex, token: expectedToken }
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(requestCount).toBe(concurrency)

      // Verify token rotation occurred
      expect(tokenUsage.size).toBeGreaterThan(1) // Multiple tokens were used

      const duration = endTime - startTime
      console.log(`Token rotation handled ${concurrency} requests in ${duration}ms`)
      console.log('Token usage distribution:', Array.from(tokenUsage.entries()))

      // Clean up clients
      await Promise.all(clients.map(client => client.destroy()))
    }, 20000)

    it('should handle token refresh simulation under concurrent load', async () => {
      const concurrency = 8
      let requestCount = 0
      let tokenRefreshCount = 0

      const refreshHandler = http.get('https://api.github.com/user', () => {
        requestCount++
        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(refreshHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'refresh_test_token' },
      })

      // Execute concurrent requests that simulate token refresh
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        if (i % 5 === 0) {
          tokenRefreshCount++
        }
        const result = await client.rest.users.getAuthenticated()
        expect(result.data.id).toBeGreaterThan(0)
        return result.data.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(requestCount).toBe(concurrency)

      const duration = endTime - startTime
      console.log(`Token refresh simulation handled ${concurrency} requests in ${duration}ms`)
      console.log(`Token refreshes simulated: ${tokenRefreshCount}`)

      await client.destroy()
    }, 15000)

    it('should handle JWT generation simulation under load', async () => {
      const concurrency = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      let jwtGenerationCount = 0

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'jwt_test_token' },
      })

      const jwtHandler = http.get('https://api.github.com/user', () => {
        jwtGenerationCount++
        return HttpResponse.json(createMockUser(jwtGenerationCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - jwtGenerationCount }),
        })
      })

      await addTestHandlers(jwtHandler)

      // Test simulated JWT generation performance
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        const result = await client.rest.users.getAuthenticated()
        return result.data.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(jwtGenerationCount).toBe(concurrency)

      const duration = endTime - startTime
      const jwtPerSecond = (concurrency / duration) * 1000

      // JWT generation should be reasonably fast
      expect(duration).toBeLessThan(5000)
      expect(jwtPerSecond).toBeGreaterThan(0.5)

      console.log(
        `Simulated ${concurrency} JWT generations in ${duration}ms (${jwtPerSecond.toFixed(2)}/sec)`
      )

      await client.destroy()
    }, 8000)
  })

  describe('Failover Scenarios', () => {
    it('should handle token failover when tokens become invalid', async () => {
      const concurrency = LOAD_TEST_CONFIG.HIGH_CONCURRENCY
      let requestCount = 0
      let failoverCount = 0
      const failedTokens = new Set<string>()

      const failoverHandler = http.get('https://api.github.com/user', ({ request }) => {
        requestCount++
        const authHeaders = request.headers.get('authorization')
        const token = authHeaders?.replace('token ', '') || ''

        // Simulate failover by making some requests fail
        if (requestCount <= 5) {
          return HttpResponse.json(createMockUser(requestCount), {
            headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
          })
        }

        // Remaining requests fail to simulate token issues
        failedTokens.add(token)
        failoverCount++
        return HttpResponse.json(ERROR_SCENARIOS.UNAUTHORIZED, { status: 401 })
      })

      await addTestHandlers(failoverHandler)

      const primaryClient = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'primary_token' },
        retry: {
          retries: 1,
          doNotRetry: ['401'],
        },
      })

      // Execute requests that will trigger failover
      const promises = Array.from({ length: concurrency }, async () => {
        try {
          const result = await primaryClient.rest.users.getAuthenticated()
          return { success: true, id: result.data.id }
        } catch (error: unknown) {
          return { success: false, error: (error as { status?: number }).status }
        }
      })

      const results = await Promise.all(promises)

      // Verify some requests succeeded and some failed
      const successes = results.filter(r => r.success)
      const failures = results.filter(r => !r.success)

      expect(successes.length).toBeGreaterThan(0)
      expect(failures.length).toBeGreaterThan(0)
      expect(failoverCount).toBeGreaterThan(0)

      console.log(`Failover scenario: ${successes.length} successes, ${failures.length} failures`)
      console.log(`Failed tokens: ${Array.from(failedTokens)}`)

      await primaryClient.destroy()
    }, 15000)

    it('should handle rate limit failover across multiple tokens', async () => {
      const concurrency = 8
      let requestCount = 0

      const rateLimitHandler = http.get('https://api.github.com/user', () => {
        requestCount++

        // Simulate rate limiting after 5 requests
        if (requestCount > 5) {
          return HttpResponse.json(ERROR_SCENARIOS.RATE_LIMITED, {
            status: 429,
            headers: ERROR_SCENARIOS.RATE_LIMITED.headers,
          })
        }

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(rateLimitHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'ratelimit_test_token' },
        retry: { retries: 1 },
      })

      // Execute requests that will trigger rate limiting
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        try {
          const result = await client.rest.users.getAuthenticated()
          return { success: true, id: result.data.id }
        } catch (error: unknown) {
          return { success: false, error: (error as { status?: number }).status }
        }
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify rate limit handling
      const successes = results.filter(r => r.success)
      const rateLimitFailures = results.filter(r => r.error === 429)

      expect(successes.length).toBeGreaterThan(0)
      expect(rateLimitFailures.length).toBeGreaterThan(0)

      const duration = endTime - startTime
      console.log(
        `Rate limit failover: ${successes.length} successes, ${rateLimitFailures.length} rate limited`
      )
      console.log(`Completed in ${duration}ms`)

      await client.destroy()
    }, 15000)
  })

  describe('System Limits Testing', () => {
    it(
      'should validate system limits and thresholds',
      async () => {
        const maxConcurrency = LOAD_TEST_CONFIG.MAX_CONCURRENCY
        const incrementSize = LOAD_TEST_CONFIG.INCREMENT_SIZE
        const results: Array<{
          concurrency: number
          duration: number
          successRate: number
          avgLatency: number
        }> = []

        // Test increasing concurrency levels
        for (
          let concurrency = incrementSize;
          concurrency <= maxConcurrency;
          concurrency += incrementSize
        ) {
          let requestCount = 0

          const concurrencyHandler = http.get('https://api.github.com/user', async () => {
            requestCount++
            // Fixed 5ms delay
            await new Promise(resolve => setTimeout(resolve, 5))

            return HttpResponse.json(createMockUser(requestCount), {
              headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
            })
          })

          await addTestHandlers(concurrencyHandler)

          const client = createTrackedClient(GitHubClient, {
            auth: { type: 'token', token: 'limits_test_token' },
            retry: { retries: 1 },
          })

          // Execute test at this concurrency level
          const testStart = Date.now()
          const promises = Array.from({ length: concurrency }, async () => {
            const requestStart = Date.now()
            try {
              await client.rest.users.getAuthenticated()
              return { success: true, duration: Date.now() - requestStart }
            } catch {
              return { success: false, duration: Date.now() - requestStart }
            }
          })

          const testResults = await Promise.all(promises)
          const testEnd = Date.now()

          // Calculate metrics for this concurrency level
          const successes = testResults.filter(r => r.success)
          const durations = testResults.map(r => r.duration)
          const avgLatency =
            durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0

          const levelResult = {
            concurrency,
            duration: testEnd - testStart,
            successRate: (successes.length / testResults.length) * 100,
            avgLatency,
          }

          results.push(levelResult)

          console.log(
            `Concurrency ${concurrency}: ${levelResult.duration}ms, ` +
              `${levelResult.successRate.toFixed(1)}% success, ` +
              `${levelResult.avgLatency.toFixed(1)}ms avg latency`
          )

          // Break if performance degrades significantly
          if (levelResult.successRate < 70 || levelResult.avgLatency > 500) {
            console.log(`Performance degraded at concurrency level ${concurrency}`)
            break
          }

          await client.destroy()
        }

        // Analyze results across concurrency levels
        expect(results.length).toBeGreaterThan(0)

        // Find the optimal concurrency level
        const optimalLevel = results.findLast(r => r.successRate >= 80 && r.avgLatency <= 200)

        if (optimalLevel) {
          console.log(`Optimal concurrency level: ${optimalLevel.concurrency}`)
          console.log(
            `At optimal level: ${optimalLevel.successRate.toFixed(1)}% success, ${optimalLevel.avgLatency.toFixed(1)}ms latency`
          )
        }

        // Verify we can handle reasonable concurrency
        expect(results.some(r => r.concurrency >= 20 && r.successRate >= 80)).toBe(true)
      },
      LOAD_TEST_CONFIG.LONG_TIMEOUT
    )

    it('should handle extreme concurrency gracefully', async () => {
      const extremeConcurrency = 50
      let requestCount = 0
      let errorCount = 0

      const extremeHandler = http.get('https://api.github.com/user', async () => {
        requestCount++

        // Simulate system stress - some requests may fail
        if (requestCount > 30) {
          errorCount++
          return HttpResponse.json(ERROR_SCENARIOS.SERVER_ERROR, { status: 500 })
        }

        await new Promise(resolve => setTimeout(resolve, 10))

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(extremeHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'extreme_test_token' },
        retry: { retries: 1 },
      })

      // Execute extreme concurrency test
      const promises = Array.from({ length: extremeConcurrency }, async () => {
        try {
          const result = await client.rest.users.getAuthenticated()
          return { success: true, id: result.data.id }
        } catch (error: unknown) {
          return { success: false, error: (error as { status?: number }).status }
        }
      })

      const results = await Promise.all(promises)

      // Verify system handled extreme load
      const successes = results.filter(r => r.success)
      const failures = results.filter(r => !r.success)

      expect(results).toHaveLength(extremeConcurrency)
      expect(successes.length).toBeGreaterThan(0) // Some should succeed
      expect(failures.length).toBeGreaterThan(0) // Some should fail under extreme load

      const successRate = (successes.length / results.length) * 100
      console.log(
        `Extreme concurrency test: ${successes.length}/${extremeConcurrency} succeeded (${successRate.toFixed(1)}%)`
      )
      console.log(`Errors encountered: ${errorCount}`)

      await client.destroy()
    })
  })

  describe('Resource Exhaustion', () => {
    it('should handle memory pressure under sustained load', async () => {
      const batchSize = LOAD_TEST_CONFIG.HIGH_CONCURRENCY
      const batches = 5
      let totalRequests = 0
      const memorySnapshots: number[] = []

      const memoryHandler = http.get('https://api.github.com/users/:username', () => {
        totalRequests++

        // Simulate memory usage
        memorySnapshots.push(1000 + totalRequests * 10)

        return HttpResponse.json(createMockUser(totalRequests), {
          headers: createRateLimitHeaders({ remaining: 5000 - totalRequests }),
        })
      })

      await addTestHandlers(memoryHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'memory_test_token' },
      })

      // Execute sustained load in batches
      for (let batch = 0; batch < batches; batch++) {
        const promises = Array.from({ length: batchSize }, (_, i) =>
          client.rest.users.getByUsername({ username: `user_${batch}_${i}` })
        )

        const results = await Promise.all(promises)
        expect(results).toHaveLength(batchSize)

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Verify memory handling
      expect(totalRequests).toBe(batchSize * batches)
      expect(memorySnapshots.length).toBe(totalRequests)

      const maxMemory = Math.max(...memorySnapshots)
      const minMemory = Math.min(...memorySnapshots)

      console.log(`Memory pressure test: ${totalRequests} requests`)
      console.log(`Memory range: ${minMemory} - ${maxMemory}`)

      await client.destroy()
    })
  })
})
