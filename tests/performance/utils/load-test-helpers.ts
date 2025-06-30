/**
 * Common utilities for load testing GitHub client
 * Shared across all performance test suites
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { GitHubClient, type GitHubClientConfig, type TokenInfo } from '../../../src/lib/github'
import { mswServer } from '../../github/msw-setup'
import { createRateLimitHeaders } from '../../github/test-helpers'

// Authentication validation for load test server (extracted from msw-setup.ts)
function isValidLoadTestToken(authHeader: string | null, expectedToken?: string): boolean {
  if (!authHeader) return false

  const token = authHeader.replace(/^(token|Bearer)\s+/i, '')

  // If expectedToken is provided, check exact match
  if (expectedToken) {
    return token === expectedToken
  }

  // Test tokens are valid
  if (token === 'test_token' || token === 'ghp_test_token') {
    return true
  }

  // Check for load test token patterns
  if (token.startsWith('test_token_') || token.startsWith('ghp_test_token_')) {
    return true
  }

  // Otherwise, check for valid token patterns
  return (
    token.startsWith('ghp_') ||
    token.startsWith('gho_') ||
    token.startsWith('ghs_') ||
    token.length >= 20
  )
}

// Create a simple tracked client for load testing
export function createTrackedClient(
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

// Create a dedicated MSW server for load testing to avoid conflicts
export const loadTestServer = setupServer()

// Helper function to add test-specific handlers without clearing others
export async function addTestHandlers(...handlers: Parameters<typeof loadTestServer.use>) {
  console.log(`Adding test handlers: ${handlers.length} handlers`)

  // Add handlers without clearing existing ones
  loadTestServer.use(...handlers)

  console.log('Test handlers added')
}

// Custom MSW setup for load testing with dedicated server that's isolated from global MSW
export function setupLoadTestMSW() {
  return {
    beforeAll: () => {
      console.log('Setting up isolated MSW server for performance tests')

      // IMPORTANT: Stop the global MSW server to prevent conflicts
      if (mswServer) {
        console.log('Stopping global MSW server for isolation')
        mswServer.close()
      }

      // Add essential authentication handlers for GitHub API endpoints
      loadTestServer.use(
        // Generic user endpoint with authentication
        http.get('https://api.github.com/user', ({ request }) => {
          const authHeader = request.headers.get('authorization')

          if (!isValidLoadTestToken(authHeader)) {
            return HttpResponse.json(
              {
                message: 'Bad credentials',
                documentation_url: 'https://docs.github.com/rest',
              },
              { status: 401 }
            )
          }

          return HttpResponse.json(
            {
              login: 'test-user',
              id: 12345,
              avatar_url: 'https://github.com/images/test-user.png',
              html_url: 'https://github.com/test-user',
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 4900 }),
            }
          )
        }),

        // Users by username endpoint
        http.get('https://api.github.com/users/:username', ({ request, params }) => {
          const authHeader = request.headers.get('authorization')

          if (!isValidLoadTestToken(authHeader)) {
            return HttpResponse.json(
              {
                message: 'Bad credentials',
                documentation_url: 'https://docs.github.com/rest',
              },
              { status: 401 }
            )
          }

          const { username } = params
          return HttpResponse.json(
            {
              login: username,
              id: 12345,
              avatar_url: `https://github.com/images/${username}.png`,
              html_url: `https://github.com/${username}`,
              type: 'User',
              site_admin: false,
            },
            {
              headers: createRateLimitHeaders({ remaining: 4890 }),
            }
          )
        }),

        // GraphQL endpoint with authentication
        http.post('https://api.github.com/graphql', async ({ request }) => {
          const authHeader = request.headers.get('authorization')

          if (!isValidLoadTestToken(authHeader)) {
            return HttpResponse.json(
              {
                message: 'Bad credentials',
                documentation_url: 'https://docs.github.com/rest',
              },
              { status: 401 }
            )
          }

          const body = await request.json()

          // Handle viewer queries
          if (
            body &&
            typeof body === 'object' &&
            'query' in body &&
            typeof body.query === 'string' &&
            body.query.includes('viewer')
          ) {
            return HttpResponse.json({
              data: {
                viewer: { login: 'test-user', id: 'gid_12345' },
                rateLimit: {
                  limit: 5000,
                  remaining: 4880,
                  resetAt: new Date(Date.now() + 3600000).toISOString(),
                  cost: 1,
                  nodeCount: 1,
                },
              },
            })
          }

          // Default GraphQL response
          return HttpResponse.json({
            data: {},
            errors: [{ message: 'Query not supported in test environment' }],
          })
        })
      )

      // Start our dedicated server with authentication handlers
      loadTestServer.listen({
        onUnhandledRequest: 'bypass', // Don't warn about unhandled requests in performance tests
      })
      console.log('Load test MSW server listening with authentication handlers')
    },
    afterAll: () => {
      console.log('Cleaning up isolated MSW server')
      loadTestServer.close()

      // Restart the global MSW server for other tests
      if (mswServer?.listen) {
        console.log('Restarting global MSW server after performance tests')
        mswServer.listen({ onUnhandledRequest: 'warn' })
      }
    },
  }
}

// Helper to create multiple clients with tracking
export const createMultipleClients = (count: number, config?: Partial<GitHubClientConfig>) => {
  return Array.from({ length: count }, (_, i) =>
    createTrackedClient(GitHubClient, {
      auth: { type: 'token', token: `test_token_${i}` },
      ...config,
    })
  )
}

// Helper to create token rotation client
export const createTokenRotationClient = (
  tokenCount: number,
  config?: Partial<GitHubClientConfig>
) => {
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

// Common performance metrics calculation
export interface PerformanceMetrics {
  totalRequests: number
  successCount: number
  failureCount: number
  successRate: number
  totalTestDuration: number
  avgRequestDuration: number
  minRequestDuration: number
  maxRequestDuration: number
  p95RequestDuration: number
  p99RequestDuration: number
  requestsPerSecond: number
}

export function calculatePerformanceMetrics(
  results: Array<{ success: boolean; duration: number }>,
  testDuration: number
): PerformanceMetrics {
  const successes = results.filter(r => r.success)
  const failures = results.filter(r => !r.success)
  const durations = results.map(r => r.duration)

  const sortedDurations = [...durations].sort((a, b) => a - b)

  return {
    totalRequests: results.length,
    successCount: successes.length,
    failureCount: failures.length,
    successRate: (successes.length / results.length) * 100,
    totalTestDuration: testDuration,
    avgRequestDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
    minRequestDuration: Math.min(...durations),
    maxRequestDuration: Math.max(...durations),
    p95RequestDuration: sortedDurations[Math.floor(sortedDurations.length * 0.95)],
    p99RequestDuration: sortedDurations[Math.floor(sortedDurations.length * 0.99)],
    requestsPerSecond: (results.length / testDuration) * 1000,
  }
}

// Standard MSW handlers for common scenarios
export const createStandardUserHandler = (testToken: string, baseRequestCount = 0) => {
  let requestCount = baseRequestCount

  return http.get('https://api.github.com/user', ({ request }) => {
    const authHeader = request.headers.get('authorization')

    // Validate authentication first
    if (!isValidLoadTestToken(authHeader, testToken)) {
      return HttpResponse.json(
        {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        },
        { status: 401 }
      )
    }

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
}

export const createStandardGraphQLHandler = (testToken: string, baseRequestCount = 0) => {
  let requestCount = baseRequestCount

  return http.post('https://api.github.com/graphql', async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    // Validate authentication first
    if (!isValidLoadTestToken(authHeader, testToken)) {
      return HttpResponse.json(
        {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Handle GraphQL requests
    if (
      body &&
      typeof body === 'object' &&
      'query' in body &&
      typeof body.query === 'string' &&
      body.query.includes('viewer')
    ) {
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
    }

    // Return error for unhandled GraphQL queries
    return HttpResponse.json(
      { errors: [{ message: 'Query not supported in test environment' }] },
      { status: 400 }
    )
  })
}

// Performance test utilities
export function measureExecutionTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now()
  return fn().then(result => ({
    result,
    duration: Date.now() - start,
  }))
}

export function logPerformanceMetrics(metrics: PerformanceMetrics) {
  console.log('Performance Metrics:')
  console.log(`- Total Requests: ${metrics.totalRequests}`)
  console.log(`- Success Rate: ${metrics.successRate.toFixed(2)}%`)
  console.log(`- Total Duration: ${metrics.totalTestDuration}ms`)
  console.log(`- Requests/Second: ${metrics.requestsPerSecond.toFixed(2)}`)
  console.log(`- Avg Request Time: ${metrics.avgRequestDuration.toFixed(2)}ms`)
  console.log(`- P95 Request Time: ${metrics.p95RequestDuration}ms`)
  console.log(`- P99 Request Time: ${metrics.p99RequestDuration}ms`)
}
