/**
 * GitHub Client Async and Performance Edge Cases
 *
 * Tests for async operations, concurrent requests, and performance scenarios
 */

import { describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { setupMSW } from './msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from './test-helpers'

// Type for testing internal properties
interface GitHubClientTest extends GitHubClient {
  setCache: (key: string, data: unknown) => void
  getFromCache: (key: string) => unknown
  safeRequest: unknown
}

describe('GitHub Client Async Edge Cases', () => {
  setupMSW()
  setupGitHubTestIsolation()

  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('concurrent operations', () => {
    it('should handle multiple concurrent API calls without interference', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Make 10 concurrent requests to different endpoints
      const promises = [
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' }),
        client.getUser('octocat'),
        client.searchRepositories({ q: 'javascript' }),
        client.getRateLimit(),
        client.getRepository({ owner: 'github', repo: 'docs' }),
        client.listIssues({ owner: 'octocat', repo: 'Hello-World' }),
        client.getAuthenticatedUser(),
        client.searchRepositories({ q: 'python' }),
        client.getRepository({ owner: 'microsoft', repo: 'vscode' }),
        client.getUser('github'),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      expect(results[0]).toHaveProperty('name', 'Hello-World')
      expect(results[1]).toHaveProperty('login', 'octocat')
      expect(results[2]).toHaveProperty('items')
      expect(results[3]).toHaveProperty('core')
      expect(results[4]).toHaveProperty('name', 'docs')
      expect(Array.isArray(results[5])).toBe(true)
      expect(results[6]).toHaveProperty('login', 'testuser')
      expect(results[7]).toHaveProperty('items')
      expect(results[8]).toHaveProperty('name', 'vscode')
      expect(results[9]).toHaveProperty('login', 'github')
    })

    it('should handle concurrent requests to same endpoint with cache benefits', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      // Make 5 concurrent identical requests
      const promises = Array.from({ length: 5 }, () =>
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      results.forEach(repo => {
        expect(repo.full_name).toBe('octocat/Hello-World')
      })

      // Should have 1 miss (first request) and 4 hits (cached)
      const stats = client.getCacheStats()
      expect(stats.hits).toBe(4)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.8)
    })

    it('should handle mixed success and failure concurrent operations', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock one of the requests to fail
      const originalGetUser = client.getUser.bind(client)
      client.getUser = vi.fn().mockImplementation((username: string) => {
        if (username === 'nonexistent') {
          return Promise.reject(new GitHubError('Not Found', 'API_ERROR', 404))
        }
        return originalGetUser(username)
      })

      const promises = [
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' }),
        client.getUser('octocat'),
        client.getUser('nonexistent'), // This will fail
        client.getRateLimit(),
      ]

      const results = await Promise.allSettled(promises)

      expect(results).toHaveLength(4)
      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('fulfilled')
      expect(results[2].status).toBe('rejected')
      expect(results[3].status).toBe('fulfilled')
    })
  })

  describe('cache expiration scenarios', () => {
    it('should handle cache entry expiration correctly', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 1, maxSize: 100 }, // 1 second expiration for testing
      })

      // First request - should cache
      await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })

      let stats = client.getCacheStats()
      expect(stats.misses).toBe(1)
      expect(stats.hits).toBe(0)

      // Immediate second request - should hit cache
      await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })

      stats = client.getCacheStats()
      expect(stats.misses).toBe(1)
      expect(stats.hits).toBe(1)

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Third request - should miss cache due to expiration
      await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })

      stats = client.getCacheStats()
      expect(stats.misses).toBe(2)
      expect(stats.hits).toBe(1)
    })

    it('should handle cache size limit with proper LRU eviction', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 3 }, // Small cache for testing
      })

      // Fill cache with 3 repositories
      await client.getRepository({ owner: 'owner1', repo: 'repo1' })
      await client.getRepository({ owner: 'owner2', repo: 'repo2' })
      await client.getRepository({ owner: 'owner3', repo: 'repo3' })

      let stats = client.getCacheStats()
      expect(stats.size).toBe(3)
      expect(stats.misses).toBe(3)

      // Access first repository again to make it more recently used
      await client.getRepository({ owner: 'owner1', repo: 'repo1' })

      stats = client.getCacheStats()
      expect(stats.hits).toBe(1)

      // Add a 4th repository - should evict owner2/repo2 (least recently used)
      await client.getRepository({ owner: 'owner4', repo: 'repo4' })

      stats = client.getCacheStats()
      expect(stats.size).toBe(3) // Should stay at max size

      // Try to access the evicted repository - should be a cache miss
      await client.getRepository({ owner: 'owner2', repo: 'repo2' })

      stats = client.getCacheStats()
      expect(stats.misses).toBe(5) // Should have increased
    })
  })

  describe('GraphQL async edge cases', () => {
    it('should handle concurrent GraphQL queries', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const queries = [
        client.graphql('query { viewer { login } }'),
        client.graphql('query { viewer { name } }'),
        client.graphql(
          'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }',
          {
            owner: 'octocat',
            name: 'Hello-World',
          }
        ),
      ]

      const results = await Promise.all(queries)

      expect(results).toHaveLength(3)
      expect(results[0]).toHaveProperty('viewer')
      expect(results[1]).toHaveProperty('viewer')
      expect(results[2]).toHaveProperty('repository')
    })

    it('should handle GraphQL query with complex nested variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = `
        query($owner: String!, $name: String!, $first: Int) {
          repository(owner: $owner, name: $name) {
            name
            description
          }
        }
      `

      const variables = {
        owner: 'octocat',
        name: 'Hello-World',
        first: 10,
      }

      const result = await client.graphql(query, variables)
      expect(result).toBeDefined()
    })
  })

  describe('error recovery scenarios', () => {
    it('should maintain client state after error recovery', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock a temporary failure
      const originalGetUser = client.getUser.bind(client)
      let callCount = 0
      client.getUser = vi.fn().mockImplementation((username: string) => {
        callCount++
        if (callCount === 1) {
          return Promise.reject(new GitHubError('Temporary failure', 'API_ERROR', 500))
        }
        return originalGetUser(username)
      })

      // First call should fail
      await expect(client.getUser('octocat')).rejects.toThrow(GitHubError)

      // Second call should succeed
      const user = await client.getUser('octocat')
      expect(user).toBeDefined()
      expect(user.login).toBe('octocat')

      // Cache should still work
      const stats = client.getCacheStats()
      expect(stats).toBeDefined()
    })

    it('should handle partial API failures in batch operations', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock failures for specific repositories
      const originalGetRepo = client.getRepository.bind(client)
      client.getRepository = vi.fn().mockImplementation(identifier => {
        if (identifier.repo === 'failing-repo') {
          return Promise.reject(new GitHubError('Repository not found', 'API_ERROR', 404))
        }
        return originalGetRepo(identifier)
      })

      const promises = [
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' }),
        client.getRepository({ owner: 'octocat', repo: 'failing-repo' }),
        client.getRepository({ owner: 'github', repo: 'docs' }),
      ]

      const results = await Promise.allSettled(promises)

      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('rejected')
      expect(results[2].status).toBe('fulfilled')

      if (results[0].status === 'fulfilled') {
        expect(results[0].value.name).toBe('Hello-World')
      }
      if (results[2].status === 'fulfilled') {
        expect(results[2].value.name).toBe('docs')
      }
    })
  })

  describe('resource cleanup and memory management', () => {
    it('should properly clear all cache entries', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      // Add some cache entries manually

      ;(client as GitHubClientTest).setCache('key1', 'data1')
      ;(client as GitHubClientTest).setCache('key2', 'data2')
      ;(client as GitHubClientTest).setCache('key3', 'data3')

      let stats = client.getCacheStats()
      expect(stats.size).toBe(3)

      // Clear cache
      client.clearCache()

      stats = client.getCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    it('should handle cache operations with undefined entries', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      // Try to get from empty cache
      const cached = (client as GitHubClientTest).getFromCache('nonexistent-key')
      expect(cached).toBeNull()

      const stats = client.getCacheStats()
      expect(stats.misses).toBe(1)
      expect(stats.hits).toBe(0)
    })
  })

  describe('rate limiting edge cases', () => {
    it('should handle rate limit information with edge values', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const rateLimit = await client.getRateLimit()

      expect(rateLimit).toBeDefined()
      expect(rateLimit.core).toBeDefined()
      expect(rateLimit.search).toBeDefined()
      expect(rateLimit.graphql).toBeDefined()

      expect(typeof rateLimit.core.limit).toBe('number')
      expect(typeof rateLimit.core.remaining).toBe('number')
      expect(typeof rateLimit.core.reset).toBe('number')
    })
  })

  describe('configuration persistence', () => {
    it('should maintain configuration settings across multiple operations', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        userAgent: 'test-agent/1.0.0',
        cache: { maxAge: 300, maxSize: 50 },
      })

      // Perform multiple operations
      await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })
      await client.getUser('octocat')
      await client.searchRepositories({ q: 'test' })

      // Cache configuration should still be effective
      const stats = client.getCacheStats()
      expect(stats.maxSize).toBe(50)
      expect(stats.size).toBeGreaterThan(0)

      // Client should still be functional
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('async error propagation', () => {
    it('should properly propagate async errors with full error information', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock an error with full GitHub error structure
      const originalSafeRequest = (client as GitHubClientTest).safeRequest
      ;(client as GitHubClientTest).safeRequest = vi.fn().mockRejectedValueOnce(
        new GitHubError('Detailed error message', 'API_ERROR', 422, {
          message: 'Validation Failed',
          errors: [{ field: 'name', code: 'invalid' }],
        })
      )

      try {
        await client.getRepository({ owner: 'test', repo: 'test' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubError)
        expect((error as GitHubError).message).toBe('Detailed error message')
        expect((error as GitHubError).code).toBe('API_ERROR')
        expect((error as GitHubError).status).toBe(422)
        expect((error as GitHubError).response).toBeDefined()
      }
      // Restore original method

      ;(client as GitHubClientTest).safeRequest = originalSafeRequest
    })
  })
})
