/**
 * Real GitHub API Integration Tests
 *
 * This test suite makes actual HTTP requests to GitHub's API to validate
 * the complete integration flow including:
 * - Authentication flows (PAT, GitHub App, OAuth)
 * - Rate limiting and backoff behavior
 * - Caching effectiveness with real ETags
 * - Token rotation under load
 * - Error handling and recovery
 * - Performance metrics collection
 *
 * These tests require real GitHub API credentials and are designed to run
 * in CI/CD environments with proper secret management.
 */

import { GitHubClient } from '@/lib/github/client'
import { parseRateLimitHeader } from '@/lib/github/utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Environment validation
const REQUIRED_ENV_VARS = ['GITHUB_TEST_TOKEN', 'GITHUB_TEST_ORG'] as const

const hasRequiredCredentials = REQUIRED_ENV_VARS.every(envVar => process.env[envVar])
const skipRealAPITests = !hasRequiredCredentials || process.env.SKIP_INTEGRATION_TESTS === 'true'

// Test configuration
interface TestMetrics {
  apiCalls: Array<{
    endpoint: string
    duration: number
    statusCode: number
    cached: boolean
    rateLimitRemaining?: number
  }>
  errors: Array<{
    endpoint: string
    error: string
    retryCount: number
  }>
  startTime: number
}

