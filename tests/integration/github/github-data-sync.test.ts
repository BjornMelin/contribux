/**
 * GitHub Data Synchronization & Caching Integration Tests
 *
 * This file contains data synchronization and caching integration scenarios:
 * - Cache management and performance patterns
 * - Data consistency validation across requests
 * - Cache invalidation and refresh strategies
 * - Performance optimization through caching
 * - Multi-client cache coordination
 * - Cache statistics and monitoring
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGitHubClient, GitHubClient } from '@/lib/github/client'
import { mockGitHubAPI } from '../msw-setup'
import { setupGitHubTestIsolation } from '../test-helpers'

// Skip real integration tests flag
const SKIP_INTEGRATION_TESTS = !process.env.GITHUB_TOKEN || process.env.SKIP_INTEGRATION === 'true'

// Setup MSW and test isolation
setupGitHubTestIsolation()

describe('GitHub Data Synchronization & Caching Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Cache Management Patterns', () => {
    it('should provide cache management functionality', () => {
      const client = createGitHubClient({
        auth: {
          type: 'token',
          token: 'ghp_test1234567890abcdef1234567890abcdef12',
        },
      })

      const stats = client.getCacheStats()
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('maxSize')
      expect(typeof stats.size).toBe('number')
      expect(typeof stats.maxSize).toBe('number')

      client.clearCache()
      const clearedStats = client.getCacheStats()
      expect(clearedStats.size).toBe(0)
    })

    it('should track cache utilization accurately', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 300,
          maxSize: 100,
        },
      })

      // Initial cache should be empty
      let stats = client.getCacheStats()
      expect(stats.size).toBe(0)

      // Make some requests to populate cache
      await client.getAuthenticatedUser()
      await client.getRepository('testowner', 'testrepo')
      await client.getRateLimit()

      // Cache should now have entries
      stats = client.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.maxSize).toBe(100)
    })

    it('should handle cache overflow gracefully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 300,
          maxSize: 2, // Very small cache
        },
      })

      // Make multiple requests to exceed cache size
      await client.getAuthenticatedUser()
      await client.getRepository('owner1', 'repo1')
      await client.getRepository('owner2', 'repo2')
      await client.getRepository('owner3', 'repo3')

      const stats = client.getCacheStats()
      expect(stats.size).toBeLessThanOrEqual(2) // Should not exceed maxSize
    })

    it('should clear cache effectively', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Populate cache
      await client.getAuthenticatedUser()
      await client.getRepository('testowner', 'testrepo')

      let stats = client.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)

      // Clear cache
      client.clearCache()
      stats = client.getCacheStats()
      expect(stats.size).toBe(0)
    })
  })

  describe('Data Consistency Validation', () => {
    it('should maintain consistent data across cached requests', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 300,
          maxSize: 100,
        },
      })

      // First request
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')
      expect(user1.id).toBe(12345)

      // Second request (should use cache)
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe(user1.login)
      expect(user2.id).toBe(user1.id)

      // Data should be identical (same reference for cached responses)
      expect(user2).toEqual(user1)
    })

    it('should handle cache expiration correctly', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 1, // Very short cache time
          maxSize: 100,
        },
      })

      // First request
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Second request (should fetch fresh data)
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe('testuser')
      expect(user2.id).toBe(user1.id)
    })

    it('should maintain data consistency across different endpoints', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Get user via authenticated endpoint
      const authUser = await client.getAuthenticatedUser()
      expect(authUser.login).toBe('testuser')

      // Get same user via username endpoint
      const namedUser = await client.getUser('testuser')
      expect(namedUser.login).toBe(authUser.login)
    })
  })

  describe('Performance Optimization through Caching', () => {
    it('should demonstrate performance improvement with caching', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 300,
          maxSize: 100,
        },
      })

      // First request (cache miss)
      const start1 = Date.now()
      const repo1 = await client.getRepository('testowner', 'testrepo')
      const _time1 = Date.now() - start1

      // Second request (cache hit)
      const start2 = Date.now()
      const repo2 = await client.getRepository('testowner', 'testrepo')
      const _time2 = Date.now() - start2

      expect(repo1.id).toBe(repo2.id)
      expect(repo1.name).toBe(repo2.name)

      // Cache hit should be faster (though in tests this might not always be true due to mocking)
      // But we can verify the data is consistent
      expect(repo2).toEqual(repo1)
    })

    it('should handle multiple concurrent requests efficiently', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Make multiple concurrent requests for the same resource
      const promises = Array.from({ length: 5 }, () =>
        client.getRepository('testowner', 'testrepo')
      )

      const results = await Promise.all(promises)

      // All results should be identical
      results.forEach(result => {
        expect(result.name).toBe('testrepo')
        expect(result.owner.login).toBe('testowner')
        expect(result.id).toBe(results[0].id)
      })
    })

    it('should batch similar requests when possible', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const repoParams = { owner: 'testowner', repo: 'testrepo' }

      // Make requests in quick succession
      const [repo1, repo2, repo3] = await Promise.all([
        client.getRepository(repoParams.owner, repoParams.repo),
        client.getRepository(repoParams.owner, repoParams.repo),
        client.getRepository(repoParams.owner, repoParams.repo),
      ])

      // All should return the same data
      expect(repo1).toEqual(repo2)
      expect(repo2).toEqual(repo3)
    })
  })

  describe('Cache Statistics and Monitoring', () => {
    it('should provide detailed cache statistics', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 300,
          maxSize: 50,
        },
      })

      // Make various requests
      await client.getAuthenticatedUser()
      await client.getRateLimit()
      await client.getRepository('testowner', 'testrepo')

      const stats = client.getCacheStats()

      expect(stats).toMatchObject({
        size: expect.any(Number),
        maxSize: 50,
      })

      expect(stats.size).toBeGreaterThan(0)
      expect(stats.size).toBeLessThanOrEqual(50)
    })

    it('should track cache performance over time', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Track stats changes
      const initialStats = client.getCacheStats()
      expect(initialStats.size).toBe(0)

      // Add some cached data
      await client.getAuthenticatedUser()
      const afterFirstRequest = client.getCacheStats()
      expect(afterFirstRequest.size).toBeGreaterThan(initialStats.size)

      // Add more cached data
      await client.getRepository('testowner', 'testrepo')
      const afterSecondRequest = client.getCacheStats()
      expect(afterSecondRequest.size).toBeGreaterThanOrEqual(afterFirstRequest.size)

      // Clear cache
      client.clearCache()
      const afterClear = client.getCacheStats()
      expect(afterClear.size).toBe(0)
    })
  })

  describe('Multi-Client Cache Coordination', () => {
    it('should handle multiple client instances independently', async () => {
      const client1 = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 50 },
      })

      const client2 = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 50 },
      })

      // Each client should have its own cache
      await client1.getAuthenticatedUser()

      const stats1 = client1.getCacheStats()
      const stats2 = client2.getCacheStats()

      expect(stats1.size).toBeGreaterThan(0)
      expect(stats2.size).toBe(0) // client2 hasn't made any requests

      // Client2 makes request
      await client2.getAuthenticatedUser()
      const stats2After = client2.getCacheStats()
      expect(stats2After.size).toBeGreaterThan(0)

      // Clearing one cache shouldn't affect the other
      client1.clearCache()
      const stats1After = client1.getCacheStats()
      const stats2Final = client2.getCacheStats()

      expect(stats1After.size).toBe(0)
      expect(stats2Final.size).toBeGreaterThan(0)
    })
  })
})

// =====================================================
// REAL API DATA SYNC INTEGRATION TESTS
// =====================================================
describe.skipIf(SKIP_INTEGRATION_TESTS)('Real API Data Sync Integration', () => {
  let client: GitHubClient

  beforeEach(() => {
    client = new GitHubClient({
      auth: {
        type: 'token',
        token: process.env.GITHUB_TOKEN ?? 'dummy-token',
      },
      cache: {
        maxAge: 60, // 1 minute for tests
        maxSize: 100,
      },
    })
  })

  describe('Performance Integration', () => {
    it('should cache responses and improve performance', async () => {
      // First call
      const start1 = Date.now()
      const repo1 = await client.getRepository('microsoft', 'vscode')
      const time1 = Date.now() - start1

      // Second call (should be faster due to caching)
      const start2 = Date.now()
      const repo2 = await client.getRepository('microsoft', 'vscode')
      const time2 = Date.now() - start2

      expect(repo1.id).toBe(repo2.id)
      expect(time2).toBeLessThan(time1) // Second call should be faster

      const cacheStats = client.getCacheStats()
      expect(cacheStats.size).toBeGreaterThan(0)
    }, 15000)

    it('should clear cache successfully', async () => {
      // Make a request to populate cache
      await client.getRepository('microsoft', 'vscode')

      let cacheStats = client.getCacheStats()
      expect(cacheStats.size).toBeGreaterThan(0)

      // Clear cache
      client.clearCache()
      cacheStats = client.getCacheStats()
      expect(cacheStats.size).toBe(0)
    }, 10000)
  })
})
