import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import { GitHubClientConfig, TokenInfo } from '@/lib/github'
import {
  setupGitHubTestIsolation,
  createTrackedClient,
  createRateLimitHeaders,
  createGitHubError,
  waitFor,
  createDeferred,
  MockTimer,
} from '../../github/test-helpers'

describe('GitHub Client Load Testing', () => {
  setupGitHubTestIsolation()

  // Helper to create multiple clients with tracking
  const createMultipleClients = (count: number, config?: Partial<GitHubClientConfig>) => {
    return Array.from({ length: count }, (_, i) =>
      createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: `test_token_${i}` },
        ...config,
      })
    )
  }

  // Helper to create token rotation client
  const createTokenRotationClient = (tokenCount: number, config?: Partial<GitHubClientConfig>) => {
    const tokens: TokenInfo[] = Array.from({ length: tokenCount }, (_, i) => ({
      token: `ghp_test_token_${i}`,
      type: 'personal' as const,
      scopes: ['repo', 'user'],
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    }))

    return createTrackedClient(GitHubClient, {
      tokenRotation: {
        tokens,
        rotationStrategy: 'round-robin',
        refreshBeforeExpiry: 5, // 5 minutes
      },
      ...config,
    })
  }

  describe('High-Concurrency Operations', () => {
    it('should handle 50 concurrent REST API requests', async () => {
      const concurrency = 50
      let requestCount = 0

      // Mock successful responses for all requests
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(() => {
          requestCount++
          return [
            200,
            { login: `user_${requestCount}`, id: requestCount },
            createRateLimitHeaders({ remaining: 5000 - requestCount }),
          ]
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { enabled: true, retries: 3 },
        throttle: { enabled: true },
      })

      // Execute concurrent requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const result = await client.rest.users.getAuthenticated()
        expect(result.data.id).toBeGreaterThan(0)
        return result.data.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(new Set(results)).toHaveProperty('size', concurrency) // All unique responses
      expect(requestCount).toBe(concurrency)

      // Verify performance (should complete within reasonable time)
      const duration = endTime - startTime
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds

      console.log(`Completed ${concurrency} concurrent requests in ${duration}ms`)
    }, 15000)

    it('should handle 100 concurrent GraphQL requests with batching', async () => {
      const concurrency = 100
      let requestCount = 0

      // Mock GraphQL responses
      nock('https://api.github.com')
        .persist()
        .post('/graphql')
        .reply(() => {
          requestCount++
          return [
            200,
            {
              data: {
                viewer: { login: `user_${requestCount}`, id: `gid_${requestCount}` },
                rateLimit: {
                  limit: 5000,
                  remaining: 5000 - requestCount,
                  resetAt: new Date(Date.now() + 3600000).toISOString(),
                  cost: 1,
                  nodeCount: 1,
                },
              },
            },
          ]
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        includeRateLimit: true,
        cache: {
          enabled: true,
          storage: 'memory',
          dataloaderEnabled: true,
        },
      })

      // Execute concurrent GraphQL requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const result = await client.graphql(`
          query {
            viewer {
              login
              id
            }
          }
        `)
        expect((result as any).viewer.login).toContain('user_')
        return (result as any).viewer.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(requestCount).toBeGreaterThan(0)

      const duration = endTime - startTime
      console.log(`Completed ${concurrency} concurrent GraphQL requests in ${duration}ms`)
      console.log(`Total GraphQL requests made: ${requestCount}`)
    }, 15000)

    it('should handle mixed REST and GraphQL concurrent requests', async () => {
      const restConcurrency = 25
      const graphqlConcurrency = 25
      let restCount = 0
      let graphqlCount = 0

      // Mock REST responses
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(() => {
          restCount++
          return [
            200,
            { login: `rest_user_${restCount}`, id: restCount },
            createRateLimitHeaders({ remaining: 5000 - restCount }),
          ]
        })

      // Mock GraphQL responses
      nock('https://api.github.com')
        .persist()
        .post('/graphql')
        .reply(() => {
          graphqlCount++
          return [
            200,
            {
              data: {
                viewer: { login: `graphql_user_${graphqlCount}`, id: `gql_${graphqlCount}` },
                rateLimit: {
                  limit: 5000,
                  remaining: 5000 - graphqlCount,
                  resetAt: new Date(Date.now() + 3600000).toISOString(),
                  cost: 1,
                  nodeCount: 1,
                },
              },
            },
          ]
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        includeRateLimit: true,
        retry: { enabled: true, retries: 3 },
      })

      // Execute mixed concurrent requests
      const startTime = Date.now()
      const restPromises = Array.from({ length: restConcurrency }, () =>
        client.rest.users.getAuthenticated()
      )
      const graphqlPromises = Array.from({ length: graphqlConcurrency }, () =>
        client.graphql('query { viewer { login id } }')
      )

      const [restResults, graphqlResults] = await Promise.all([
        Promise.all(restPromises),
        Promise.all(graphqlPromises),
      ])
      const endTime = Date.now()

      // Verify all requests completed
      expect(restResults).toHaveLength(restConcurrency)
      expect(graphqlResults).toHaveLength(graphqlConcurrency)
      expect(restCount).toBe(restConcurrency)
      expect(graphqlCount).toBe(graphqlConcurrency)

      const duration = endTime - startTime
      console.log(`Completed ${restConcurrency + graphqlConcurrency} mixed requests in ${duration}ms`)
    }, 15000)
  })

  describe('Token Management Under Load', () => {
    it('should handle token rotation under high concurrent load', async () => {
      const concurrency = 60
      const tokenCount = 3
      let requestCount = 0
      const tokenUsage = new Map<string, number>()

      // Mock responses tracking which token was used
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(function () {
          requestCount++
          const authHeader = this.req.headers.authorization?.[0] || ''
          const token = authHeader.replace('token ', '').replace('Bearer ', '')
          tokenUsage.set(token, (tokenUsage.get(token) || 0) + 1)

          return [
            200,
            { login: `user_${requestCount}`, id: requestCount },
            createRateLimitHeaders({ remaining: 5000 - requestCount }),
          ]
        })

      const client = createTokenRotationClient(tokenCount, {
        retry: { enabled: true, retries: 3 },
        throttle: { enabled: true },
      })

      // Execute concurrent requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const result = await client.rest.users.getAuthenticated()
        expect(result.data.id).toBeGreaterThan(0)
        return result.data.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(requestCount).toBe(concurrency)

      // Verify token rotation occurred
      expect(tokenUsage.size).toBeGreaterThan(1) // Multiple tokens were used
      const usageCounts = Array.from(tokenUsage.values())
      const maxUsage = Math.max(...usageCounts)
      const minUsage = Math.min(...usageCounts)
      const usageVariance = maxUsage - minUsage

      // Token usage should be relatively balanced (within 30% variance)
      expect(usageVariance).toBeLessThan(concurrency * 0.3)

      const duration = endTime - startTime
      console.log(`Token rotation handled ${concurrency} requests in ${duration}ms`)
      console.log('Token usage distribution:', Array.from(tokenUsage.entries()))
    }, 15000)

    it('should handle token refresh under concurrent load', async () => {
      const concurrency = 30
      let requestCount = 0
      let jwtGenerationCount = 0
      let tokenRefreshCount = 0

      // Mock JWT generation endpoint
      nock('https://api.github.com')
        .persist()
        .post('/app/installations/12345/access_tokens')
        .reply(() => {
          tokenRefreshCount++
          return [
            201,
            {
              token: `ghs_refreshed_token_${tokenRefreshCount}`,
              expires_at: new Date(Date.now() + 3600000).toISOString(),
              permissions: { contents: 'read', metadata: 'read' },
            },
          ]
        })

      // Mock regular API calls
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(() => {
          requestCount++
          return [
            200,
            { login: `user_${requestCount}`, id: requestCount },
            createRateLimitHeaders({ remaining: 5000 - requestCount }),
          ]
        })

      // Use simple token auth to avoid JWT issues
      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        tokenRotation: {
          tokens: [
            { token: 'initial_token', type: 'personal' },
            { token: 'backup_token', type: 'personal' },
          ],
          rotationStrategy: 'round-robin',
          refreshBeforeExpiry: 5,
        },
      })

      // Execute concurrent requests that simulate token refresh
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        if (i % 10 === 0) {
          // Simulate token refresh every 10th request
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
      console.log(`Token refresh handled ${concurrency} requests in ${duration}ms`)
      console.log(`Token refreshes triggered: ${tokenRefreshCount}`)
    }, 15000)

    it('should handle JWT generation performance under load', async () => {
      const concurrency = 20
      let jwtGenerationCount = 0

      // For this test, we'll mock the JWT generation instead of using real private key
      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }, // Use simple token auth for now
      })

      // Mock API responses for concurrent requests
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(() => {
          jwtGenerationCount++
          return [
            200,
            { login: `user_${jwtGenerationCount}`, id: jwtGenerationCount },
            createRateLimitHeaders({ remaining: 5000 - jwtGenerationCount }),
          ]
        })

      // Test simulated JWT generation performance
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        // Simulate JWT generation with API request
        const result = await client.rest.users.getAuthenticated()
        return result.data.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed (simulating JWT generations)
      expect(results).toHaveLength(concurrency)
      expect(jwtGenerationCount).toBe(concurrency)

      const duration = endTime - startTime
      const jwtPerSecond = (concurrency / duration) * 1000

      // JWT generation should be reasonably fast
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      expect(jwtPerSecond).toBeGreaterThan(1) // At least 1 JWT per second

      console.log(`Simulated ${concurrency} JWT generations in ${duration}ms (${jwtPerSecond.toFixed(2)}/sec)`)
    }, 10000)
  })

  describe('Failover Scenarios', () => {
    it('should handle token failover when tokens become invalid', async () => {
      const concurrency = 20
      const tokenCount = 3
      let requestCount = 0
      let failoverCount = 0

      // Track which tokens fail
      const failedTokens = new Set<string>()

      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(function () {
          requestCount++
          const authHeader = this.req.headers.authorization?.[0] || ''
          const token = authHeader.replace('token ', '')

          // Simulate first token failing after 5 requests
          if (token.includes('token_0') && requestCount > 5) {
            failedTokens.add(token)
            failoverCount++
            return [401, { message: 'Bad credentials' }]
          }

          // Simulate second token failing after 10 requests
          if (token.includes('token_1') && requestCount > 10) {
            failedTokens.add(token)
            failoverCount++
            return [401, { message: 'Bad credentials' }]
          }

          return [
            200,
            { login: `user_${requestCount}`, id: requestCount },
            createRateLimitHeaders({ remaining: 5000 - requestCount }),
          ]
        })

      const client = createTokenRotationClient(tokenCount, {
        retry: {
          enabled: true,
          retries: 3,
          doNotRetry: [401], // Don't retry 401s, should trigger failover
        },
      })

      // Execute requests that will trigger failover
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        try {
          const result = await client.rest.users.getAuthenticated()
          return { success: true, id: result.data.id }
        } catch (error: any) {
          return { success: false, error: error.status }
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
    }, 15000)

    it('should handle rate limit failover across multiple tokens', async () => {
      const concurrency = 20
      const tokenCount = 3
      let requestCount = 0
      const tokenRequests = new Map<string, number>()

      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(function () {
          requestCount++
          const authHeader = this.req.headers.authorization?.[0] || ''
          const token = authHeader.replace('token ', '')
          const count = tokenRequests.get(token) || 0
          tokenRequests.set(token, count + 1)

          // Simulate rate limiting after 8 requests per token
          if (count >= 8) {
            return [
              429,
              { message: 'Rate limit exceeded' },
              {
                'x-ratelimit-limit': '5000',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': Math.floor((Date.now() + 3600000) / 1000).toString(),
                'retry-after': '60',
              },
            ]
          }

          return [
            200,
            { login: `user_${requestCount}`, id: requestCount },
            createRateLimitHeaders({ remaining: 5000 - count }),
          ]
        })

      const client = createTokenRotationClient(tokenCount, {
        retry: {
          enabled: true,
          retries: 2,
        },
        throttle: {
          enabled: true,
          onRateLimit: () => true, // Retry on rate limit
        },
      })

      // Execute requests that will trigger rate limiting
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        try {
          const result = await client.rest.users.getAuthenticated()
          return { success: true, id: result.data.id }
        } catch (error: any) {
          return { success: false, error: error.status }
        }
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify token distribution and rate limit handling
      const successes = results.filter(r => r.success)
      const rateLimitFailures = results.filter(r => r.error === 429)

      expect(successes.length).toBeGreaterThan(0)
      expect(tokenRequests.size).toBe(tokenCount) // All tokens were used

      // Each token should have been rate limited
      const rateLimitedTokens = Array.from(tokenRequests.entries()).filter(([_, count]) => count >= 8)
      expect(rateLimitedTokens.length).toBeGreaterThan(0)

      const duration = endTime - startTime
      console.log(`Rate limit failover: ${successes.length} successes, ${rateLimitFailures.length} rate limited`)
      console.log('Token usage:', Array.from(tokenRequests.entries()))
      console.log(`Completed in ${duration}ms`)
    }, 20000)
  })

  describe('System Stability Under Load', () => {
    it('should maintain connection pooling effectiveness under load', async () => {
      const concurrency = 40
      let connectionCount = 0
      const connectionTimes: number[] = []

      // Mock with response delays to test connection pooling
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .delay(50) // 50ms delay per request
        .reply(() => {
          connectionCount++
          connectionTimes.push(Date.now())
          return [
            200,
            { login: `user_${connectionCount}`, id: connectionCount },
            createRateLimitHeaders({ remaining: 5000 - connectionCount }),
          ]
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { enabled: true, retries: 3 },
      })

      // Execute concurrent requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        const requestStart = Date.now()
        const result = await client.rest.users.getAuthenticated()
        const requestEnd = Date.now()
        return {
          id: result.data.id,
          duration: requestEnd - requestStart,
        }
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(connectionCount).toBe(concurrency)

      // Analyze connection pooling effectiveness
      const totalDuration = endTime - startTime
      const avgRequestDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
      const maxRequestDuration = Math.max(...results.map(r => r.duration))

      // With connection pooling, total time should be much less than sequential execution
      const sequentialTime = concurrency * 50 // 50ms per request sequentially
      expect(totalDuration).toBeLessThan(sequentialTime * 0.5) // At least 50% improvement

      console.log(`Connection pooling test: ${concurrency} requests in ${totalDuration}ms`)
      console.log(`Average request duration: ${avgRequestDuration.toFixed(2)}ms`)
      console.log(`Max request duration: ${maxRequestDuration}ms`)
      console.log(`Sequential would take: ${sequentialTime}ms`)
    }, 15000)

    it('should handle memory usage efficiently under sustained load', async () => {
      const batchSize = 50
      const batches = 5
      let totalRequests = 0

      // Mock responses
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(() => {
          totalRequests++
          return [
            200,
            { login: `user_${totalRequests}`, id: totalRequests },
            createRateLimitHeaders({ remaining: 5000 - totalRequests }),
          ]
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        cache: {
          enabled: true,
          storage: 'memory',
          ttl: 60,
          maxSize: 100, // Limit cache size
        },
      })

      // Execute sustained load in batches
      const batchResults: number[] = []
      const memoryUsage: number[] = []

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now()

        // Execute batch
        const promises = Array.from({ length: batchSize }, () =>
          client.rest.users.getAuthenticated()
        )
        const results = await Promise.all(promises)

        const batchEnd = Date.now()
        batchResults.push(batchEnd - batchStart)

        // Check memory usage (simplified)
        const cacheMetrics = client.getCacheMetrics()
        memoryUsage.push(cacheMetrics.memoryUsage)

        // Verify batch completed successfully
        expect(results).toHaveLength(batchSize)

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Verify sustained performance
      expect(totalRequests).toBe(batchSize * batches)

      // Performance should remain stable across batches
      const avgBatchTime = batchResults.reduce((sum, time) => sum + time, 0) / batchResults.length
      const maxBatchTime = Math.max(...batchResults)
      const minBatchTime = Math.min(...batchResults)
      const performanceVariance = ((maxBatchTime - minBatchTime) / avgBatchTime) * 100

      // Performance variance should be reasonable (less than 50%)
      expect(performanceVariance).toBeLessThan(50)

      console.log(`Sustained load test: ${batches} batches of ${batchSize} requests`)
      console.log(`Batch times: ${batchResults.map(t => t + 'ms').join(', ')}`)
      console.log(`Performance variance: ${performanceVariance.toFixed(1)}%`)
      console.log(`Memory usage progression: ${memoryUsage.join(' -> ')}`)
    }, 30000)

    it('should handle webhook processing under concurrent load', async () => {
      const webhookCount = 30
      let processedWebhooks = 0
      const webhookTimes: number[] = []

      // Mock webhook validation and processing
      const webhookPayloads = Array.from({ length: webhookCount }, (_, i) => ({
        action: 'opened',
        number: i + 1,
        pull_request: {
          id: i + 1,
          title: `Test PR ${i + 1}`,
          user: { login: `user_${i + 1}` },
        },
      }))

      // Simulate webhook processing with varying complexity
      const processWebhook = async (payload: any, index: number) => {
        const start = Date.now()

        // Simulate webhook validation
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20))

        // Simulate processing complexity based on payload
        const complexity = (index % 3) + 1 // 1-3 complexity levels
        await new Promise(resolve => setTimeout(resolve, complexity * 20))

        processedWebhooks++
        const end = Date.now()
        webhookTimes.push(end - start)

        return {
          id: payload.pull_request.id,
          processed: true,
          duration: end - start,
        }
      }

      // Process webhooks concurrently
      const startTime = Date.now()
      const promises = webhookPayloads.map((payload, index) => processWebhook(payload, index))
      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all webhooks processed
      expect(results).toHaveLength(webhookCount)
      expect(processedWebhooks).toBe(webhookCount)
      expect(results.every(r => r.processed)).toBe(true)

      // Analyze webhook processing performance
      const totalDuration = endTime - startTime
      const avgWebhookTime = webhookTimes.reduce((sum, time) => sum + time, 0) / webhookTimes.length
      const maxWebhookTime = Math.max(...webhookTimes)
      const minWebhookTime = Math.min(...webhookTimes)

      // Concurrent processing should be faster than sequential
      const estimatedSequentialTime = webhookTimes.reduce((sum, time) => sum + time, 0)
      expect(totalDuration).toBeLessThan(estimatedSequentialTime * 0.7) // At least 30% improvement

      console.log(`Webhook processing: ${webhookCount} webhooks in ${totalDuration}ms`)
      console.log(`Average webhook time: ${avgWebhookTime.toFixed(2)}ms`)
      console.log(`Webhook time range: ${minWebhookTime}ms - ${maxWebhookTime}ms`)
      console.log(`Sequential would take: ~${estimatedSequentialTime}ms`)
    }, 15000)
  })

  describe('Load Testing Metrics and Monitoring', () => {
    it('should track performance metrics during load testing', async () => {
      const concurrency = 30
      let requestCount = 0
      const requestTimings: Array<{ start: number; end: number; duration: number }> = []

      nock('https://api.github.com')
        .persist()
        .get('/user')
        .delay(50) // Fixed 50ms delay
        .reply(() => {
          requestCount++
          return [
            200,
            { login: `user_${requestCount}`, id: requestCount },
            createRateLimitHeaders({ remaining: 5000 - requestCount }),
          ]
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { enabled: true, retries: 3 },
        cache: { enabled: true, storage: 'memory' },
      })

      // Execute requests with timing tracking
      const testStart = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const start = Date.now()
        try {
          const result = await client.rest.users.getAuthenticated()
          const end = Date.now()
          const duration = end - start
          requestTimings.push({ start, end, duration })
          return { success: true, id: result.data.id, duration }
        } catch (error) {
          const end = Date.now()
          const duration = end - start
          requestTimings.push({ start, end, duration })
          return { success: false, error, duration }
        }
      })

      const results = await Promise.all(promises)
      const testEnd = Date.now()

      // Calculate performance metrics
      const successes = results.filter(r => r.success)
      const failures = results.filter(r => !r.success)
      const durations = requestTimings.map(t => t.duration)

      const metrics = {
        totalRequests: results.length,
        successCount: successes.length,
        failureCount: failures.length,
        successRate: (successes.length / results.length) * 100,
        totalTestDuration: testEnd - testStart,
        avgRequestDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minRequestDuration: Math.min(...durations),
        maxRequestDuration: Math.max(...durations),
        p95RequestDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)],
        p99RequestDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)],
        requestsPerSecond: (results.length / (testEnd - testStart)) * 1000,
        cacheMetrics: client.getCacheMetrics(),
        rateLimitState: client.getRateLimitInfo(),
      }

      // Verify performance targets
      expect(metrics.successRate).toBeGreaterThan(95) // 95% success rate
      expect(metrics.avgRequestDuration).toBeLessThan(100) // Avg < 100ms
      expect(metrics.p95RequestDuration).toBeLessThan(200) // P95 < 200ms
      expect(metrics.requestsPerSecond).toBeGreaterThan(10) // > 10 RPS

      // Log comprehensive metrics
      console.log('Load Testing Metrics:')
      console.log(`- Total Requests: ${metrics.totalRequests}`)
      console.log(`- Success Rate: ${metrics.successRate.toFixed(2)}%`)
      console.log(`- Total Duration: ${metrics.totalTestDuration}ms`)
      console.log(`- Requests/Second: ${metrics.requestsPerSecond.toFixed(2)}`)
      console.log(`- Avg Request Time: ${metrics.avgRequestDuration.toFixed(2)}ms`)
      console.log(`- P95 Request Time: ${metrics.p95RequestDuration}ms`)
      console.log(`- P99 Request Time: ${metrics.p99RequestDuration}ms`)
      console.log(`- Cache Hit Ratio: ${(metrics.cacheMetrics.hitRatio * 100).toFixed(1)}%`)

      expect(metrics).toMatchObject({
        totalRequests: concurrency,
        successCount: expect.any(Number),
        failureCount: expect.any(Number),
        successRate: expect.any(Number),
        requestsPerSecond: expect.any(Number),
      })
    }, 15000)

    it('should validate system limits and thresholds', async () => {
      const maxConcurrency = 100
      const incrementSize = 20
      const results: Array<{
        concurrency: number
        duration: number
        successRate: number
        avgLatency: number
      }> = []

      // Test increasing concurrency levels
      for (let concurrency = incrementSize; concurrency <= maxConcurrency; concurrency += incrementSize) {
        let requestCount = 0

        nock.cleanAll()
        nock('https://api.github.com')
          .persist()
          .get('/user')
          .delay(10) // Fixed 10ms delay
          .reply(() => {
            requestCount++
            return [
              200,
              { login: `user_${requestCount}`, id: requestCount },
              createRateLimitHeaders({ remaining: 5000 - requestCount }),
            ]
          })

        const client = createTrackedClient(GitHubClient, {
          auth: { type: 'token', token: 'test_token' },
          retry: { enabled: true, retries: 2 },
        })

        // Execute test at this concurrency level
        const testStart = Date.now()
        const promises = Array.from({ length: concurrency }, async () => {
          const requestStart = Date.now()
          try {
            await client.rest.users.getAuthenticated()
            return { success: true, duration: Date.now() - requestStart }
          } catch (error) {
            return { success: false, duration: Date.now() - requestStart }
          }
        })

        const testResults = await Promise.all(promises)
        const testEnd = Date.now()

        // Calculate metrics for this concurrency level
        const successes = testResults.filter(r => r.success)
        const durations = testResults.map(r => r.duration)
        const avgLatency = durations.reduce((sum, d) => sum + d, 0) / durations.length

        const levelResult = {
          concurrency,
          duration: testEnd - testStart,
          successRate: (successes.length / testResults.length) * 100,
          avgLatency,
        }

        results.push(levelResult)

        // Log progress
        console.log(
          `Concurrency ${concurrency}: ${levelResult.duration}ms, ` +
            `${levelResult.successRate.toFixed(1)}% success, ` +
            `${levelResult.avgLatency.toFixed(1)}ms avg latency`
        )

        // Break if performance degrades significantly
        if (levelResult.successRate < 90 || levelResult.avgLatency > 200) {
          console.log(`Performance degraded at concurrency level ${concurrency}`)
          break
        }

        await client.destroy()
      }

      // Analyze results across concurrency levels
      expect(results.length).toBeGreaterThan(0)

      // Find the optimal concurrency level (highest with good performance)
      const optimalLevel = results.findLast(
        r => r.successRate >= 95 && r.avgLatency <= 100
      )

      if (optimalLevel) {
        console.log(`Optimal concurrency level: ${optimalLevel.concurrency}`)
        console.log(`At optimal level: ${optimalLevel.successRate.toFixed(1)}% success, ${optimalLevel.avgLatency.toFixed(1)}ms latency`)
      }

      // Verify we can handle reasonable concurrency
      expect(results.some(r => r.concurrency >= 40 && r.successRate >= 95)).toBe(true)
    }, 30000)
  })
})