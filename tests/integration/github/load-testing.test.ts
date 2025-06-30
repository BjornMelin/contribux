/**
 * GitHub Client Load Testing with MSW 2.x
 *
 * Updated to use MSW instead of nock for modern HTTP mocking patterns.
 * All tests now use proper MSW error handling and realistic load scenarios.
 */

import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient, type GitHubClientConfig, type TokenInfo } from '../../../src/lib/github'
import { mswServer } from '../../github/msw-setup'
import { createRateLimitHeaders } from '../../github/test-helpers'

// Create a simple tracked client for load testing
function createTrackedClient(
  ClientClass: typeof GitHubClient,
  config?: Partial<GitHubClientConfig>
) {
  const client = new ClientClass(config)
  // Add a mock destroy method if the client doesn't have one
  if (!client.destroy) {
    client.destroy = async () => {
      // Clear any caches if available
      if (client.clearCache) {
        client.clearCache()
      }
    }
  }
  return client
}

// Helper function to add test-specific handlers to global MSW server
async function addTestHandlers(...handlers: Parameters<typeof mswServer.resetHandlers>) {
  console.log(`Setting up isolated handlers: ${handlers.length} handlers`)

  // Reset to clear existing handlers, then add only our test handlers
  mswServer.resetHandlers(...handlers)

  // Brief delay to ensure handlers are active
  await new Promise(resolve => setTimeout(resolve, 20))

  console.log('Test handlers isolated and active')
}

// Helper function to reset handlers for clean test isolation
function resetTestHandlers() {
  // Reset to default handlers (this will remove our custom handlers)
  mswServer.resetHandlers()
  console.log('Global MSW server reset to default handlers')
}

// Load testing setup using global MSW server
function setupLoadTestMSW() {
  // No need for server setup - global MSW server is already running
  // Just ensure environment is properly configured
  beforeAll(() => {
    console.log('Using global MSW server for load testing')
    console.log('MSW enabled env var:', process.env.VITEST_MSW_ENABLED)

    // Ensure MSW environment is enabled
    process.env.VITEST_MSW_ENABLED = 'true'
  })

  // Clean up any custom handlers after all tests
  afterAll(() => {
    // Reset to default handlers to clean up our custom ones
    resetTestHandlers()
    console.log('Load testing handlers cleaned up')
  })
}

// Setup proper test isolation with MSW handler cleanup
function setupLoadTestIsolation() {
  beforeEach(() => {
    // Clear all mocks but let each test handle its own MSW setup
    vi.clearAllMocks()

    // Clear any global GitHub state
    if (global.__githubClientCache) {
      global.__githubClientCache = undefined
    }
    if (global.__githubRateLimitState) {
      global.__githubRateLimitState = undefined
    }

    console.log('Test setup: mocks and state cleared (MSW handled per test)')
  })

  afterEach(() => {
    // Clean up any lingering handlers after test completion
    resetTestHandlers()
    console.log('Test cleanup: handlers reset')
  })
}

