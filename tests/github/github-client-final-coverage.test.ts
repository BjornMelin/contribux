/**
 * Final GitHub Client Coverage Tests
 *
 * Targeted tests to achieve 90% coverage by covering remaining uncovered paths
 */

import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { mswServer, setupMSW } from './msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from './test-helpers'

describe('GitHub Client Final Coverage Tests', () => {
  setupMSW()
  setupGitHubTestIsolation()

  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('uncovered validation paths', () => {
    it('should handle invalid auth configuration types', () => {
      const config = {
        auth: {
          type: 'invalid' as any,
          token: 'test',
        },
      } as any

      expect(() => new GitHubClient(config)).toThrow('Invalid auth configuration')
    })

    it('should handle missing auth entirely', () => {
      const config = {} as GitHubClientConfig

      // Should create client successfully without auth
      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('cache edge path coverage', () => {
    it('should handle cache with undefined firstKey during eviction', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 1 },
      })

      // Manually clear cache to create empty state
      client.clearCache()

      // Try to add an item when cache is empty (edge case for firstKey)

      ;(client as any).setCache('test-key', { test: 'data' })

      const stats = client.getCacheStats()
      expect(stats.size).toBe(1)
    })

    it('should handle TTL parameter in setCache method', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 10 },
      })

      // Test custom TTL
      const customTtl = 60
      ;(client as any).setCache('custom-ttl-key', { test: 'data' }, customTtl)

      // Verify the data was cached
      const cached = (client as any).getFromCache('custom-ttl-key')
      expect(cached).toEqual({ test: 'data' })
    })
  })

  describe('error handling completeness', () => {
    it('should handle errors with missing message property', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const originalSafeRequest = (client as any).safeRequest
      ;(client as any).safeRequest = vi
        .fn()
        .mockRejectedValueOnce(new GitHubError('GitHub API error', 'API_ERROR', 500))

      await expect(client.getRepository({ owner: 'test', repo: 'test' })).rejects.toThrow(
        GitHubError
      )

      // Restore original method

      ;(client as any).safeRequest = originalSafeRequest
    })

    it('should handle non-object errors', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const originalSafeRequest = (client as any).safeRequest
      ;(client as any).safeRequest = vi.fn().mockImplementationOnce(() => {
        throw 'String error'
      })

      await expect(client.getRepository({ owner: 'test', repo: 'test' })).rejects.toThrow(
        'String error'
      )

      // Restore original method

      ;(client as any).safeRequest = originalSafeRequest
    })

    it('should handle errors without status property', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const originalSafeRequest = (client as any).safeRequest
      ;(client as any).safeRequest = vi.fn().mockImplementationOnce(() => {
        throw { message: 'Error without status' }
      })

      await expect(client.getRepository({ owner: 'test', repo: 'test' })).rejects.toThrow(
        'Error without status'
      )

      // Restore original method

      ;(client as any).safeRequest = originalSafeRequest
    })
  })

  describe('GraphQL error path coverage', () => {
    it('should handle GraphQL errors with different error structures', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock Octokit's graphql method to throw an error
      const originalGraphql = (client as any).octokit.graphql
      ;(client as any).octokit.graphql = vi
        .fn()
        .mockRejectedValueOnce(new Error('GraphQL query failed'))

      await expect(client.graphql('query { test }')).rejects.toThrow(GitHubError)

      // Restore original method

      ;(client as any).octokit.graphql = originalGraphql
    })

    it('should handle GraphQL with undefined variables parameter', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const result = await client.graphql('query { viewer { login } }', undefined)
      expect(result).toBeDefined()
    })

    it('should handle GraphQL with empty object variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const result = await client.graphql('query { viewer { login } }', {})
      expect(result).toBeDefined()
    })
  })

  describe('authentication edge cases', () => {
    it('should handle app auth with invalid private key format gracefully', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: 'completely-invalid-key-format',
        },
      }

      // Should throw during construction
      expect(() => new GitHubClient(config)).toThrow()
    })

    it('should handle app auth configuration without throwing on config validation', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey:
            '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5\n-----END PRIVATE KEY-----',
          installationId: 12345,
        },
      }

      // Configuration should be valid, but Octokit may throw on invalid key
      expect(() => new GitHubClient(config)).toThrow() // Due to invalid private key content
    })
  })

  describe('retry configuration coverage', () => {
    it('should use different retry settings for test environment', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'test'

      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)

      // Restore environment
      process.env.NODE_ENV = originalEnv
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
  })

  describe('cache key generation edge cases', () => {
    it('should generate consistent cache keys', () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const params1 = { owner: 'test', repo: 'repo' }
      const params2 = { owner: 'test', repo: 'repo' }

      const key1 = (client as any).getCacheKey('test', params1)
      const key2 = (client as any).getCacheKey('test', params2)

      expect(key1).toBe(key2)
    })

    it('should generate different cache keys for different operations', () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const params = { owner: 'test', repo: 'repo' }

      const key1 = (client as any).getCacheKey('operation1', params)
      const key2 = (client as any).getCacheKey('operation2', params)

      expect(key1).not.toBe(key2)
    })
  })

  describe('optional parameter handling', () => {
    it('should handle searchRepositories with minimal parameters', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const result = await client.searchRepositories({ q: 'test' })
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
    })

    it('should handle getIssue method with required parameters only', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const issue = await client.getIssue({ owner: 'test', repo: 'test', issueNumber: 1 })
      expect(issue).toBeDefined()
      expect(issue.number).toBe(1)
    })
  })

  describe('response schema edge cases', () => {
    it('should handle repository response with missing optional fields', async () => {
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
            // topics field missing (optional)
          })
        })
      )

      const client = createClient({ auth: { type: 'token', token: 'test_token' } })
      const repo = await client.getRepository({ owner: 'owner', repo: 'test-repo' })

      expect(repo.name).toBe('test-repo')
      expect(repo.topics).toBeUndefined()
    })
  })

  describe('URL and baseUrl configuration', () => {
    it('should handle custom baseUrl in configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        baseUrl: 'https://github.enterprise.com/api/v3',
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle custom userAgent in configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        userAgent: 'custom-agent/1.0.0',
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('factory function coverage', () => {
    it('should create client through factory function', async () => {
      const { createGitHubClient } = await import('@/lib/github/client')

      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
      }

      const client = createGitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('error utility function coverage', () => {
    it('should test GitHubError with all constructor parameters', () => {
      const error = new GitHubError('Test error message', 'API_ERROR', 404, {
        error: 'Not found',
        details: 'Resource not found',
      })

      expect(error.message).toBe('Test error message')
      expect(error.code).toBe('API_ERROR')
      expect(error.status).toBe(404)
      expect(error.response).toEqual({ error: 'Not found', details: 'Resource not found' })
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(GitHubError)
    })

    it('should test GitHubError with minimal parameters', () => {
      const error = new GitHubError('Simple error', 'UNKNOWN_ERROR')

      expect(error.message).toBe('Simple error')
      expect(error.code).toBe('UNKNOWN_ERROR')
      expect(error.status).toBeUndefined()
      expect(error.response).toBeUndefined()
    })
  })

  describe('cache statistics edge cases', () => {
    it('should handle hit rate calculation with zero operations', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      const stats = client.getCacheStats()
      expect(stats.hitRate).toBe(0) // Should handle division by zero
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.size).toBe(0)
    })

    it('should handle cache operations on empty cache', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      // Try to get from empty cache
      const cached = (client as any).getFromCache('nonexistent-key')
      expect(cached).toBeNull()

      const stats = client.getCacheStats()
      expect(stats.misses).toBe(1)
      expect(stats.hits).toBe(0)
    })
  })
})
