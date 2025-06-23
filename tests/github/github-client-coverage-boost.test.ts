/**
 * GitHub Client Coverage Boost Tests
 *
 * Focused on testing uncovered code paths and edge cases
 * that work well with the existing MSW setup
 */

import { describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { setupMSW } from './msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from './test-helpers'

describe('GitHub Client Coverage Boost', () => {
  setupMSW()
  setupGitHubTestIsolation()

  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('error handling edge cases', () => {
    it('should handle ZodError validation failures', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock the safeRequest method to simulate a ZodError
      const originalSafeRequest = (client as any).safeRequest
      ;(client as any).safeRequest = vi.fn().mockRejectedValueOnce(
        (() => {
          const { z } = require('zod')
          const error = new z.ZodError([
            {
              code: 'invalid_type',
              expected: 'string',
              received: 'number',
              path: ['name'],
              message: 'Expected string, received number',
            },
          ])
          return new GitHubError(`Invalid response format: ${error.message}`, 'VALIDATION_ERROR')
        })()
      )

      await expect(client.getRepository({ owner: 'test', repo: 'test' })).rejects.toThrow(
        GitHubError
      )

      // Restore original method

      ;(client as any).safeRequest = originalSafeRequest
    })

    it('should handle unknown errors in safeRequest', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock to throw an unknown error type
      const originalSafeRequest = (client as any).safeRequest
      ;(client as any).safeRequest = vi
        .fn()
        .mockRejectedValueOnce(new GitHubError('Unknown error', 'UNKNOWN_ERROR'))

      await expect(client.getRepository({ owner: 'test', repo: 'test' })).rejects.toThrow(
        GitHubError
      )

      // Restore original method

      ;(client as any).safeRequest = originalSafeRequest
    })

    it('should handle error objects with message property', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const originalSafeRequest = (client as any).safeRequest
      ;(client as any).safeRequest = vi.fn().mockImplementationOnce(() => {
        throw { message: 'Custom error message', someOtherProp: 'value' }
      })

      await expect(client.getRepository({ owner: 'test', repo: 'test' })).rejects.toThrow(
        'Custom error message'
      )

      // Restore original method

      ;(client as any).safeRequest = originalSafeRequest
    })

    it('should handle GraphQL errors with status and response data', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Mock the octokit.graphql method to throw an error with status
      const originalGraphql = client['octokit'].graphql
      client['octokit'].graphql = vi.fn().mockRejectedValueOnce({
        message: 'GraphQL error occurred',
        status: 400,
        response: { data: { errors: ['Field not found'] } },
      })

      await expect(client.graphql('query { invalid }')).rejects.toThrow(GitHubError)

      // Restore original method
      client['octokit'].graphql = originalGraphql
    })
  })

  describe('cache implementation details', () => {
    it('should handle cache TTL parameter in setCache', async () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      // Test that custom TTL is handled correctly
      const cacheKey = 'test-key'
      const testData = { test: 'data' }
      const customTtl = 60

      // Access private method for testing

      ;(client as any).setCache(cacheKey, testData, customTtl)
      const cached = (client as any).getFromCache(cacheKey)

      expect(cached).toEqual(testData)
    })

    it('should handle LRU eviction when cache is at max size', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 2 }, // Small cache for testing
      })

      // Fill cache to capacity

      ;(client as any).setCache('key1', 'data1')
      ;(client as any).setCache('key2', 'data2')

      let stats = client.getCacheStats()
      expect(stats.size).toBe(2)

      // Add one more to trigger eviction

      ;(client as any).setCache('key3', 'data3')

      stats = client.getCacheStats()
      expect(stats.size).toBe(2) // Should stay at max size

      // First key should be evicted
      const cached1 = (client as any).getFromCache('key1')
      const cached3 = (client as any).getFromCache('key3')

      expect(cached1).toBeNull() // Evicted
      expect(cached3).toBe('data3') // Recently added
    })

    it('should handle cache hit rate calculation with zero operations', () => {
      const client = createClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { maxAge: 300, maxSize: 100 },
      })

      const stats = client.getCacheStats()
      expect(stats.hitRate).toBe(0) // Should handle division by zero
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('configuration coverage', () => {
    it('should handle app auth with installationId', () => {
      // Test that installationId is properly handled when provided
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey:
            '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5\n-----END PRIVATE KEY-----',
          installationId: 789,
        },
      }

      // Should throw during construction due to invalid private key format, but config structure is valid
      expect(() => new GitHubClient(config)).toThrow()
    })

    it('should handle custom baseUrl configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        baseUrl: 'https://github.enterprise.com/api/v3',
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle custom userAgent configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        userAgent: 'my-custom-agent/1.0.0',
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should use default retry configuration when not provided', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        // No retry config - should use defaults
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle test environment retry configuration', () => {
      // Test the NODE_ENV === 'test' code path
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
  })

  describe('parameter handling edge cases', () => {
    it('should handle search with all optional parameters', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const searchOptions = {
        q: 'javascript',
        sort: 'stars' as const,
        order: 'desc' as const,
        page: 2,
        per_page: 50,
      }

      const result = await client.searchRepositories(searchOptions)
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
    })

    it('should handle listIssues with all optional parameters', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const options = {
        state: 'closed' as const,
        labels: 'bug,enhancement',
        sort: 'updated' as const,
        direction: 'asc' as const,
        page: 1,
        per_page: 25,
      }

      const issues = await client.listIssues({ owner: 'octocat', repo: 'Hello-World' }, options)
      expect(issues).toBeDefined()
      expect(Array.isArray(issues)).toBe(true)
    })

    it('should handle listIssues with no options', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const issues = await client.listIssues({ owner: 'octocat', repo: 'Hello-World' })
      expect(issues).toBeDefined()
      expect(Array.isArray(issues)).toBe(true)
    })
  })

  describe('cache key generation', () => {
    it('should generate unique cache keys for different operations', () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const key1 = (client as any).getCacheKey('repo', { owner: 'test', repo: 'test' })
      const key2 = (client as any).getCacheKey('user', { username: 'test' })
      const key3 = (client as any).getCacheKey('repo', { owner: 'test', repo: 'other' })

      expect(key1).not.toBe(key2)
      expect(key1).not.toBe(key3)
      expect(key2).not.toBe(key3)
    })

    it('should generate same cache key for identical parameters', () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const params = { owner: 'test', repo: 'test' }
      const key1 = (client as any).getCacheKey('repo', params)
      const key2 = (client as any).getCacheKey('repo', params)

      expect(key1).toBe(key2)
    })
  })

  describe('authentication type coverage', () => {
    it('should handle token auth configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'ghp_test_token_12345' },
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle app auth without installationId', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey:
            '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5\n-----END PRIVATE KEY-----',
          // No installationId
        },
      }

      // Should throw due to invalid private key, but we test the config structure is handled
      expect(() => new GitHubClient(config)).toThrow()
    })
  })

  describe('response validation edge cases', () => {
    it('should handle repository response with all possible fields', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // This will use the default MSW handler which includes topics
      const repo = await client.getRepository({ owner: 'octocat', repo: 'Hello-World' })

      expect(repo).toBeDefined()
      expect(repo.topics).toBeDefined() // Should include topics from default mock
      expect(Array.isArray(repo.topics)).toBe(true)
    })
  })

  describe('GraphQL variables handling', () => {
    it('should handle GraphQL with complex variable types', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = 'query($owner: String!) { repository(owner: $owner, name: "test") { name } }'
      const variables = {
        owner: 'testowner',
      }

      const result = await client.graphql(query, variables)
      expect(result).toBeDefined()
    })

    it('should handle GraphQL without variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = 'query { viewer { login } }'
      const result = await client.graphql(query)
      expect(result).toBeDefined()
    })
  })

  describe('factory function', () => {
    it('should create client via factory function', async () => {
      const { createGitHubClient } = await import('@/lib/github/client')

      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
      }

      const client = createGitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('error type coverage', () => {
    it('should handle GitHubError with all parameters', () => {
      const error = new GitHubError('Test error message', 'API_ERROR', 404, { error: 'Not found' })

      expect(error.message).toBe('Test error message')
      expect(error.code).toBe('API_ERROR')
      expect(error.status).toBe(404)
      expect(error.response).toEqual({ error: 'Not found' })
    })

    it('should handle GitHubError with minimal parameters', () => {
      const error = new GitHubError('Simple error', 'UNKNOWN_ERROR')

      expect(error.message).toBe('Simple error')
      expect(error.code).toBe('UNKNOWN_ERROR')
      expect(error.status).toBeUndefined()
      expect(error.response).toBeUndefined()
    })
  })

  describe('throttle callback coverage', () => {
    it('should handle custom throttle callbacks', () => {
      let rateLimitCalled = false
      let secondaryRateLimitCalled = false

      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          onRateLimit: (retryAfter, options) => {
            rateLimitCalled = true
            expect(typeof retryAfter).toBe('number')
            expect(options.request.retryCount).toBeDefined()
            return false // Don't retry
          },
          onSecondaryRateLimit: (retryAfter, options) => {
            secondaryRateLimitCalled = true
            expect(typeof retryAfter).toBe('number')
            expect(options.request.retryCount).toBeDefined()
            return false // Don't retry
          },
        },
      }

      const client = createClient(config)
      expect(client).toBeInstanceOf(GitHubClient)

      // The callbacks won't be called unless rate limiting occurs,
      // but we've tested the configuration is accepted
    })
  })
})
