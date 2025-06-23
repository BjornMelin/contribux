/**
 * Focused GitHub Client Edge Case Tests
 *
 * Tests for specific edge cases and boundary conditions to improve coverage
 */

import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { mswServer, setupMSW } from './msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from './test-helpers'

describe('GitHub Client Focused Edge Cases', () => {
  setupMSW()
  setupGitHubTestIsolation()

  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('null value handling', () => {
    it('should handle null values in API responses correctly', async () => {
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

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      expect(repo.description).toBeNull()
      expect(repo.language).toBeNull()
      expect(repo.name).toBe('test-repo')
    })

    it('should handle null assignee and user fields in issues', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo/issues/:number', () => {
          return HttpResponse.json({
            id: 1,
            number: 1,
            title: 'Test Issue',
            body: null,
            state: 'open',
            user: null, // Edge case: null user
            labels: [],
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

      expect(issue.user).toBeNull()
      expect(issue.body).toBeNull()
      expect(issue.assignee).toBeNull()
      expect(issue.title).toBe('Test Issue')
    })
  })

  describe('boundary conditions', () => {
    it('should handle zero search results', async () => {
      mswServer.use(
        http.get('https://api.github.com/search/repositories', () => {
          return HttpResponse.json({
            total_count: 0,
            incomplete_results: false,
            items: [],
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const result = await client.searchRepositories({ q: 'nonexistentquery12345' })

      expect(result.total_count).toBe(0)
      expect(result.items).toHaveLength(0)
      expect(result.incomplete_results).toBe(false)
    })

    it('should handle single character repository names', async () => {
      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
          return HttpResponse.json({
            id: 1,
            name: params.repo,
            full_name: `${params.owner}/${params.repo}`,
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
            description: 'Single char repo',
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
      const repo = await client.getRepository({ owner: 'a', repo: 'b' })

      expect(repo.name).toBe('b')
      expect(repo.full_name).toBe('a/b')
    })

    it('should handle very long repository descriptions', async () => {
      const longDescription = 'A'.repeat(5000)

      mswServer.use(
        http.get('https://api.github.com/repos/:owner/:repo', () => {
          return HttpResponse.json({
            id: 1,
            name: 'long-desc-repo',
            full_name: 'owner/long-desc-repo',
            owner: {
              login: 'owner',
              id: 1,
              avatar_url: 'https://example.com/avatar.jpg',
              html_url: 'https://github.com/owner',
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: 'https://github.com/owner/long-desc-repo',
            description: longDescription,
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
      const repo = await client.getRepository({ owner: 'owner', repo: 'long-desc-repo' })

      expect(repo.description).toBe(longDescription)
      expect(repo.description?.length).toBe(5000)
    })
  })

  describe('error handling edge cases', () => {
    it('should handle malformed JSON in error responses', async () => {
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          return new HttpResponse('{"invalid": json}', {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    it('should handle 422 validation errors with detailed messages', async () => {
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
                  message: 'name is invalid',
                },
              ],
            },
            { status: 422 }
          )
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      await expect(client.getRepository({ owner: 'invalid', repo: 'invalid!' })).rejects.toThrow(
        GitHubError
      )
    })

    it('should handle rate limit exceeded with proper headers', async () => {
      mswServer.use(
        http.get('https://api.github.com/user', () => {
          return HttpResponse.json(
            {
              message: 'API rate limit exceeded for user ID 1.',
              documentation_url: 'https://docs.github.com/rest#rate-limiting',
            },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': '60',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
                'X-RateLimit-Used': '60',
              },
            }
          )
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      await expect(client.getAuthenticatedUser()).rejects.toThrow(GitHubError)
    })
  })

  describe('cache behavior edge cases', () => {
    it('should handle cache key collisions correctly', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 10 },
      })

      // Make requests that could potentially have similar cache keys
      const repo1 = await client.getRepository({ owner: 'owner', repo: 'repo' })
      const repo2 = await client.getRepository({ owner: 'owner2', repo: 'repo' })
      const repo3 = await client.getRepository({ owner: 'owner', repo: 'repo2' })

      expect(repo1.full_name).toBe('owner/repo')
      expect(repo2.full_name).toBe('owner2/repo')
      expect(repo3.full_name).toBe('owner/repo2')
    })

    it('should properly clear cache and reset statistics', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 10 },
      })

      client.clearCache()
      const stats = client.getCacheStats()

      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
      expect(stats.maxSize).toBe(10)
    })
  })

  describe('configuration edge cases', () => {
    it('should handle missing auth configuration gracefully', () => {
      const client = createClient() // No auth

      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getUser).toBeDefined()
      expect(client.getRepository).toBeDefined()
    })

    it('should handle custom throttle configuration', () => {
      const onRateLimit = () => true
      const onSecondaryRateLimit = () => false

      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          onRateLimit,
          onSecondaryRateLimit,
        },
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle custom retry configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 5,
          doNotRetry: ['400', '401', '403', '422'],
        },
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should throw error for invalid auth type', () => {
      const config = {
        auth: {
          type: 'invalid' as any,
          token: 'test',
        },
      } as any

      expect(() => new GitHubClient(config)).toThrow('Invalid auth configuration')
    })
  })

  describe('GraphQL edge cases', () => {
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
        repo: 'test-repo',
        owner: 'test-owner',
      }

      const result = await client.graphql<{ repository: { name: string } }>(query, variables)

      expect(result).toBeDefined()
      expect(result.repository.name).toBe('test-repo')
    })
  })

  describe('validation edge cases', () => {
    it('should handle response with unexpected extra fields', async () => {
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
            description: 'Test repo',
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: 'JavaScript',
            default_branch: 'main',
            // Extra unexpected fields
            extra_field: 'should be ignored',
            another_field: { nested: 'data' },
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      // Should still work despite extra fields
      expect(repo.name).toBe('test-repo')
      expect(repo.description).toBe('Test repo')
    })

    it('should handle missing optional topics field', async () => {
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
            description: 'Test repo',
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: 'JavaScript',
            default_branch: 'main',
            // topics field is missing (optional)
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      expect(repo.name).toBe('test-repo')
      expect(repo.topics).toBeUndefined()
    })
  })

  describe('special characters and encoding', () => {
    it('should handle special characters in repository names', async () => {
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
  })

  describe('rate limit information edge cases', () => {
    it('should handle rate limit with edge case values', async () => {
      mswServer.use(
        http.get('https://api.github.com/rate_limit', () => {
          return HttpResponse.json({
            core: {
              limit: 0, // Edge case: zero limit
              remaining: 0,
              reset: Math.floor(Date.now() / 1000),
            },
            search: {
              limit: 1, // Edge case: minimal limit
              remaining: 1,
              reset: Math.floor(Date.now() / 1000) + 60,
            },
            graphql: {
              limit: 5000,
              remaining: 5000,
              reset: Math.floor(Date.now() / 1000) + 3600,
            },
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const rateLimit = await client.getRateLimit()

      expect(rateLimit.core.limit).toBe(0)
      expect(rateLimit.search.limit).toBe(1)
      expect(rateLimit.graphql.limit).toBe(5000)
    })
  })
})