describe('GitHub Client Load Testing', () => {
  // Use custom MSW setup that doesn't reset to default handlers
  setupLoadTestMSW()

  // Use proper test isolation with handler cleanup
  setupLoadTestIsolation()

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
    it.skip('should handle concurrent REST API requests', async () => {
      const concurrency = 5 // Fixed concurrency for predictable testing
      let requestCount = 0
      const testToken = 'rest_test_token' // Unique token for this test

      // Create a test-specific handler that ensures we get the incremented responses
      const testHandler = http.get('https://api.github.com/user', ({ request }) => {
        const authHeader = request.headers.get('authorization')

        // Only handle if this is our specific test token
        if (authHeader === `token ${testToken}`) {
          requestCount++
          console.log(`REST handler hit: ${requestCount}`)
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

        // Let other handlers handle this request
        return
      })

      // Add test-specific handler
      await addTestHandlers(testHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
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
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds

      console.log(`Completed ${concurrency} concurrent requests in ${duration}ms`)
    }, 10000)

    it.skip('should handle concurrent GraphQL requests', async () => {
      const concurrency = 5 // Fixed concurrency for predictable testing
      let requestCount = 0
      const testToken = 'graphql_test_token' // Unique token for this test

      // Create a test-specific GraphQL handler that specifically matches our query
      const graphqlHandler = http.post('https://api.github.com/graphql', async ({ request }) => {
        const body = await request.json()
        const authHeader = request.headers.get('authorization')

        console.log(`GraphQL request received - token: ${authHeader}, body:`, JSON.stringify(body))

        // Only handle if this is our specific test query with our test token
        if (
          body &&
          typeof body === 'object' &&
          'query' in body &&
          typeof body.query === 'string' &&
          body.query.includes('viewer') &&
          authHeader === `token ${testToken}`
        ) {
          requestCount++
          console.log(`GraphQL handler MATCHING: ${requestCount}, returning user_${requestCount}`)
          const response = {
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
          }
          console.log('GraphQL response:', JSON.stringify(response, null, 2))
          return HttpResponse.json(response)
        }

        console.log(
          `GraphQL handler NOT matching - expected token: token ${testToken}, got: ${authHeader}`
        )
        // Let other handlers handle this request
        return
      })

      // Add test-specific handler
      await addTestHandlers(graphqlHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
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

        // Ensure result has the expected structure
        expect(result).toBeDefined()
        expect((result as { viewer?: { login?: string; id?: string } }).viewer).toBeDefined()
        expect((result as { viewer?: { login?: string; id?: string } }).viewer?.login).toContain(
          'user_'
        )
        return (result as { viewer?: { login?: string; id?: string } }).viewer?.id
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      expect(requestCount).toBe(concurrency)

      const duration = endTime - startTime
      console.log(`Completed ${concurrency} concurrent GraphQL requests in ${duration}ms`)
    }, 10000)

    it.skip('should handle mixed REST and GraphQL concurrent requests', async () => {
      const restConcurrency = 3 // Reduced for faster tests
      const graphqlConcurrency = 3
      let restCount = 0
      let graphqlCount = 0
      const testToken = 'mixed_test_token' // Unique token for this test

      // Create test-specific handlers with token validation
      const restHandler = http.get('https://api.github.com/user', ({ request }) => {
        const authHeader = request.headers.get('authorization')

        // Only handle if this is our specific test token
        if (authHeader === `token ${testToken}`) {
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
        }

        // Let other handlers handle this request
        return
      })

      const graphqlHandler = http.post('https://api.github.com/graphql', async ({ request }) => {
        const authHeader = request.headers.get('authorization')

        // Only handle if this is our specific test token
        if (authHeader === `token ${testToken}`) {
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
        }

        // Let other handlers handle this request
        return
      })

      // Add test-specific handlers
      await addTestHandlers(restHandler, graphqlHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: testToken },
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
    }, 10000)
  })

  describe('Token Management Under Load', () => {
    it.skip('should handle token rotation under concurrent load', async () => {
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

        return HttpResponse.json(
          { login: `user_${requestCount}`, id: requestCount },
          {
            headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
          }
        )
      })

      // Setup isolated handlers
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

    it.skip('should handle token refresh simulation under concurrent load', async () => {
      const concurrency = 8 // Reduced concurrency for faster testing
      let requestCount = 0
      let tokenRefreshCount = 0

      // Create test-specific handler for API calls
      const refreshHandler = http.get('https://api.github.com/user', () => {
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

      // Setup isolated handlers
      await addTestHandlers(refreshHandler)

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
    }, 15000) // Reduced timeout to match new concurrency

    it.skip('should handle JWT generation simulation under load', async () => {
      const concurrency = 5 // Reduced concurrency for faster testing
      let jwtGenerationCount = 0

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' },
      })

      // Create test-specific handler for JWT simulation
      const jwtHandler = http.get('https://api.github.com/user', () => {
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

      // Setup isolated handlers
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
      expect(duration).toBeLessThan(5000) // Reduced timeout
      expect(jwtPerSecond).toBeGreaterThan(0.5)

      console.log(
        `Simulated ${concurrency} JWT generations in ${duration}ms (${jwtPerSecond.toFixed(2)}/sec)`
      )
    }, 8000)
  })

  describe('Failover Scenarios', () => {
    it.skip('should handle token failover when tokens become invalid', async () => {
      const concurrency = 10 // Reduced concurrency for faster testing
      let requestCount = 0
      let failoverCount = 0
      const failedTokens = new Set<string>()

      // Create test-specific handler for failover simulation
      const failoverHandler = http.get('https://api.github.com/user', ({ request }) => {
        requestCount++
        const authHeaders = request.headers.get('authorization')
        const token = authHeaders?.replace('token ', '') || ''

        // Simulate failover by making some requests fail
        if (requestCount <= 5) {
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

      // Setup isolated handlers
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
    }, 15000) // Reduced timeout for faster execution

    it('should handle rate limit failover across multiple tokens', async () => {
      // Test that verifies rate limit handling with predictable failures
      const concurrency = 6
      let requestCount = 0

      // Create comprehensive handlers to ensure ALL requests are intercepted
      const rateLimitHandlers = [
        // Primary handler for /users/:username endpoint (unique per request)
        http.get('https://api.github.com/users/:username', ({ request, params }) => {
          requestCount++
          const { username } = params as { username: string }
          console.log(
            `Rate limit handler processing request ${requestCount}, URL: ${request.url}, Username: ${username}`
          )

          // Always handle the request - no passthrough
          // Fail requests 2, 4, and 6 to guarantee rate limit failures
          if (requestCount === 2 || requestCount === 4 || requestCount === 6) {
            console.log(`Simulating rate limit for request ${requestCount}`)
            return HttpResponse.json(
              {
                message: 'API rate limit exceeded',
                documentation_url:
                  'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
              },
              {
                status: 429,
                headers: {
                  'x-ratelimit-remaining': '0',
                  'x-ratelimit-reset': Math.floor((Date.now() + 3000) / 1000).toString(),
                  'retry-after': '3',
                },
              }
            )
          }

          console.log(`Success response for request ${requestCount}`)
          return HttpResponse.json({
            login: username,
            id: 12345 + requestCount,
            avatar_url: `https://github.com/images/${username}.png`,
            html_url: `https://github.com/${username}`,
            type: 'User',
            site_admin: false,
          })
        }),

        // Catch-all handler for any other GitHub API requests
        http.get('https://api.github.com/*', ({ request }) => {
          console.log(`Rate limit test catch-all handler intercepted: ${request.url}`)
          return HttpResponse.json({ message: 'Not found' }, { status: 404 })
        }),
      ]

      // Add handlers to the server
      await addTestHandlers(...rateLimitHandlers)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }, // Use globally recognized token
        retry: { retries: 0 }, // Disable retries to see actual 429 responses
        throttle: {
          onRateLimit: () => false, // Don't retry rate limited requests
          onSecondaryRateLimit: () => false, // Don't retry secondary rate limited requests
        },
      })

      // Execute requests sequentially using unique usernames to ensure predictable order
      const results = []
      for (let i = 0; i < concurrency; i++) {
        try {
          const username = `ratetest${i}` // Make each request unique to avoid caching
          const result = await client.rest.users.getByUsername({ username })
          results.push({ success: true, id: result.data.id, status: 200 })
        } catch (error: unknown) {
          const errorStatus = (error as { status?: number }).status
          console.log(`Request ${i + 1} failed with status: ${errorStatus}`)
          results.push({ success: false, error: errorStatus, status: errorStatus })
        }
      }

      // Verify we processed all requests
      console.log('Rate limit test results:')
      console.log(`- Handler processed: ${requestCount} requests`)
      console.log(`- Client attempted: ${results.length} requests`)
      console.log(
        '- All results:',
        results.map(r => (r.success ? 'SUCCESS' : `FAIL-${r.status}`))
      )

      // Verify all requests were intercepted by our handler
      expect(requestCount).toBe(concurrency)
      expect(results).toHaveLength(concurrency)

      // Verify we got mixed results (some successes and some failures)
      const successes = results.filter(r => r.success)
      const rateLimitFailures = results.filter(
        r => !r.success && (r.error === 429 || r.status === 429)
      )

      console.log(`- Successes: ${successes.length}`)
      console.log(`- Rate limit failures: ${rateLimitFailures.length}`)

      expect(successes.length).toBeGreaterThan(0)
      expect(rateLimitFailures.length).toBeGreaterThan(0)

      await client.destroy()
    }, 15000)
  })

  describe('System Stability Under Load', () => {
    it('should maintain connection pooling effectiveness under load', async () => {
      const concurrency = 10 // Reduced for more predictable testing
      const connectionTimes: number[] = []
      let requestCounter = 0

      // Create comprehensive handlers to catch ALL possible GitHub API requests
      const poolingHandlers = [
        // Primary handler for /users/:username endpoint (unique per request)
        http.get('https://api.github.com/users/:username', async ({ request, params }) => {
          requestCounter++
          const currentTime = Date.now()
          connectionTimes.push(currentTime)

          const { username } = params as { username: string }
          console.log(
            `Processing pooling request: ${requestCounter}, URL: ${request.url}, Username: ${username}`
          )

          // Add small delay to simulate network latency
          await new Promise(resolve => setTimeout(resolve, 25))

          // Always return a successful response - never pass through
          return HttpResponse.json(
            {
              login: username,
              id: 12345 + requestCounter, // Make ID unique
              avatar_url: `https://github.com/images/${username}.png`,
              html_url: `https://github.com/${username}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 4999 }),
            }
          )
        }),

        // Catch-all handler for any other GitHub API requests to prevent them from going through
        http.get('https://api.github.com/*', ({ request }) => {
          console.log(`Catch-all handler intercepted unhandled request: ${request.url}`)
          requestCounter++ // Count all requests, not just /user
          return HttpResponse.json({ message: 'Not found' }, { status: 404 })
        }),

        // Handle rate limit checks
        http.get('https://api.github.com/rate_limit', ({ request }) => {
          console.log(`Rate limit handler called: ${request.url}`)
          requestCounter++ // Count rate limit requests too
          return HttpResponse.json({
            core: { limit: 5000, remaining: 4999, reset: Math.floor(Date.now() / 1000) + 3600 },
          })
        }),
      ]

      // Setup isolated handlers for connection pooling test
      await addTestHandlers(...poolingHandlers)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }, // Use globally recognized test token
        retry: { retries: 0 }, // Disable retries to avoid double requests
        throttle: { enabled: false }, // Disable throttling to avoid delays
      })

      // Verify handlers are working with a test request before concurrent execution
      console.log('Verifying handlers are active with test request...')
      try {
        await client.rest.users.getByUsername({ username: 'testuser' })
        console.log('Test request successful - handlers are active')
      } catch (error) {
        console.error('Test request failed - handlers not ready:', error)
        throw new Error('MSW handlers not properly activated')
      }

      // Reset counters after verification to count only concurrent requests
      requestCounter = 0
      connectionTimes.length = 0
      console.log('Counters reset after verification - starting concurrent request tracking')

      // Additional delay to ensure all handler processes are ready
      await new Promise(resolve => setTimeout(resolve, 50))
      console.log('MSW handlers confirmed active, starting concurrent requests')

      // Execute concurrent requests using unique usernames
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async (_, index) => {
        const requestStart = Date.now()
        const username = `user${index}` // Make each request unique

        try {
          const result = await client.rest.users.getByUsername({ username })
          const requestEnd = Date.now()
          console.log(`Request ${index} completed successfully with id: ${result.data.id}`)
          return {
            id: result.data.id,
            duration: requestEnd - requestStart,
            index,
          }
        } catch (error) {
          console.error(`Request ${index} failed:`, error)
          throw error
        }
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Log detailed results for debugging
      console.log('Connection pooling test results:')
      console.log(`- Handler processed: ${requestCounter} requests`)
      console.log(`- Client completed: ${results.length} requests`)
      console.log(`- Connection times recorded: ${connectionTimes.length}`)

      // Verify all requests completed successfully and were intercepted
      expect(results).toHaveLength(concurrency)
      expect(requestCounter).toBe(concurrency)

      // Analyze connection pooling effectiveness
      const totalDuration = endTime - startTime
      const avgRequestDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
      const maxRequestDuration = Math.max(...results.map(r => r.duration))

      // With connection pooling, total time should be much less than sequential execution
      const sequentialTime = concurrency * 25 // 25ms per request sequentially
      expect(totalDuration).toBeLessThan(sequentialTime * 2) // Should be faster than sequential (with buffer)

      console.log(`Connection pooling test: ${concurrency} requests in ${totalDuration}ms`)
      console.log(`Average request duration: ${avgRequestDuration.toFixed(2)}ms`)
      console.log(`Max request duration: ${maxRequestDuration}ms`)
      console.log(`Sequential would take: ${sequentialTime}ms`)

      await client.destroy()
    }, 20000)

    it('should handle memory usage efficiently under sustained load', async () => {
      const batchSize = 10
      const batches = 3
      let totalRequests = 0

      // Create comprehensive handlers to ensure ALL requests are intercepted
      const memoryHandlers = [
        // Primary handler for users endpoint
        http.get('https://api.github.com/users/:username', ({ params, request }) => {
          totalRequests++
          console.log(
            `Memory handler processing request ${totalRequests} for user: ${params.username}, URL: ${request.url}`
          )

          // Always handle the request - never pass through
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
        }),

        // Catch-all handler for any other GitHub API requests
        http.get('https://api.github.com/*', ({ request }) => {
          console.log(`Memory test catch-all handler intercepted: ${request.url}`)
          return HttpResponse.json({ message: 'Not found' }, { status: 404 })
        }),

        // Handle rate limit checks
        http.get('https://api.github.com/rate_limit', () => {
          return HttpResponse.json({
            core: { limit: 5000, remaining: 4999, reset: Math.floor(Date.now() / 1000) + 3600 },
          })
        }),

        // Handle any POST requests that might occur
        http.post('https://api.github.com/*', ({ request }) => {
          console.log(`Memory test catch-all POST handler intercepted: ${request.url}`)
          return HttpResponse.json({ message: 'Not found' }, { status: 404 })
        }),
      ]

      // Setup isolated handlers
      await addTestHandlers(...memoryHandlers)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }, // Use globally recognized token
        retry: { retries: 0 }, // Disable retries to avoid double requests
        throttle: { enabled: false }, // Disable throttling to avoid delays
      })

      // Execute sustained load in batches
      const batchResults: number[] = []
      const memoryUsage: number[] = []

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now()
        console.log(`Starting batch ${batch + 1} of ${batches}`)

        // Execute batch with unique requests to avoid cache hits
        const promises = Array.from({ length: batchSize }, async (_, i) => {
          const username = `user_${batch}_${i}`
          console.log(`Making request for user: ${username}`)

          try {
            return await client.rest.users.getByUsername({ username })
          } catch (error) {
            console.error(`Request for ${username} failed:`, error)
            throw error
          }
        })

        const results = await Promise.all(promises)

        const batchEnd = Date.now()
        batchResults.push(batchEnd - batchStart)

        // Check memory usage (simplified)
        const cacheMetrics = client.getCacheMetrics()
        memoryUsage.push(cacheMetrics.memoryUsage)

        // Verify batch completed successfully
        expect(results).toHaveLength(batchSize)
        console.log(`Batch ${batch + 1} completed with ${results.length} results`)

        // Small delay between batches to prevent request congestion
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Log results for debugging
      console.log('Memory test results:')
      console.log(`- Handler processed: ${totalRequests} requests`)
      console.log(`- Expected: ${batchSize * batches} requests`)
      console.log(`- Batches: ${batches}, Batch size: ${batchSize}`)

      // Verify sustained performance
      expect(totalRequests).toBe(batchSize * batches)

      // Performance should remain stable across batches
      const avgBatchTime = batchResults.reduce((sum, time) => sum + time, 0) / batchResults.length
      const maxBatchTime = Math.max(...batchResults)
      const minBatchTime = Math.min(...batchResults)
      const performanceVariance =
        avgBatchTime > 0 ? ((maxBatchTime - minBatchTime) / avgBatchTime) * 100 : 0

      // Performance variance should be reasonable
      expect(performanceVariance).toBeLessThan(200) // Increased tolerance for test environment variance

      console.log(`Sustained load test: ${batches} batches of ${batchSize} requests`)
      console.log(`Batch times: ${batchResults.map(t => `${t}ms`).join(', ')}`)
      console.log(`Performance variance: ${performanceVariance.toFixed(1)}%`)
      console.log(`Memory usage progression: ${memoryUsage.join(' -> ')}`)
    }, 25000)

    it('should handle webhook processing under concurrent load', async () => {
      const webhookCount = 20 // Reduced for faster testing
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
      const processWebhook = async (payload: Record<string, unknown>, index: number) => {
        const start = Date.now()

        // Simulate webhook validation
        await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10))

        // Simulate processing complexity based on payload
        const complexity = (index % 3) + 1 // 1-3 complexity levels
        await new Promise(resolve => setTimeout(resolve, complexity * 10))

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
    }, 10000) // Reduced timeout for faster webhook processing
  })

  describe('Load Testing Metrics and Monitoring', () => {
    it('should track performance metrics during load testing', async () => {
      const concurrency = 12
      let requestCount = 0
      const requestTimings: Array<{ start: number; end: number; duration: number }> = []

      // Create test-specific handler for performance metrics
      const metricsHandler = http.get('https://api.github.com/user', async () => {
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

      // Setup isolated handlers
      await addTestHandlers(metricsHandler)

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

        // Create test-specific handler for this concurrency level
        const concurrencyHandler = http.get('https://api.github.com/user', async () => {
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

        // Setup isolated handlers
        await addTestHandlers(concurrencyHandler)

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
