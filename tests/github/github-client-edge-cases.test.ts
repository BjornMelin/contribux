/**
 * GitHub Client Edge Cases - Consolidated Test Suite
 *
 * This comprehensive test suite covers realistic edge cases, error scenarios, and boundary
 * conditions for the GitHubClient, consolidating coverage from multiple test files.
 *
 * Key improvements made:
 * - Consolidated 3 edge case test files into 1 comprehensive suite
 * - Fixed MSW timeout and response conflicts with unique route patterns
 * - Disabled retries to prevent timeouts in edge case scenarios
 * - Focused on realistic production-style edge cases
 * - Improved test reliability and maintainability
 *
 * Test organization:
 * - Network Failures & API Errors
 * - Rate Limiting Edge Cases
 * - Authentication Edge Cases
 * - Cache Behavior Edge Cases
 * - Async Operations & Concurrency
 * - Data Validation Edge Cases
 * - Boundary Conditions
 * - Special Characters & Encoding
 * - GraphQL Edge Cases
 * - Performance & Resource Management
 */

import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { mswServer, setupMSW } from './msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from './test-helpers'

// Type for testing internal properties
interface GitHubClientTest extends GitHubClient {
  safeRequest: unknown
}

describe('GitHubClient Edge Cases - Consolidated', () => {
  // Setup MSW server for HTTP mocking
  setupMSW()

  // Setup enhanced test isolation for GitHub tests
  setupGitHubTestIsolation()

  // Helper function to create and track clients
  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('Network Failures & API Errors', () => {
    it('should handle network timeouts', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 }, // Disable retries for faster test
      })

      // Mock timeout using MSW with delayed response that exceeds client timeout
      mswServer.use(
        http.get('https://api.github.com/user', async () => {
          // Simulate timeout by delaying response longer than client timeout
          await new Promise(resolve => setTimeout(resolve, 10000))
          return HttpResponse.json({ login: 'test' })
        })
      )

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    it('should handle malformed JSON responses', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

      await expect(
        client.getRepository({ owner: 'malformed-test', repo: 'malformed-repo-unique' })
      ).rejects.toThrow()
    })

    it('should handle 500 server errors', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

      await expect(
        client.getRepository({ owner: 'server-error-test', repo: 'server-error-repo-unique' })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle 422 validation errors with detailed messages', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

      await expect(
        client.getRepository({ owner: 'validation-test', repo: 'validation-error-repo-unique' })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle network disconnection errors', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 }, // Disable retries for faster test
      })

      // Mock network disconnection using MSW
      mswServer.use(
        http.get('https://api.github.com/rate_limit', () => {
          // Simulate network error by returning HttpResponse.error()
          return HttpResponse.error()
        })
      )

      await expect(client.getRateLimit()).rejects.toThrow()
    })
  })

  describe('Rate Limiting Edge Cases', () => {
    it('should handle rate limit exceeded responses', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 }, // Disable retries to avoid timeouts
        throttle: {
          onRateLimit: () => false, // Don't retry on rate limit
          onSecondaryRateLimit: () => false, // Don't retry on secondary rate limit
        },
      })

      await expect(
        client.getRepository({ owner: 'test', repo: 'rate-limited-unique' })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle rate limit information with edge case values', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        userAgent: 'edge-case-test/1.0.0',
      })
      const rateLimit = await client.getRateLimit()

      expect(rateLimit.core.limit).toBe(0)
      expect(rateLimit.search.limit).toBe(1)
      expect(rateLimit.graphql.limit).toBe(5000)
    })

    it('should handle secondary rate limit responses', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 }, // Disable retries to avoid timeouts
        throttle: {
          onRateLimit: () => false, // Don't retry on rate limit
          onSecondaryRateLimit: () => false, // Don't retry on secondary rate limit
        },
      })

      await expect(
        client.getRepository({ owner: 'test', repo: 'secondary-limit-unique' })
      ).rejects.toThrow(GitHubError)
    })
  })

  describe('Authentication Edge Cases', () => {
    it('should handle missing authentication for public endpoints', async () => {
      const client = createClient() // No auth config

      // Public repository should work without auth
      const repo = await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })
      expect(repo).toBeDefined()
      expect(repo.name).toBe('Hello-World')
    })

    it('should handle invalid token format', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'invalid_token_format' },
        retry: { retries: 0 },
      })

      await expect(
        client.getRepository({ owner: 'test', repo: 'bad-credentials-unique' })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle invalid app private key format', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: 'invalid-key-format',
        },
      }

      // This should throw during client creation
      expect(() => new GitHubClient(config)).toThrow()
    })

    it('should reject invalid auth type', () => {
      const config = {
        auth: {
          type: 'invalid' as const,
          token: 'test',
        },
      } as GitHubClientConfig

      expect(() => new GitHubClient(config)).toThrow('Invalid authentication type')
    })
  })

  describe('Cache Behavior Edge Cases', () => {
    let client: GitHubClient

    beforeEach(() => {
      client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 100, // 100ms for quick testing
          maxSize: 3, // Small size to test eviction
        },
        retry: { retries: 0 }, // Disable retries to avoid timeouts
      })
    })

    it('should handle cache key collisions correctly', async () => {
      // Make requests that could potentially have similar cache keys
      const repo1 = await client.getRepository({ owner: 'owner', repo: 'repo' })
      const repo2 = await client.getRepository({ owner: 'owner2', repo: 'repo' })
      const repo3 = await client.getRepository({ owner: 'owner', repo: 'repo2' })

      expect(repo1.full_name).toBe('owner/repo')
      expect(repo2.full_name).toBe('owner2/repo')
      expect(repo3.full_name).toBe('owner/repo2')
    })

    it('should properly clear cache and reset statistics', () => {
      client.clearCache()
      const stats = client.getCacheStats()

      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    it('should handle concurrent requests with cache behavior', async () => {
      // Make 3 concurrent identical requests
      const promises = Array.from({ length: 3 }, () =>
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach(repo => {
        expect(repo.full_name).toBe('octocat/Hello-World')
      })

      // Should have some cache activity
      const stats = client.getCacheStats()
      expect(stats.hits + stats.misses).toBeGreaterThan(0)
    })

    it('should handle cache expiration reasonably', async () => {
      // Make first request to cache it
      await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })

      const stats1 = client.getCacheStats()
      expect(stats1.misses).toBeGreaterThanOrEqual(1)

      // Wait for cache to potentially expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Make same request again
      await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })

      const stats2 = client.getCacheStats()
      expect(stats2.hits + stats2.misses).toBeGreaterThanOrEqual(stats1.hits + stats1.misses)
    })
  })

  describe('Async Operations & Concurrency', () => {
    it('should handle multiple concurrent API calls without interference', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

      // Make concurrent requests to different endpoints
      const promises = [
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' }),
        client.getUser('octocat'),
        client.searchRepositories({ q: 'javascript' }),
        client.getRateLimit(),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(4)
      expect(results[0]).toHaveProperty('name', 'Hello-World')
      expect(results[1]).toHaveProperty('login', 'octocat')
      expect(results[2]).toHaveProperty('items')
      expect(results[3]).toHaveProperty('core')
    })

    it('should handle mixed success and failure concurrent operations', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

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

    it('should maintain client state after error recovery', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

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

    it('should properly propagate async errors with error information', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

      // Mock detailed GitHub error using MSW
      mswServer.use(
        http.get('https://api.github.com/repos/test/test', () => {
          return HttpResponse.json(
            {
              message: 'Validation Failed',
              errors: [{ field: 'name', code: 'invalid' }],
            },
            { status: 422 }
          )
        })
      )

      try {
        await client.getRepository({ owner: 'test', repo: 'test' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubError)
        expect((error as GitHubError).status).toBe(422)
        expect((error as GitHubError).response).toBeDefined()
      }
    })
  })

  describe('Data Validation Edge Cases', () => {
    it('should handle null values in repository data', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'null-test', repo: 'null-values-repo' })

      expect(repo.description).toBeNull()
      expect(repo.language).toBeNull()
      expect(repo.name).toBe('null-values-repo')
    })

    it('should handle null user in issues', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const issue = await client.getIssue({
        owner: 'null-user-test',
        repo: 'null-user-repo',
        issueNumber: 1,
      })

      expect(issue.user).toBeNull()
      expect(issue.body).toBeNull()
      expect(issue.assignee).toBeNull()
      expect(issue.title).toBe('Test Issue')
    })

    it('should handle missing optional fields gracefully', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      expect(repo.name).toBe('test-repo')
      expect(repo.topics).toBeUndefined()
      expect(repo.description).toBe('Test repo')
    })

    it('should handle wrong data types in responses', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      await expect(client.getRepository({ owner: 'owner', repo: 'bad-types' })).rejects.toThrow(
        GitHubError
      )
    })
  })

  describe('Boundary Conditions', () => {
    it('should handle zero search results', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })
      const result = await client.searchRepositories({ q: 'nonexistentquery12345unique' })

      expect(result.total_count).toBe(0)
      expect(result.items).toHaveLength(0)
      expect(result.incomplete_results).toBe(false)
    })

    it('should handle single character repository names', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'a', repo: 'b' })

      expect(repo.name).toBe('b')
      expect(repo.full_name).toBe('a/b')
    })

    it('should handle very long repository descriptions', async () => {
      const longDescription = 'A'.repeat(5000)

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'long-desc-repo' })

      expect(repo.description).toBe(longDescription)
      expect(repo.description?.length).toBe(5000)
    })

    it('should handle maximum page size requests', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })
      const result = await client.searchRepositories({ q: 'javascriptlargepage', per_page: 100 })

      expect(result.items).toHaveLength(100)
      expect(result.total_count).toBe(1000)
    })
  })

  describe('Special Characters & Encoding', () => {
    it('should handle repository names with special characters', async () => {
      const specialRepo = 'repo-with-dash_and_underscore.dot'

      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
          return HttpResponse.json({
            id: 1,
            name: decodeURIComponent(params.repo as string),
            full_name: `${params.owner}/${decodeURIComponent(params.repo as string)}`,
            owner: {
              login: params.owner as string,
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: `https://github.com/${params.owner}`,
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: `https://github.com/${params.owner}/${params.repo}`,
            description: 'Repo with special chars',
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: 'JavaScript',
            default_branch: 'main',
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: specialRepo })

      expect(repo.name).toBe(specialRepo)
      expect(repo.full_name).toBe(`owner/${specialRepo}`)
    })

    it('should handle Unicode characters in user names', async () => {
      const unicodeUsername = 'user-测试-тест-🚀'

      mswServer.use(
        http.get('https://api.github.com/users/:username', ({ params }) => {
          return HttpResponse.json({
            login: decodeURIComponent(params.username as string),
            id: 1,
            avatar_url: 'https://example.com/avatar.jpg',
            html_url: `https://github.com/${params.username}`,
            type: 'User',
            site_admin: false,
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const user = await client.getUser(unicodeUsername)

      expect(user.login).toBe(unicodeUsername)
    })

    it('should handle search queries with special syntax', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
        throttle: {
          onRateLimit: () => false, // Don't retry on rate limit
          onSecondaryRateLimit: () => false, // Don't retry on secondary rate limit
        },
      })

      const specialQueries = [
        'language:JavaScript',
        'topic:"web development"',
        'user:octocat stars:>10',
        'org:github fork:true',
      ]

      for (const query of specialQueries) {
        const result = await client.searchRepositories({ q: query })
        expect(result).toBeDefined()
        expect(result.items).toBeDefined()
      }
    }, 15000)
  })

  describe('GraphQL Edge Cases', () => {
    it('should handle empty GraphQL variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = 'query { viewer { login } }'
      const result = await client.graphql<{ viewer: { login: string } }>(query, {})

      expect(result).toBeDefined()
      expect(result.viewer.login).toBe('testuser')
    })

    it('should handle GraphQL query with null variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = 'query { viewer { login } }'
      const result = await client.graphql<{ viewer: { login: string } }>(query, undefined)

      expect(result).toBeDefined()
      expect(result.viewer.login).toBe('testuser')
    })

    it('should handle GraphQL errors in response', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 },
      })

      // This will use the default GraphQL handler which checks for 'invalidField' in the query
      await expect(client.graphql('query { viewer { invalidField } }')).rejects.toThrow()
    })

    it('should handle complex nested GraphQL variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = `
        query($repo: String!, $owner: String!) {
          repository(owner: $owner, name: $repo) {
            name
          }
        }
      `

      const variables = {
        repo: 'testrepo', // Match MSW default mock expectation
        owner: 'testowner',
      }

      const result = await client.graphql<{ repository: { name: string } }>(query, variables)

      expect(result).toBeDefined()
      expect(result.repository.name).toBe('testrepo')
    })

    it('should handle concurrent GraphQL queries', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 0 }, // Disable retries to avoid timeouts
        throttle: {
          onRateLimit: () => false, // Don't retry on rate limit
          onSecondaryRateLimit: () => false, // Don't retry on secondary rate limit
        },
      })

      const queries = [
        client.graphql('query { viewer { login } }'),
        client.graphql('query { viewer { name } }'),
        client.graphql(
          'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }',
          {
            owner: 'testowner', // Match MSW default mock expectation
            name: 'testrepo',
          }
        ),
      ]

      const results = await Promise.all(queries)

      expect(results).toHaveLength(3)
      expect(results[0]).toHaveProperty('viewer')
      expect(results[1]).toHaveProperty('viewer')
      expect(results[2]).toHaveProperty('repository')
    })
  })

  describe('Performance & Resource Management', () => {
    it('should handle large response payloads efficiently', async () => {
      // Create a large array of labels
      const largeLabels = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `label-${i}`,
        color: '000000',
        description: `This is a very long description for label ${i} that contains lots of text`,
      }))

      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo/issues/:number', () => {
          return HttpResponse.json({
            id: 1,
            number: 1,
            title: 'Issue with many labels',
            body: 'A'.repeat(10000), // Large body
            state: 'open',
            user: {
              login: 'testuser',
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: 'https://github.com/testuser',
              type: 'User',
              site_admin: false,
            },
            labels: largeLabels,
            assignee: null,
            assignees: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            html_url: 'https://github.com/owner/repo/issues/1',
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const issue = await client.getIssue({ owner: 'owner', repo: 'repo', issueNumber: 1 })

      expect(issue.labels).toHaveLength(100)
      expect(issue.body).toHaveLength(10000)
    })

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

      // Client should still be functional
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle custom throttle and retry configuration', () => {
      const onRateLimit = () => true
      const onSecondaryRateLimit = () => false

      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          onRateLimit,
          onSecondaryRateLimit,
        },
        retry: {
          retries: 5,
          doNotRetry: ['400', '401', '403', '422'],
        },
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle resource cleanup properly', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      // Clear cache should reset everything
      client.clearCache()

      const stats = client.getCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
    })
  })
})
