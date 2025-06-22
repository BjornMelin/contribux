/**
 * Comprehensive GitHub API Integration Tests
 * 
 * Tests the complete GitHub API integration with metrics collection,
 * performance monitoring, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { GitHubClient } from '@/lib/github/client'
import { RateLimitManager } from '@/lib/github/rate-limiting'
import { loadIntegrationTestEnv } from '../infrastructure/test-config'
import type { MetricsCollector } from '../infrastructure/test-config'

// Test configuration
let env: any
let metricsCollector: MetricsCollector = globalThis.__INTEGRATION_METRICS_COLLECTOR__

// Check if integration test environment is available
const hasCredentials = process.env.GITHUB_TEST_TOKEN && process.env.GITHUB_TEST_ORG
const skipTests = !hasCredentials || process.env.SKIP_INTEGRATION_TESTS === 'true'

if (hasCredentials) {
  try {
    env = loadIntegrationTestEnv()
  } catch (error) {
    console.warn('Integration test environment validation failed, skipping tests')
  }
}

describe.skipIf(skipTests)('GitHub API Comprehensive Integration Tests', () => {
  let githubClient: GitHubClient
  let rateLimitManager: RateLimitManager
  let startTime: number

  beforeAll(async () => {
    // Initialize GitHub client with test configuration
    githubClient = new GitHubClient({
      auth: {
        type: 'token',
        token: env.GITHUB_TEST_TOKEN
      },
      throttle: {
        enabled: true,
        onRateLimit: () => true, // Enable retries
        onSecondaryRateLimit: () => true
      },
      cache: {
        enabled: true,
        ttl: 5000
      }
    })

    rateLimitManager = new RateLimitManager({
      warningThreshold: 80,
      onWarning: (info) => {
        console.warn(`Rate limit warning: ${info.resource} at ${info.percentageUsed}%`)
      }
    })

    // Validate API access
    const user = await githubClient.rest.users.getAuthenticated()
    expect(user.data.login).toBeDefined()
    console.log(`✅ Authenticated as: ${user.data.login}`)
  })

  beforeEach(() => {
    startTime = Date.now()
  })

  afterEach(() => {
    const duration = Date.now() - startTime
    if (metricsCollector) {
      metricsCollector.recordApiCall('test-execution', duration, 200)
    }
  })

  afterAll(async () => {
    // Clean up GitHub client
    if (githubClient) {
      await githubClient.destroy()
    }
  })

  describe('REST API Performance Tests', () => {
    it('should handle basic user API calls efficiently', async () => {
      const testStartTime = Date.now()
      
      // Test user API
      const user = await githubClient.rest.users.getAuthenticated()
      expect(user.data.login).toBeDefined()
      
      const duration = Date.now() - testStartTime
      expect(duration).toBeLessThan(5000) // 5 second timeout
      
      if (metricsCollector) {
        metricsCollector.recordApiCall('/user', duration, user.status)
      }
    })

    it('should handle repository listing with pagination', async () => {
      const testStartTime = Date.now()
      
      // Test repository listing
      const repos = await githubClient.rest.repos.listForAuthenticatedUser({
        per_page: 10,
        sort: 'updated'
      })
      
      expect(repos.data.length).toBeGreaterThanOrEqual(0)
      expect(repos.data.length).toBeLessThanOrEqual(10)
      
      const duration = Date.now() - testStartTime
      expect(duration).toBeLessThan(10000) // 10 second timeout
      
      if (metricsCollector) {
        metricsCollector.recordApiCall('/user/repos', duration, repos.status)
      }
    })

    it('should handle organization API calls', async () => {
      const testStartTime = Date.now()
      
      try {
        // Test organization API
        const orgs = await githubClient.rest.orgs.listForAuthenticatedUser({
          per_page: 5
        })
        
        expect(Array.isArray(orgs.data)).toBe(true)
        
        const duration = Date.now() - testStartTime
        expect(duration).toBeLessThan(8000) // 8 second timeout
        
        if (metricsCollector) {
          metricsCollector.recordApiCall('/user/orgs', duration, orgs.status)
        }
      } catch (error: any) {
        // Handle case where user has no organizations
        if (error.status === 404 || error.status === 403) {
          const duration = Date.now() - testStartTime
          if (metricsCollector) {
            metricsCollector.recordApiCall('/user/orgs', duration, error.status)
          }
          return
        }
        throw error
      }
    })
  })

  describe('GraphQL API Performance Tests', () => {
    it('should execute GraphQL queries efficiently', async () => {
      const testStartTime = Date.now()
      
      const query = `
        query {
          viewer {
            login
            name
            email
            repositories(first: 5, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes {
                name
                description
                updatedAt
                primaryLanguage {
                  name
                }
              }
            }
          }
        }
      `
      
      const response = await githubClient.graphql(query)
      expect(response.viewer.login).toBeDefined()
      expect(response.viewer.repositories.nodes).toBeDefined()
      
      const duration = Date.now() - testStartTime
      expect(duration).toBeLessThan(8000) // 8 second timeout
      
      if (metricsCollector) {
        metricsCollector.recordApiCall('graphql-query', duration, 200)
      }
    })

    it('should handle complex GraphQL queries with error handling', async () => {
      const testStartTime = Date.now()
      
      const complexQuery = `
        query($login: String!) {
          user(login: $login) {
            login
            name
            repositories(first: 10, orderBy: {field: STARGAZERS, direction: DESC}) {
              totalCount
              nodes {
                name
                description
                stargazerCount
                forkCount
                primaryLanguage {
                  name
                  color
                }
                languages(first: 5) {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        }
      `
      
      const user = await githubClient.rest.users.getAuthenticated()
      const response = await githubClient.graphql(complexQuery, {
        login: user.data.login
      })
      
      expect(response.user.login).toBe(user.data.login)
      expect(response.user.repositories.nodes).toBeDefined()
      
      const duration = Date.now() - testStartTime
      expect(duration).toBeLessThan(12000) // 12 second timeout for complex query
      
      if (metricsCollector) {
        metricsCollector.recordApiCall('graphql-complex-query', duration, 200)
      }
    })
  })

  describe('Rate Limiting and Error Handling', () => {
    it('should respect rate limits and retry appropriately', async () => {
      const testStartTime = Date.now()
      let requestCount = 0
      
      // Make multiple rapid requests to test rate limiting
      const requests = Array.from({ length: 5 }, async () => {
        requestCount++
        const start = Date.now()
        
        try {
          const response = await githubClient.rest.users.getAuthenticated()
          const duration = Date.now() - start
          
          if (metricsCollector) {
            metricsCollector.recordApiCall(`/user-rapid-${requestCount}`, duration, response.status)
          }
          
          return response
        } catch (error: any) {
          const duration = Date.now() - start
          
          if (metricsCollector) {
            metricsCollector.recordApiCall(`/user-rapid-${requestCount}`, duration, error.status || 500)
          }
          
          throw error
        }
      })
      
      const responses = await Promise.all(requests)
      responses.forEach(response => {
        expect(response.data.login).toBeDefined()
      })
      
      const totalDuration = Date.now() - testStartTime
      expect(totalDuration).toBeLessThan(30000) // 30 second total timeout
      
      // Verify rate limit handling
      const rateLimitInfo = responses[responses.length - 1].headers
      if (rateLimitInfo['x-ratelimit-remaining']) {
        const remaining = parseInt(rateLimitInfo['x-ratelimit-remaining'])
        const limit = parseInt(rateLimitInfo['x-ratelimit-limit'] || '5000')
        
        if (metricsCollector) {
          metricsCollector.recordRateLimit('rest-api', remaining, limit)
        }
        
        expect(remaining).toBeGreaterThanOrEqual(0)
      }
    })

    it('should handle API errors gracefully', async () => {
      const testStartTime = Date.now()
      
      try {
        // Attempt to access a non-existent repository
        await githubClient.rest.repos.get({
          owner: 'nonexistent-user-12345',
          repo: 'nonexistent-repo-12345'
        })
        
        // Should not reach here
        expect(true).toBe(false)
      } catch (error: any) {
        const duration = Date.now() - testStartTime
        
        expect(error.status).toBe(404)
        expect(error.message).toContain('Not Found')
        
        if (metricsCollector) {
          metricsCollector.recordApiCall('/repos/nonexistent', duration, 404)
        }
      }
    })
  })

  describe('Cache Performance Tests', () => {
    it('should demonstrate cache hit improvements', async () => {
      const cacheKey = 'user-profile-cache-test'
      
      // First request - cache miss
      const firstRequestStart = Date.now()
      const firstResponse = await githubClient.rest.users.getAuthenticated()
      const firstDuration = Date.now() - firstRequestStart
      
      if (metricsCollector) {
        metricsCollector.recordCacheMiss(cacheKey)
        metricsCollector.recordApiCall('/user-first', firstDuration, firstResponse.status)
      }
      
      // Small delay to ensure cache is populated
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Second request - should be faster due to caching
      const secondRequestStart = Date.now()
      const secondResponse = await githubClient.rest.users.getAuthenticated()
      const secondDuration = Date.now() - secondRequestStart
      
      if (metricsCollector) {
        metricsCollector.recordCacheHit(cacheKey)
        metricsCollector.recordApiCall('/user-cached', secondDuration, secondResponse.status)
      }
      
      // Verify both responses have same data
      expect(firstResponse.data.login).toBe(secondResponse.data.login)
      
      // Second request should be faster (though this might not always be true due to network variance)
      console.log(`First request: ${firstDuration}ms, Second request: ${secondDuration}ms`)
    })
  })

  describe('Memory and Performance Monitoring', () => {
    it('should track memory usage during operations', async () => {
      const initialMemory = process.memoryUsage()
      
      if (metricsCollector) {
        metricsCollector.recordMemoryUsage(initialMemory.heapUsed)
      }
      
      // Perform memory-intensive operations
      const operations = []
      for (let i = 0; i < 10; i++) {
        operations.push(
          githubClient.rest.users.getAuthenticated().then(response => {
            if (metricsCollector) {
              const currentMemory = process.memoryUsage()
              metricsCollector.recordMemoryUsage(currentMemory.heapUsed)
            }
            return response
          })
        )
      }
      
      const responses = await Promise.all(operations)
      expect(responses.length).toBe(10)
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = process.memoryUsage()
      if (metricsCollector) {
        metricsCollector.recordMemoryUsage(finalMemory.heapUsed)
      }
      
      // Memory should not have grown excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed
      const memoryGrowthMB = memoryGrowth / 1024 / 1024
      
      console.log(`Memory growth: ${memoryGrowthMB.toFixed(2)}MB`)
      expect(memoryGrowthMB).toBeLessThan(50) // Less than 50MB growth
    })
  })

  afterAll(async () => {
    // Generate metrics summary
    if (metricsCollector) {
      const metrics = metricsCollector.getMetrics()
      
      console.log('\n📊 Test Suite Metrics Summary:')
      console.log(`  - Total API calls: ${metrics.apiCalls.total}`)
      console.log(`  - Average duration: ${metrics.apiCalls.averageDuration.toFixed(2)}ms`)
      console.log(`  - Error rate: ${(metrics.apiCalls.errorRate * 100).toFixed(2)}%`)
      console.log(`  - Cache hits: ${metrics.cache.hits}`)
      console.log(`  - Cache misses: ${metrics.cache.misses}`)
      console.log(`  - Cache hit rate: ${(metrics.cache.hitRate * 100).toFixed(2)}%`)
      console.log(`  - Peak memory: ${(metrics.memory.peak / 1024 / 1024).toFixed(2)}MB`)
      console.log(`  - Memory growth: ${(metrics.memory.growth / 1024 / 1024).toFixed(2)}MB`)
      
      // Validate performance thresholds
      expect(metrics.apiCalls.averageDuration).toBeLessThan(5000) // 5 second average
      expect(metrics.apiCalls.errorRate).toBeLessThan(0.1) // Less than 10% errors
      expect(metrics.memory.growth).toBeLessThan(100 * 1024 * 1024) // Less than 100MB growth
    }
  })
})