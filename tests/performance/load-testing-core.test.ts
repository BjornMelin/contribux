/**
 * Core Load Testing Functionality
 *
 * Tests basic load testing setup, configuration, and simple scenarios.
 * Focuses on fundamental load testing patterns and client creation.
 */

import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github'
import { createRateLimitHeaders } from '../github/test-helpers'
import { createMockUser, LOAD_TEST_CONFIG, PERFORMANCE_THRESHOLDS } from './fixtures/load-test-data'
import { setupPerformanceTest } from './setup/performance-setup'
import {
  addTestHandlers,
  createStandardGraphQLHandler,
  createStandardUserHandler,
  createTrackedClient,
  measureExecutionTime,
} from './utils/load-test-helpers'

describe('Load Testing - Core Functionality', () => {
  const setup = setupPerformanceTest()

  beforeAll(setup.beforeAll)
  beforeEach(setup.beforeEach)
  afterEach(setup.afterEach)
  afterAll(setup.afterAll)

  describe('Basic Load Testing Setup', () => {
    it('should create and configure tracked clients correctly', async () => {
      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      expect(client).toBeDefined()
      expect(client.destroy).toBeDefined()
      expect(typeof client.destroy).toBe('function')

      // Test client configuration
      expect(client.rest).toBeDefined()
      expect(client.graphql).toBeDefined()

      await client.destroy()
    })

    it('should handle basic client lifecycle', async () => {
      const testToken = 'lifecycle_test_token'
      const handler = createStandardUserHandler(testToken)

      await addTestHandlers(handler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
      })

      // Test basic functionality
      const result = await client.rest.users.getAuthenticated()
      expect(result.data).toMatchObject(createMockUser(1))

      // Test cleanup
      await client.destroy()
      expect(client.destroy).toBeDefined()
    })

    it('should support multiple client instances', async () => {
      const clients = Array.from({ length: 3 }, (_, i) =>
        createTrackedClient(GitHubClient, {
          auth: { type: 'token', token: `test_token_${i}` },
        })
      )

      expect(clients).toHaveLength(3)

      // Verify each client is independent
      for (const [_index, client] of clients.entries()) {
        expect(client).toBeDefined()
        expect(client.destroy).toBeDefined()
      }

      // Clean up all clients
      await Promise.all(clients.map(client => client.destroy()))
    })
  })

  describe('Simple Load Scenarios', () => {
    it('should handle sequential REST API requests', async () => {
      const requestCount = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      const testToken = 'sequential_rest_token'
      const handler = createStandardUserHandler(testToken)

      await addTestHandlers(handler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
        retry: { retries: 1 },
      })

      const results = []
      const startTime = Date.now()

      // Execute requests sequentially
      for (let i = 0; i < requestCount; i++) {
        const result = await client.rest.users.getAuthenticated()
        expect(result.data.id).toBeGreaterThan(0)
        results.push(result.data.id)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Verify all requests completed
      expect(results).toHaveLength(requestCount)
      expect(duration).toBeGreaterThan(0)

      console.log(`Sequential requests: ${requestCount} requests in ${duration}ms`)

      await client.destroy()
    })

    it('should handle sequential GraphQL requests', async () => {
      const requestCount = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      const testToken = 'sequential_graphql_token'
      const handler = createStandardGraphQLHandler(testToken)

      await addTestHandlers(handler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
      })

      const results = []
      const startTime = Date.now()

      // Execute GraphQL requests sequentially
      for (let i = 0; i < requestCount; i++) {
        const result = await client.graphql(`
          query {
            viewer {
              login
              id
            }
          }
        `)

        expect(result).toBeDefined()
        expect((result as { viewer?: { login?: string } }).viewer).toBeDefined()
        results.push((result as { viewer?: { id?: string } }).viewer?.id)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Verify all requests completed
      expect(results).toHaveLength(requestCount)
      expect(duration).toBeGreaterThan(0)

      console.log(`Sequential GraphQL: ${requestCount} requests in ${duration}ms`)

      await client.destroy()
    })

    it('should measure request timing accurately', async () => {
      const testToken = 'timing_test_token'
      const handler = createStandardUserHandler(testToken)

      await addTestHandlers(handler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
      })

      // Measure single request timing
      const { result, duration } = await measureExecutionTime(async () => {
        return await client.rest.users.getAuthenticated()
      })

      expect(result.data.id).toBe(1)
      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThan(5000) // Should be reasonably fast

      console.log(`Single request timing: ${duration}ms`)

      await client.destroy()
    })
  })

  describe('Basic Concurrency', () => {
    it(
      'should handle low-concurrency parallel requests',
      async () => {
        const concurrency = LOAD_TEST_CONFIG.REDUCED_CONCURRENCY
        const testToken = 'low_concurrency_token'
        const handler = createStandardUserHandler(testToken)

        await addTestHandlers(handler)

        const client = createTrackedClient(GitHubClient, {
          auth: { type: 'token', token: testToken },
          retry: { retries: 1 },
        })

        // Execute low-concurrency parallel requests
        const startTime = Date.now()
        const promises = Array.from({ length: concurrency }, async () => {
          const result = await client.rest.users.getAuthenticated()
          expect(result.data.id).toBeGreaterThan(0)
          return result.data.id
        })

        const results = await Promise.all(promises)
        const endTime = Date.now()
        const duration = endTime - startTime

        // Verify all requests completed
        expect(results).toHaveLength(concurrency)
        expect(new Set(results)).toHaveProperty('size', concurrency) // All unique responses
        expect(duration).toBeLessThan(LOAD_TEST_CONFIG.DEFAULT_TIMEOUT)

        console.log(`Low concurrency test: ${concurrency} requests in ${duration}ms`)

        await client.destroy()
      },
      LOAD_TEST_CONFIG.DEFAULT_TIMEOUT
    )

    it('should maintain response quality under basic load', async () => {
      const concurrency = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      const testToken = 'quality_test_token'
      const handler = createStandardUserHandler(testToken)

      await addTestHandlers(handler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
      })

      // Execute requests and validate response quality
      const promises = Array.from({ length: concurrency }, async (_, _index) => {
        const requestStart = Date.now()
        const result = await client.rest.users.getAuthenticated()
        const requestEnd = Date.now()

        // Validate response structure
        expect(result.data).toMatchObject({
          login: expect.stringMatching(/^user_\d+$/),
          id: expect.any(Number),
          avatar_url: expect.stringMatching(/^https:\/\/github\.com\/images\/user_\d+\.png$/),
          html_url: expect.stringMatching(/^https:\/\/github\.com\/user_\d+$/),
          type: 'User',
          site_admin: false,
        })

        return {
          id: result.data.id,
          duration: requestEnd - requestStart,
          valid: true,
        }
      })

      const results = await Promise.all(promises)

      // Verify all responses are valid
      expect(results.every(r => r.valid)).toBe(true)
      expect(results.every(r => r.duration > 0)).toBe(true)

      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
      expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.AVG_LATENCY_MAX)

      console.log(
        `Response quality test: ${results.length} valid responses, avg ${avgDuration.toFixed(2)}ms`
      )

      await client.destroy()
    })
  })

  describe('Configuration Validation', () => {
    it('should respect retry configuration under load', async () => {
      const testToken = 'retry_config_token'
      let requestCount = 0

      const retryHandler = http.get('https://api.github.com/user', () => {
        requestCount++

        // Fail first request, succeed on retry
        if (requestCount === 1) {
          return HttpResponse.json({ message: 'Server error' }, { status: 500 })
        }

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(retryHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
        retry: { retries: 2 },
      })

      // Should succeed after retry
      const result = await client.rest.users.getAuthenticated()
      expect(result.data.id).toBeGreaterThan(0) // Should have valid ID
      expect(requestCount).toBeGreaterThanOrEqual(2) // At least one retry

      await client.destroy()
    })

    it('should handle authentication configuration correctly', async () => {
      const tokens = ['token_1', 'token_2', 'token_3']
      const clients = tokens.map(token =>
        createTrackedClient(GitHubClient, {
          auth: { type: 'token', token },
        })
      )

      // Verify each client has correct configuration
      for (const [_index, client] of clients.entries()) {
        expect(client).toBeDefined()
        expect(client.rest).toBeDefined()
        expect(client.graphql).toBeDefined()
      }

      // Clean up
      await Promise.all(clients.map(client => client.destroy()))
    })
  })
})
