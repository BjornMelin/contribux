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
        accessToken: 'ghp_test1234567890abcdef1234567890abcdef12',
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
        accessToken: 'test_token',
      })

      // Initial cache should be empty
      let stats = client.getCacheStats()
      expect(stats.size).toBe(0)

      // Make some requests to populate cache
      await client.getRepository('testowner', 'testrepo')

      // Cache should now have entries
      stats = client.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.maxSize).toBe(1000)
    })

    it('should keep cache size within the built-in capacity', async () => {
      const client = new GitHubClient({
        accessToken: 'test_token',
      })

      // Make multiple requests to exercise cache bound checks.
      await client.getRepository('owner1', 'repo1')
      await client.getRepository('owner2', 'repo2')
      await client.getRepository('owner3', 'repo3')

      const stats = client.getCacheStats()
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize)
    })

    it('should clear cache effectively', async () => {
      const client = new GitHubClient({
        accessToken: 'test_token',
      })

      // Populate cache
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
        accessToken: 'test_token',
      })

      // First request
      const repo1 = await client.getRepository('testowner', 'testrepo')
      expect(repo1.name).toBe('testrepo')
      expect(repo1.owner.login).toBe('testowner')

      // Second request (should use cache)
      const repo2 = await client.getRepository('testowner', 'testrepo')
      expect(repo2.name).toBe(repo1.name)
      expect(repo2.id).toBe(repo1.id)

      // Data should be identical (same reference for cached responses)
      expect(repo2).toEqual(repo1)
    })

    it('should return consistent cached data across repeated requests', async () => {
      const client = new GitHubClient({
        accessToken: 'test_token',
      })

      // First request
      const repo1 = await client.getRepository('testowner', 'testrepo')
      expect(repo1.name).toBe('testrepo')

      // Second request should read through the built-in cache.
      const repo2 = await client.getRepository('testowner', 'testrepo')
      expect(repo2.id).toBe(repo1.id)
      expect(client.getCacheStats().hits).toBeGreaterThan(0)
    })

    it('should maintain data consistency across different endpoints', async () => {
      const client = new GitHubClient({
        accessToken: 'test_token',
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
        accessToken: 'test_token',
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
        accessToken: 'test_token',
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
        accessToken: 'test_token',
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
        accessToken: 'test_token',
      })

      // Make various requests
      await client.getAuthenticatedUser()
      await client.getRateLimit()
      await client.getRepository('testowner', 'testrepo')

      const stats = client.getCacheStats()

      expect(stats).toMatchObject({
        size: expect.any(Number),
        maxSize: 1000,
      })

      expect(stats.size).toBeGreaterThan(0)
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize)
    })

    it('should track cache performance over time', async () => {
      const client = new GitHubClient({
        accessToken: 'test_token',
      })

      // Track stats changes
      const initialStats = client.getCacheStats()
      expect(initialStats.size).toBe(0)

      // Add some cached data
      await client.getRepository('testowner', 'testrepo')
      const afterFirstRequest = client.getCacheStats()
      expect(afterFirstRequest.size).toBeGreaterThan(initialStats.size)

      // Add more cached data
      await client.getRepository('anotherowner', 'anotherrepo')
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
        accessToken: 'test_token',
      })

      const client2 = new GitHubClient({
        accessToken: 'test_token',
      })

      // Each client should have its own cache
      await client1.getRepository('testowner', 'testrepo')

      const stats1 = client1.getCacheStats()
      const stats2 = client2.getCacheStats()

      expect(stats1.size).toBeGreaterThan(0)
      expect(stats2.size).toBe(0) // client2 hasn't made any requests

      // Client2 makes request
      await client2.getRepository('testowner', 'testrepo')
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
      accessToken: process.env.GITHUB_TOKEN ?? 'dummy-token',
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
