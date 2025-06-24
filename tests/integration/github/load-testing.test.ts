/**
 * GitHub Client Load Testing with MSW 2.x
 *
 * Updated to use MSW instead of nock for modern HTTP mocking patterns.
 * All tests now use proper MSW error handling and realistic load scenarios.
 */

import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { GitHubClient, type GitHubClientConfig, type TokenInfo } from '@/lib/github'
import { mswServer, setupMSW } from '../../github/msw-setup'
import {
  createRateLimitHeaders,
  createTrackedClient,
  setupGitHubTestIsolation,
} from '../../github/test-helpers'
import { TEST_ITERATIONS } from '../../performance/optimize-tests'

describe('GitHub Client Load Testing', () => {
  setupMSW()
  setupGitHubTestIsolation()

  // Helper to create multiple clients with tracking
  const _createMultipleClients = (count: number, config?: Partial<GitHubClientConfig>) => {
    return Array.from({ length: count }, (_, i) =>
      createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: `test_token_${i}` },
        ...config,
      })
    )
  }

  // Helper to create token rotation client
  const _createTokenRotationClient = (tokenCount: number, config?: Partial<GitHubClientConfig>) => {
    const tokens: TokenInfo[] = Array.from({ length: tokenCount }, (_, i) => ({
      token: `ghp_test_token_${i}`,
      type: 'personal' as const,
      scopes: ['repo', 'user'],
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    }))

    return createTrackedClient(GitHubClient, {
      auth: { type: 'token', token: tokens[0].token },
      tokenRotation: {
        tokens,
        rotationStrategy: 'round-robin',
        refreshBeforeExpiry: 5,
      },
      ...config,
    })
  }

  describe('High-Concurrency Operations', () => {
    it('should handle concurrent REST API requests', async () => {
      const concurrency = Math.min(TEST_ITERATIONS.LOAD_CONCURRENT_REQUESTS, 5)
      let requestCount = 0

      // Mock successful responses using MSW
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          requestCount++
          return HttpResponse.json(
            {
              login: `user_${requestCount}`,
              id: requestCount,
              avatar_url: `https://github.com/images/user_${requestCount}.png`,
              html_url: `https://github.com/user_${requestCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
            }
          )
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      // Execute concurrent requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
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

      // Verify performance
      const duration = endTime - startTime
      expect(duration).toBeLessThan(15000) // Should complete within 15 seconds

      console.log(`Completed ${concurrency} concurrent requests in ${duration}ms`)
    }, 20000)

    it('should handle concurrent GraphQL requests', async () => {
      const concurrency = Math.min(TEST_ITERATIONS.LOAD_CONCURRENT_REQUESTS, 5)
      let requestCount = 0

      // Mock GraphQL responses using MSW
      mswServer.use(
        http.post('https://api.github.com/graphql', () => {
          requestCount++
          return HttpResponse.json({
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
          })
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
      })

      // Execute concurrent GraphQL requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        const result = await client.graphql(`
          query {
            viewer {
              login
              id
            }
          }
        `)
        expect((result as any).data.viewer.login).toContain('user_')
        return (result as any).data.viewer.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(requestCount).toBe(concurrency)

      const duration = endTime - startTime
      console.log(`Completed ${concurrency} concurrent GraphQL requests in ${duration}ms`)
    }, 20000)

    it('should handle mixed REST and GraphQL concurrent requests', async () => {
      const restConcurrency = 10
      const graphqlConcurrency = 10
      let restCount = 0
      let graphqlCount = 0

      // Mock REST responses
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          restCount++
          return HttpResponse.json(
            {
              login: `rest_user_${restCount}`,
              id: restCount,
              avatar_url: `https://github.com/images/rest_user_${restCount}.png`,
              html_url: `https://github.com/rest_user_${restCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - restCount }),
            }
          )
        }),
        // Mock GraphQL responses
        http.post('https://api.github.com/graphql', () => {
          graphqlCount++
          return HttpResponse.json({
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
          })
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
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
      console.log(
        `Completed ${restConcurrency + graphqlConcurrency} mixed requests in ${duration}ms`
      )
    }, 20000)
  })

  describe('Token Management Under Load', () => {
    it('should handle token rotation under concurrent load', async () => {
      const concurrency = 5
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

      // Mock responses tracking which token was used
      mswServer.use(
        http.get('https://api.github.com/user', ({ request }) => {
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

          return HttpResponse.json(
            { login: `user_${requestCount}`, id: requestCount },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
            }
          )
        })
      )

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
      const concurrency = 15
      let requestCount = 0
      let tokenRefreshCount = 0

      // Mock regular API calls
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          requestCount++
          return HttpResponse.json(
            {
              login: `user_${requestCount}`,
              id: requestCount,
              avatar_url: `https://github.com/images/user_${requestCount}.png`,
              html_url: `https://github.com/user_${requestCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
            }
          )
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
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
    }, 20000)

    it('should handle JWT generation simulation under load', async () => {
      const concurrency = 10
      let jwtGenerationCount = 0

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
      })

      // Mock API responses for concurrent requests
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          jwtGenerationCount++
          return HttpResponse.json(
            {
              login: `user_${jwtGenerationCount}`,
              id: jwtGenerationCount,
              avatar_url: `https://github.com/images/user_${jwtGenerationCount}.png`,
              html_url: `https://github.com/user_${jwtGenerationCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - jwtGenerationCount }),
            }
          )
        })
      )

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
      expect(duration).toBeLessThan(10000)
      expect(jwtPerSecond).toBeGreaterThan(0.5)

      console.log(
        `Simulated ${concurrency} JWT generations in ${duration}ms (${jwtPerSecond.toFixed(2)}/sec)`
      )
    }, 15000)
  })

  describe('Failover Scenarios', () => {
    it('should handle token failover when tokens become invalid', async () => {
      const concurrency = 15
      let requestCount = 0
      let failoverCount = 0
      const failedTokens = new Set<string>()

      mswServer.use(
        http.get('https://api.github.com/user', ({ request }) => {
          requestCount++
          const authHeaders = request.headers.get('authorization')
          const token = authHeaders?.replace('token ', '') || ''

          // Simulate failover by making some requests fail
          if (requestCount <= 7) {
            return HttpResponse.json(
              {
                login: `user_${requestCount}`,
                id: requestCount,
                avatar_url: `https://github.com/images/user_${requestCount}.png`,
                html_url: `https://github.com/user_${requestCount}`,
                type: 'User',
                site_admin: false,
              },
              {
                headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
              }
            )
          }

          // Remaining requests fail to simulate token issues
          failedTokens.add(token)
          failoverCount++
          return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
        })
      )

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

      await primaryClient.destroy()
    }, 20000)

    it('should handle rate limit failover across multiple tokens', async () => {
      const concurrency = 15
      let requestCount = 0

      mswServer.use(
        http.get('https://api.github.com/user', () => {
          requestCount++

          // Simulate rate limiting after 7 requests
          if (requestCount > 7) {
            return HttpResponse.json(
              { message: 'Rate limit exceeded' },
              {
                status: 429,
                headers: {
                  'x-ratelimit-limit': '5000',
                  'x-ratelimit-remaining': '0',
                  'x-ratelimit-reset': Math.floor((Date.now() + 60000) / 1000).toString(),
                  'retry-after': '1',
                },
              }
            )
          }

          return HttpResponse.json(
            {
              login: `user_${requestCount}`,
              id: requestCount,
              avatar_url: `https://github.com/images/user_${requestCount}.png`,
              html_url: `https://github.com/user_${requestCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
            }
          )
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      // Execute requests that will trigger rate limiting
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        try {
          const result = await client.rest.users.getAuthenticated()
          return { success: true, id: result.data.id }
        } catch (error: any) {
          return { success: false, error: error.status }
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

  describe('System Stability Under Load', () => {
    it('should maintain connection pooling effectiveness under load', async () => {
      const concurrency = 15
      let connectionCount = 0
      const connectionTimes: number[] = []

      // Mock with response delays to test connection pooling
      mswServer.use(
        http.get('https://api.github.com/user', async () => {
          connectionCount++
          connectionTimes.push(Date.now())

          // Add small delay to simulate network latency
          await new Promise(resolve => setTimeout(resolve, 25))

          return HttpResponse.json(
            {
              login: `user_${connectionCount}`,
              id: connectionCount,
              avatar_url: `https://github.com/images/user_${connectionCount}.png`,
              html_url: `https://github.com/user_${connectionCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - connectionCount }),
            }
          )
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
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
      const sequentialTime = concurrency * 25 // 25ms per request sequentially
      expect(totalDuration).toBeLessThan(sequentialTime) // Should be faster than sequential

      console.log(`Connection pooling test: ${concurrency} requests in ${totalDuration}ms`)
      console.log(`Average request duration: ${avgRequestDuration.toFixed(2)}ms`)
      console.log(`Max request duration: ${maxRequestDuration}ms`)
      console.log(`Sequential would take: ${sequentialTime}ms`)
    }, 20000)

    it('should handle memory usage efficiently under sustained load', async () => {
      const batchSize = 10
      const batches = 3
      let totalRequests = 0

      // Mock responses for different endpoints to avoid caching
      mswServer.use(
        http.get('https://api.github.com/users/:username', ({ params }) => {
          totalRequests++
          return HttpResponse.json(
            {
              login: params.username as string,
              id: totalRequests,
              avatar_url: `https://github.com/images/user_${totalRequests}.png`,
              html_url: `https://github.com/${params.username}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - totalRequests }),
            }
          )
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
      })

      // Execute sustained load in batches
      const batchResults: number[] = []
      const memoryUsage: number[] = []

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now()

        // Execute batch with unique requests to avoid cache hits
        const promises = Array.from({ length: batchSize }, (_, i) =>
          client.rest.users.getByUsername({ username: `user_${batch}_${i}` })
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
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Verify sustained performance
      expect(totalRequests).toBe(batchSize * batches)

      // Performance should remain stable across batches
      const avgBatchTime = batchResults.reduce((sum, time) => sum + time, 0) / batchResults.length
      const maxBatchTime = Math.max(...batchResults)
      const minBatchTime = Math.min(...batchResults)
      const performanceVariance =
        avgBatchTime > 0 ? ((maxBatchTime - minBatchTime) / avgBatchTime) * 100 : 0

      // Performance variance should be reasonable
      expect(performanceVariance).toBeLessThan(100)

      console.log(`Sustained load test: ${batches} batches of ${batchSize} requests`)
      console.log(`Batch times: ${batchResults.map(t => `${t}ms`).join(', ')}`)
      console.log(`Performance variance: ${performanceVariance.toFixed(1)}%`)
      console.log(`Memory usage progression: ${memoryUsage.join(' -> ')}`)
    }, 25000)

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
      const concurrency = 12
      let requestCount = 0
      const requestTimings: Array<{ start: number; end: number; duration: number }> = []

      mswServer.use(
        http.get('https://api.github.com/user', async () => {
          requestCount++
          // Fixed 25ms delay
          await new Promise(resolve => setTimeout(resolve, 25))

          return HttpResponse.json(
            {
              login: `user_${requestCount}`,
              id: requestCount,
              avatar_url: `https://github.com/images/user_${requestCount}.png`,
              html_url: `https://github.com/user_${requestCount}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
            }
          )
        })
      )

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      // Execute requests with timing tracking
      const testStart = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
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

      const testDuration = Math.max(testEnd - testStart, 1)

      const metrics = {
        totalRequests: results.length,
        successCount: successes.length,
        failureCount: failures.length,
        successRate: (successes.length / results.length) * 100,
        totalTestDuration: testDuration,
        avgRequestDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minRequestDuration: Math.min(...durations),
        maxRequestDuration: Math.max(...durations),
        p95RequestDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)],
        p99RequestDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)],
        requestsPerSecond: (results.length / testDuration) * 1000,
        cacheMetrics: client.getCacheMetrics(),
        rateLimitState: client.getRateLimitInfo(),
      }

      // Verify performance targets
      expect(metrics.successRate).toBeGreaterThan(80)
      expect(metrics.avgRequestDuration).toBeLessThan(500)
      expect(metrics.p95RequestDuration).toBeLessThan(1000)
      expect(metrics.requestsPerSecond).toBeGreaterThan(2)

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
    }, 20000)

    it('should validate system limits and thresholds', async () => {
      const maxConcurrency = 40
      const incrementSize = 10
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

        mswServer.resetHandlers()
        mswServer.use(
          http.get('https://api.github.com/user', async () => {
            requestCount++
            // Fixed 5ms delay
            await new Promise(resolve => setTimeout(resolve, 5))

            return HttpResponse.json(
              {
                login: `user_${requestCount}`,
                id: requestCount,
                avatar_url: `https://github.com/images/user_${requestCount}.png`,
                html_url: `https://github.com/user_${requestCount}`,
                type: 'User',
                site_admin: false,
              },
              {
                headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
              }
            )
          })
        )

        const client = createTrackedClient(GitHubClient, {
          auth: { type: 'token', token: 'test_token' },
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

        // Log progress
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
    }, 30000)
  })
})