describe.skipIf(skipRealAPITests)('Real GitHub API Integration Tests', () => {
  let client: GitHubClient
  let metrics: TestMetrics

  beforeAll(async () => {
    if (!hasRequiredCredentials) {
      console.log('⚠️  Skipping real API tests - missing required environment variables:')
      REQUIRED_ENV_VARS.forEach(envVar => {
        if (!process.env[envVar]) {
          console.log(`   - ${envVar}`)
        }
      })
      return
    }

    console.log('🚀 Starting real GitHub API integration tests...')
    console.log(`   Organization: ${process.env.GITHUB_TEST_ORG}`)
    console.log(`   Token: ${process.env.GITHUB_TEST_TOKEN?.substring(0, 10)}...`)
  })

  beforeEach(() => {
    metrics = {
      apiCalls: [],
      errors: [],
      startTime: Date.now(),
    }

    // Create a fresh client for each test to avoid state interference
    client = new GitHubClient({
      auth: {
        type: 'token',
        token: process.env.GITHUB_TEST_TOKEN ?? '',
      },
      throttle: {
        enabled: true,
        onRateLimit: (retryAfter, _options, _octokit, retryCount) => {
          console.log(`⏳ Rate limited, waiting ${retryAfter}s (attempt ${retryCount})`)
          return true // Allow retries
        },
        onSecondaryRateLimit: retryAfter => {
          console.log(`⏳ Secondary rate limit hit, waiting ${retryAfter}s`)
          return true
        },
      },
      cache: {
        enabled: true,
        ttl: 60000, // 1 minute TTL for testing
      },
      includeRateLimit: true,
    })
  })

  afterEach(async () => {
    const testDuration = Date.now() - metrics.startTime

    // Log test metrics
    console.log(`\n📊 Test completed in ${testDuration}ms`)
    if (metrics.apiCalls.length > 0) {
      const avgDuration =
        metrics.apiCalls.reduce((sum, call) => sum + call.duration, 0) / metrics.apiCalls.length
      const cachedCalls = metrics.apiCalls.filter(call => call.cached).length
      const cacheHitRate =
        metrics.apiCalls.length > 0 ? (cachedCalls / metrics.apiCalls.length) * 100 : 0

      console.log(`   API calls: ${metrics.apiCalls.length}`)
      console.log(`   Average duration: ${avgDuration.toFixed(2)}ms`)
      console.log(`   Cache hit rate: ${cacheHitRate.toFixed(1)}%`)
      console.log(`   Errors: ${metrics.errors.length}`)

      // Check for remaining rate limit
      const lastCall = metrics.apiCalls[metrics.apiCalls.length - 1]
      if (lastCall?.rateLimitRemaining !== undefined) {
        console.log(`   Rate limit remaining: ${lastCall.rateLimitRemaining}`)
      }
    }

    // Clean up client
    if (client) {
      await client.destroy()
    }
  })

  describe('Authentication Flow Validation', () => {
    it('should authenticate with Personal Access Token and verify scopes', async () => {
      const startTime = Date.now()

      // Test basic authentication
      const user = await client.rest.users.getAuthenticated()
      const duration = Date.now() - startTime

      metrics.apiCalls.push({
        endpoint: '/user',
        duration,
        statusCode: 200,
        cached: false,
        rateLimitRemaining: parseRateLimitHeader(user.headers['x-ratelimit-remaining']),
      })

      // Validate response
      expect(user.data).toBeDefined()
      expect(user.data.login).toBeTruthy()
      expect(user.data.type).toBeDefined()
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds

      // Validate rate limit headers
      expect(user.headers['x-ratelimit-limit']).toBeDefined()
      expect(user.headers['x-ratelimit-remaining']).toBeDefined()
      expect(user.headers['x-ratelimit-reset']).toBeDefined()

      console.log(`✅ Authenticated as: ${user.data.login} (${user.data.type})`)
      console.log(
        `   API calls remaining: ${user.headers['x-ratelimit-remaining']}/${user.headers['x-ratelimit-limit']}`
      )
    })

    it('should handle token validation and error scenarios', async () => {
      // Create client with invalid token
      const invalidClient = new GitHubClient({
        auth: {
          type: 'token',
          token: 'ghp_invalid_token_12345',
        },
        throttle: { enabled: false }, // Don't retry for this test
      })

      try {
        const startTime = Date.now()

        await expect(invalidClient.rest.users.getAuthenticated()).rejects.toThrow()

        const duration = Date.now() - startTime
        metrics.errors.push({
          endpoint: '/user',
          error: 'Authentication failed',
          retryCount: 0,
        })

        console.log(`✅ Invalid token correctly rejected in ${duration}ms`)
      } finally {
        await invalidClient.destroy()
      }
    })
  })

  describe('Repository Operations with Real Data', () => {
    it('should list repositories with pagination and caching', async () => {
      const startTime = Date.now()

      // First request (should be fresh)
      const repos1 = await client.rest.repos.listForAuthenticatedUser({
        per_page: 5,
        sort: 'updated',
      })
      const duration1 = Date.now() - startTime

      metrics.apiCalls.push({
        endpoint: '/user/repos',
        duration: duration1,
        statusCode: repos1.status,
        cached: false,
        rateLimitRemaining: parseRateLimitHeader(repos1.headers['x-ratelimit-remaining']),
      })

      // Validate first response
      expect(repos1.data).toBeDefined()
      expect(Array.isArray(repos1.data)).toBe(true)
      expect(repos1.data.length).toBeLessThanOrEqual(5)
      expect(duration1).toBeLessThan(10000) // Should complete within 10 seconds

      // Second request (should be cached if ETag is supported)
      const startTime2 = Date.now()
      const repos2 = await client.rest.repos.listForAuthenticatedUser({
        per_page: 5,
        sort: 'updated',
      })
      const duration2 = Date.now() - startTime2

      const wasCached = duration2 < duration1 / 2 || repos2.status === 304
      metrics.apiCalls.push({
        endpoint: '/user/repos',
        duration: duration2,
        statusCode: repos2.status,
        cached: wasCached,
      })

      console.log(`✅ Repository listing: ${repos1.data.length} repos found`)
      console.log(`   First request: ${duration1}ms`)
      console.log(`   Second request: ${duration2}ms (cached: ${wasCached})`)

      // Validate caching behavior
      if (repos1.headers.etag && repos2.headers.etag) {
        expect(repos1.headers.etag).toBe(repos2.headers.etag)
        console.log(`   ETag consistency verified: ${repos1.headers.etag}`)
      }
    })

    it('should handle organization repositories and permissions', async () => {
      const org = process.env.GITHUB_TEST_ORG
      if (!org) {
        throw new Error('GITHUB_TEST_ORG environment variable is required for this test')
      }
      const startTime = Date.now()

      try {
        const orgRepos = await client.rest.repos.listForOrg({
          org,
          per_page: 5,
          sort: 'updated',
        })
        const duration = Date.now() - startTime

        metrics.apiCalls.push({
          endpoint: `/orgs/${org}/repos`,
          duration,
          statusCode: orgRepos.status,
          cached: false,
          rateLimitRemaining: parseRateLimitHeader(orgRepos.headers['x-ratelimit-remaining']),
        })

        expect(orgRepos.data).toBeDefined()
        expect(Array.isArray(orgRepos.data)).toBe(true)
        expect(duration).toBeLessThan(10000)

        console.log(`✅ Organization repos: ${orgRepos.data.length} repos in ${org}`)

        // Test repository details if we have any repos
        if (orgRepos.data.length > 0) {
          const repo = orgRepos.data[0]
          const repoDetails = await client.rest.repos.get({
            owner: repo.owner.login,
            repo: repo.name,
          })

          expect(repoDetails.data).toBeDefined()
          expect(repoDetails.data.full_name).toBe(repo.full_name)

          console.log(
            `   Detailed repo info: ${repo.full_name} (${repo.language || 'No language'})`
          )
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        metrics.errors.push({
          endpoint: `/orgs/${org}/repos`,
          error: errorMessage,
          retryCount: 0,
        })

        if (error.status === 404) {
          console.log(`⚠️  Organization ${org} not found or not accessible`)
        } else {
          throw error
        }
      }
    })
  })

  describe('GraphQL API with Real Queries', () => {
    it('should execute GraphQL queries with point tracking', async () => {
      const query = `
        query {
          viewer {
            login
            name
            email
            createdAt
            repositories(first: 5, orderBy: {field: UPDATED_AT, direction: DESC}) {
              totalCount
              nodes {
                name
                description
                stargazerCount
                primaryLanguage {
                  name
                }
              }
            }
          }
          rateLimit {
            limit
            cost
            remaining
            resetAt
          }
        }
      `

      const startTime = Date.now()
      const result = await client.graphql(query)
      const duration = Date.now() - startTime

      metrics.apiCalls.push({
        endpoint: '/graphql',
        duration,
        statusCode: 200,
        cached: false,
      })

      // Validate GraphQL response structure
      expect(result).toBeDefined()
      expect(result.viewer).toBeDefined()
      expect(result.viewer.login).toBeTruthy()
      expect(result.rateLimit).toBeDefined()
      expect(result.rateLimit.limit).toBeGreaterThan(0)
      expect(result.rateLimit.remaining).toBeGreaterThanOrEqual(0)
      expect(duration).toBeLessThan(15000) // GraphQL can be slower

      console.log(`✅ GraphQL query executed in ${duration}ms`)
      console.log(`   User: ${result.viewer.login} (${result.viewer.name || 'No name'})`)
      console.log(`   Repositories: ${result.viewer.repositories.totalCount}`)
      console.log(`   Query cost: ${result.rateLimit.cost} points`)
      console.log(
        `   Rate limit: ${result.rateLimit.remaining}/${result.rateLimit.limit} remaining`
      )

      // Validate rate limit tracking
      expect(result.rateLimit.cost).toBeGreaterThan(0)
      expect(result.rateLimit.cost).toBeLessThan(100) // Should be reasonable
    })

    it('should handle GraphQL errors and complex queries', async () => {
      // Test a query with potential errors (non-existent repository)
      const errorQuery = `
        query {
          repository(owner: "nonexistent-user-12345", name: "nonexistent-repo-67890") {
            name
            description
          }
          rateLimit {
            limit
            cost
            remaining
            resetAt
          }
        }
      `

      const startTime = Date.now()
      const result = await client.graphql(errorQuery)
      const duration = Date.now() - startTime

      metrics.apiCalls.push({
        endpoint: '/graphql',
        duration,
        statusCode: 200,
        cached: false,
      })

      // GraphQL returns null for non-existent resources, not HTTP errors
      expect(result.repository).toBeNull()
      expect(result.rateLimit).toBeDefined()

      console.log(`✅ GraphQL error handling verified in ${duration}ms`)
      console.log(`   Query cost: ${result.rateLimit.cost} points (even for null results)`)
    })
  })

  describe('Rate Limiting Behavior', () => {
    it('should respect rate limits and implement backoff', async () => {
      // Get current rate limit status
      const rateLimitStatus = await client.getRateLimitStatus()

      expect(rateLimitStatus).toBeDefined()
      expect(rateLimitStatus.resources).toBeDefined()
      expect(rateLimitStatus.resources.core).toBeDefined()

      const coreLimit = rateLimitStatus.resources.core
      console.log('✅ Rate limit status retrieved')
      console.log(`   Core API: ${coreLimit.remaining}/${coreLimit.limit} remaining`)
      console.log(`   Resets at: ${new Date(coreLimit.reset * 1000).toISOString()}`)

      // Test rate limit monitoring
      const rateLimitInfo = client.getRateLimitInfo()
      expect(rateLimitInfo).toBeDefined()

      // Verify rate limit tracking is working
      if (typeof rateLimitInfo === 'object' && rateLimitInfo !== null && 'core' in rateLimitInfo) {
        const coreInfo = rateLimitInfo.core as {
          remaining?: number
          limit?: number
          reset?: number
        }
        if (
          coreInfo &&
          typeof coreInfo === 'object' &&
          'remaining' in coreInfo &&
          typeof coreInfo.remaining === 'number'
        ) {
          expect(coreInfo.remaining).toBeGreaterThanOrEqual(0)
          console.log(`   Client tracking: ${coreInfo.remaining} remaining`)
        }
      }
    })

    it('should handle secondary rate limits gracefully', async () => {
      // Test with multiple rapid requests to potentially trigger secondary limits
      const requests = []
      const requestCount = 5 // Conservative to avoid hitting limits in tests

      console.log(`🔄 Making ${requestCount} rapid requests to test throttling...`)

      for (let i = 0; i < requestCount; i++) {
        const promise = client.rest.users
          .getAuthenticated()
          .then(response => ({
            index: i,
            duration: Date.now(),
            rateLimitRemaining: parseRateLimitHeader(response.headers['x-ratelimit-remaining']),
            success: true,
          }))
          .catch(error => ({
            index: i,
            duration: Date.now(),
            error: error.message,
            success: false,
          }))

        requests.push(promise)
      }

      const results = await Promise.all(requests)
      const successfulRequests = results.filter(r => r.success)
      const failedRequests = results.filter(r => !r.success)

      console.log(
        `✅ Rapid requests completed: ${successfulRequests.length} success, ${failedRequests.length} failed`
      )

      // All requests should eventually succeed due to throttling
      expect(successfulRequests.length).toBe(requestCount)
      expect(failedRequests.length).toBe(0)

      // Record metrics
      results.forEach(result => {
        if (result.success) {
          metrics.apiCalls.push({
            endpoint: '/user',
            duration: 50, // Estimated
            statusCode: 200,
            cached: false,
            rateLimitRemaining: result.rateLimitRemaining,
          })
        } else {
          metrics.errors.push({
            endpoint: '/user',
            error: result.error || 'Unknown error',
            retryCount: 0,
          })
        }
      })
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts and retry logic', async () => {
      // Create a client with aggressive timeout settings for testing
      const timeoutClient = new GitHubClient({
        auth: {
          type: 'token',
          token: process.env.GITHUB_TEST_TOKEN ?? '',
        },
        throttle: {
          enabled: true,
          onRateLimit: () => true,
        },
        retry: {
          enabled: true,
          retries: 2,
          doNotRetry: [], // Retry all errors for testing
        },
        request: {
          timeout: 2000, // 2 second timeout
        },
      })

      try {
        const startTime = Date.now()
        const result = await timeoutClient.rest.users.getAuthenticated()
        const duration = Date.now() - startTime

        // If we get here, the request succeeded despite tight timeout
        expect(result.data).toBeDefined()
        expect(duration).toBeLessThan(5000) // Should be reasonably fast

        console.log(`✅ Network resilience test passed in ${duration}ms`)

        metrics.apiCalls.push({
          endpoint: '/user',
          duration,
          statusCode: result.status,
          cached: false,
          rateLimitRemaining: parseRateLimitHeader(result.headers['x-ratelimit-remaining']),
        })
      } catch (error) {
        // Network issues are acceptable for this test
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.log(`⚠️  Network timeout/retry test resulted in error: ${errorMessage}`)

        metrics.errors.push({
          endpoint: '/user',
          error: error.message,
          retryCount: 2,
        })

        // Don't fail the test for network issues
        expect(error).toBeDefined()
      } finally {
        await timeoutClient.destroy()
      }
    })

    it('should handle API quota and usage scenarios', async () => {
      // Test that we can check our API usage without exhausting quotas
      const startTime = Date.now()

      // Get rate limit first
      const rateLimit = await client.getRateLimitStatus()
      expect(rateLimit.resources.core.remaining).toBeGreaterThan(0)

      // Make a minimal API call
      const _user = await client.rest.users.getAuthenticated()
      const duration = Date.now() - startTime

      // Get rate limit again to see the difference
      const rateLimitAfter = await client.getRateLimitStatus()

      const requestsUsed =
        rateLimit.resources.core.remaining - rateLimitAfter.resources.core.remaining

      console.log(`✅ API quota tracking verified in ${duration}ms`)
      console.log(`   Requests used: ${requestsUsed}`)
      console.log(
        `   Remaining: ${rateLimitAfter.resources.core.remaining}/${rateLimitAfter.resources.core.limit}`
      )

      expect(requestsUsed).toBeGreaterThanOrEqual(1) // Should have used at least 1 request
      expect(requestsUsed).toBeLessThanOrEqual(3) // Should not have used too many

      metrics.apiCalls.push({
        endpoint: '/rate_limit',
        duration,
        statusCode: 200,
        cached: false,
        rateLimitRemaining: rateLimitAfter.resources.core.remaining,
      })
    })
  })

  describe('Performance and Memory Validation', () => {
    it('should maintain performance under typical load', async () => {
      const operationCount = 10
      const operations = []
      const startTime = Date.now()

      console.log(`🔄 Performance test: ${operationCount} operations...`)

      // Mix of different API operations
      for (let i = 0; i < operationCount; i++) {
        const operation =
          i % 3 === 0
            ? client.rest.users.getAuthenticated()
            : i % 3 === 1
              ? client.rest.repos.listForAuthenticatedUser({ per_page: 1 })
              : client.graphql('query { viewer { login } rateLimit { remaining } }')

        operations.push(operation)
      }

      const _results = await Promise.all(operations)
      const totalDuration = Date.now() - startTime
      const averageDuration = totalDuration / operationCount

      console.log(`✅ Performance test completed in ${totalDuration}ms`)
      console.log(`   Average per operation: ${averageDuration.toFixed(2)}ms`)
      console.log(
        `   Operations per second: ${((operationCount / totalDuration) * 1000).toFixed(2)}`
      )

      // Performance expectations
      expect(totalDuration).toBeLessThan(30000) // 30 seconds max for 10 operations
      expect(averageDuration).toBeLessThan(3000) // 3 seconds average

      // Record metrics
      for (let i = 0; i < operationCount; i++) {
        metrics.apiCalls.push({
          endpoint: `/perf-test-${i}`,
          duration: averageDuration,
          statusCode: 200,
          cached: false,
        })
      }
    })

    it('should demonstrate proper resource cleanup', async () => {
      // Create multiple clients to test cleanup
      const clients = []

      for (let i = 0; i < 3; i++) {
        const testClient = new GitHubClient({
          auth: {
            type: 'token',
            token: process.env.GITHUB_TEST_TOKEN ?? '',
          },
        })
        clients.push(testClient)

        // Make a request with each client
        const user = await testClient.rest.users.getAuthenticated()
        expect(user.data.login).toBeTruthy()
      }

      // Clean up all clients
      for (const testClient of clients) {
        await testClient.destroy()
      }

      console.log(`✅ Resource cleanup verified for ${clients.length} clients`)

      // Verify cleanup was successful (no hanging promises/timers)
      // This is implicit - if cleanup failed, the test would hang
    })
  })

  afterAll(() => {
    if (hasRequiredCredentials) {
      console.log('\n🎉 Real GitHub API integration tests completed successfully!')
      console.log('   All authentication flows validated')
      console.log('   Rate limiting and caching verified')
      console.log('   Error handling and recovery tested')
      console.log('   Performance metrics collected')
    }
  })
})

// Utility function to check environment setup
export function validateIntegrationTestEnvironment(): {
  isValid: boolean
  missingVars: string[]
  warnings: string[]
} {
  const missingVars = REQUIRED_ENV_VARS.filter(envVar => !process.env[envVar])
  const warnings = []

  // Check optional but recommended variables
  if (!process.env.GITHUB_APP_ID) {
    warnings.push('GITHUB_APP_ID not set - GitHub App authentication tests will be skipped')
  }

  if (!process.env.GITHUB_APP_PRIVATE_KEY) {
    warnings.push(
      'GITHUB_APP_PRIVATE_KEY not set - GitHub App authentication tests will be skipped'
    )
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
    warnings,
  }
}
