/**
 * GitHub Client Edge Case Tests
 *
 * This test suite focuses on edge cases, error scenarios, and boundary conditions
 * to achieve comprehensive test coverage for the GitHubClient.
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

describe('GitHubClient Edge Cases', () => {
  // Setup MSW server for HTTP mocking
  setupMSW()

  // Setup enhanced test isolation for GitHub tests
  setupGitHubTestIsolation()

  // Helper function to create and track clients
  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('null and undefined handling', () => {
    it('should handle null values in repository description', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', () => {
          return HttpResponse.json({
            id: 1,
            name: 'test-repo',
            full_name: 'owner/test-repo',
            owner: {
              login: 'owner',
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: 'https://github.com/owner',
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: 'https://github.com/owner/test-repo',
            description: null, // Edge case: null description
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: null, // Edge case: null language
            default_branch: 'main',
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      expect(repo.description).toBeNull()
      expect(repo.language).toBeNull()
    })

    it('should handle undefined optional fields', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', () => {
          return HttpResponse.json({
            id: 1,
            name: 'test-repo',
            full_name: 'owner/test-repo',
            owner: {
              login: 'owner',
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: 'https://github.com/owner',
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: 'https://github.com/owner/test-repo',
            description: null,
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: null,
            default_branch: 'main',
            // topics is optional and missing
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      expect(repo.topics).toBeUndefined()
    })

    it('should handle null user in issues', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo/issues/:number', () => {
          return HttpResponse.json({
            id: 1,
            number: 1,
            title: 'Test Issue',
            body: null,
            state: 'open',
            user: null, // Edge case: anonymous/deleted user
            labels: [],
            assignee: null,
            assignees: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            html_url: 'https://github.com/owner/repo/issues/1',
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const issue = await client.getIssue({ owner: 'owner', repo: 'repo', issueNumber: 1 })

      expect(issue.user).toBeNull()
      expect(issue.body).toBeNull()
      expect(issue.assignee).toBeNull()
    })
  })

  describe('boundary conditions', () => {
    it('should handle zero results in search', async () => {
      mswServer.use(
        http.get('https://api.github.com/search/repositories', () => {
          return HttpResponse.json({
            total_count: 0,
            incomplete_results: false,
            items: [],
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const result = await client.searchRepositories({ q: 'nonexistentrepoquery12345' })

      expect(result.total_count).toBe(0)
      expect(result.items).toHaveLength(0)
      expect(result.incomplete_results).toBe(false)
    })

    it('should handle maximum page size', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `repo-${i + 1}`,
        full_name: `owner/repo-${i + 1}`,
        owner: {
          login: 'owner',
          id: 1,
          avatar_url: 'https://example.com/avatar.jpg',
          html_url: 'https://github.com/owner',
          type: 'User',
          site_admin: false,
        },
        private: false,
        html_url: `https://github.com/owner/repo-${i + 1}`,
        description: `Description ${i + 1}`,
        fork: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        stargazers_count: i,
        forks_count: i,
        language: 'JavaScript',
        default_branch: 'main',
      }))

      mswServer.use(
        http.get('https://api.github.com/search/repositories', () => {
          return HttpResponse.json({
            total_count: 1000,
            incomplete_results: false,
            items,
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const result = await client.searchRepositories({ q: 'javascript', per_page: 100 })

      expect(result.items).toHaveLength(100)
      expect(result.total_count).toBe(1000)
    })

    it('should handle empty string queries', async () => {
      mswServer.use(
        http.get('https://api.github.com/search/repositories', () => {
          return HttpResponse.json({
            total_count: 0,
            incomplete_results: false,
            items: [],
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const result = await client.searchRepositories({ q: '' })

      expect(result.total_count).toBe(0)
      expect(result.items).toHaveLength(0)
    })
  })

  describe('network and API errors', () => {
    it('should handle network timeouts', async () => {
      mswServer.use(
        http.get('https://api.github.com/user', async () => {
          await new Promise(resolve => setTimeout(resolve, 5000))
          return HttpResponse.json({})
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      // This will timeout in real scenarios, but for testing we'll mock a timeout error
      vi.spyOn(client as GitHubClientTest, 'safeRequest').mockRejectedValueOnce(
        new Error('ETIMEDOUT')
      )

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    it('should handle malformed JSON responses', async () => {
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          return new HttpResponse('{"invalid": json}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    it('should handle 500 server errors', async () => {
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.getAuthenticatedUser()).rejects.toThrow(GitHubError)
    })

    it('should handle 422 validation errors', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', () => {
          return HttpResponse.json(
            {
              message: 'Validation Failed',
              errors: [
                {
                  resource: 'Repository',
                  field: 'name',
                  code: 'invalid',
                },
              ],
            },
            { status: 422 }
          )
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.getRepository({ owner: 'invalid', repo: 'invalid' })).rejects.toThrow(
        GitHubError
      )
    })

    it('should handle rate limit response headers', async () => {
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': '60',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
            }
          )
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })
  })

  describe('cache edge cases', () => {
    let client: GitHubClient

    beforeEach(() => {
      client = createClient({
        auth: { type: 'token', token: 'test' },
        cache: {
          maxAge: 1, // 1 second for quick expiration testing
          maxSize: 3, // Small size to test eviction
        },
      })
    })

    it('should evict least recently used entries when cache is full', async () => {
      // Fill cache with 3 different repositories
      await client.getRepository({ owner: 'owner1', repo: 'repo1' })
      await client.getRepository({ owner: 'owner2', repo: 'repo2' })
      await client.getRepository({ owner: 'owner3', repo: 'repo3' })

      const stats1 = client.getCacheStats()
      expect(stats1.size).toBe(3)

      // Add a 4th repository, should evict the first
      await client.getRepository({ owner: 'owner4', repo: 'repo4' })

      const stats2 = client.getCacheStats()
      expect(stats2.size).toBe(3)
    })

    it('should handle expired cache entries', async () => {
      // Make first request to cache it
      await client.getRepository({ owner: 'owner', repo: 'repo' })

      const stats1 = client.getCacheStats()
      expect(stats1.hits).toBe(0)
      expect(stats1.misses).toBe(1)

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Make same request again - should miss cache due to expiration
      await client.getRepository({ owner: 'owner', repo: 'repo' })

      const stats2 = client.getCacheStats()
      expect(stats2.hits).toBe(0)
      expect(stats2.misses).toBe(2)
    })

    it('should clear cache statistics correctly', () => {
      client.clearCache()
      const stats = client.getCacheStats()

      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    it('should calculate hit rate correctly', async () => {
      // First request - cache miss
      await client.getRepository({ owner: 'owner', repo: 'repo' })

      // Second request - cache hit
      await client.getRepository({ owner: 'owner', repo: 'repo' })

      // Third request - cache hit
      await client.getRepository({ owner: 'owner', repo: 'repo' })

      const stats = client.getCacheStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.667, 2)
    })
  })

  describe('GraphQL edge cases', () => {
    it('should handle complex GraphQL variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test' } })

      const query = `
        query($owner: String!, $name: String!, $first: Int!, $after: String) {
          repository(owner: $owner, name: $name) {
            issues(first: $first, after: $after, states: [OPEN, CLOSED]) {
              nodes {
                id
                title
              }
            }
          }
        }
      `

      const variables = {
        owner: 'octocat',
        name: 'Hello-World',
        first: 10,
        after: null,
      }

      const result = await client.graphql(query, variables)
      expect(result).toBeDefined()
    })

    it('should handle GraphQL errors in response', async () => {
      mswServer.use(
        http.post('https://api.github.com/graphql', () => {
          return HttpResponse.json({
            data: null,
            errors: [
              {
                message: 'Field "invalidField" doesn\'t exist on type "User"',
                path: ['viewer', 'invalidField'],
                locations: [{ line: 1, column: 20 }],
              },
            ],
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.graphql('query { viewer { invalidField } }')).rejects.toThrow()
    })

    it('should handle partial GraphQL responses with errors', async () => {
      mswServer.use(
        http.post('https://api.github.com/graphql', () => {
          return HttpResponse.json({
            data: {
              viewer: {
                login: 'testuser',
              },
            },
            errors: [
              {
                message: 'Resource not accessible',
                path: ['viewer', 'privateData'],
              },
            ],
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      // GraphQL typically returns partial data even with errors
      const result = await client.graphql<{ viewer: { login: string } }>(
        'query { viewer { login privateData } }'
      )

      expect(result.viewer.login).toBe('testuser')
    })
  })

  describe('concurrent operations', () => {
    it('should handle multiple concurrent requests', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test' } })

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

    it('should handle concurrent requests to same endpoint', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test' } })

      // Make 5 concurrent requests to the same endpoint
      const promises = Array.from({ length: 5 }, () =>
        client.getRepository({ owner: 'octocat', repo: 'Hello-World' })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      results.forEach(repo => {
        expect(repo.full_name).toBe('octocat/Hello-World')
      })

      // Due to caching, we should have 1 miss and 4 hits
      const stats = client.getCacheStats()
      expect(stats.hits).toBe(4)
      expect(stats.misses).toBe(1)
    })
  })

  describe('authentication edge cases', () => {
    it('should handle missing authentication', async () => {
      const client = createClient() // No auth config

      // GitHub allows some unauthenticated requests
      const repo = await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })
      expect(repo).toBeDefined()
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

    it('should handle app auth without installation ID', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey:
            '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG\n-----END PRIVATE KEY-----',
        },
      }

      // Should create client successfully but may fail on API calls
      expect(() => new GitHubClient(config)).not.toThrow()
    })
  })

  describe('special characters and encoding', () => {
    it('should handle repository names with special characters', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
          const { owner, repo } = params
          return HttpResponse.json({
            id: 1,
            name: decodeURIComponent(repo as string),
            full_name: `${owner}/${decodeURIComponent(repo as string)}`,
            owner: {
              login: owner as string,
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: `https://github.com/${owner}`,
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: `https://github.com/${owner}/${repo}`,
            description: 'Test repo with special chars',
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

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const repo = await client.getRepository({
        owner: 'owner',
        repo: 'repo-with-dash_and_underscore.dot',
      })

      expect(repo.name).toBe('repo-with-dash_and_underscore.dot')
    })

    it('should handle search queries with special characters', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test' } })

      const specialQueries = [
        'language:C++',
        'topic:"machine learning"',
        'user:octocat stars:>100',
        'org:github fork:true',
      ]

      for (const query of specialQueries) {
        const result = await client.searchRepositories({ q: query })
        expect(result).toBeDefined()
        expect(result.items).toBeDefined()
      }
    })
  })

  describe('performance thresholds', () => {
    it('should handle large response payloads', async () => {
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

      const client = createClient({ auth: { type: 'token', token: 'test' } })
      const issue = await client.getIssue({ owner: 'owner', repo: 'repo', issueNumber: 1 })

      expect(issue.labels).toHaveLength(100)
      expect(issue.body).toHaveLength(10000)
    })
  })

  describe('validation edge cases', () => {
    it('should handle missing required fields gracefully', async () => {
      mswServer.use(
        http.get('https://api.github.com/users/:username', () => {
          return HttpResponse.json({
            // Missing required fields like login, id
            avatar_url: 'https://example.com/avatar.jpg',
            html_url: 'https://github.com/user',
            type: 'User',
            site_admin: false,
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.getUser('testuser')).rejects.toThrow(GitHubError)
    })

    it('should handle wrong data types in responses', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', () => {
          return HttpResponse.json({
            id: 'not-a-number', // Should be number
            name: 123, // Should be string
            full_name: 'owner/repo',
            owner: {
              login: 'owner',
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: 'https://github.com/owner',
              type: 'User',
              site_admin: 'yes', // Should be boolean
            },
            private: false,
            html_url: 'https://github.com/owner/repo',
            description: null,
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: '100', // Should be number
            forks_count: 0,
            language: null,
            default_branch: 'main',
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test' } })

      await expect(client.getRepository({ owner: 'owner', repo: 'repo' })).rejects.toThrow(
        GitHubError
      )
    })
  })
})
