/**
 * Modern GitHub Client Tests - Vitest 3.2+ Patterns
 * 
 * Features:
 * - MSW 2.x for HTTP mocking (replaces nock)
 * - Property-based testing with @fast-check/vitest
 * - test.extend for fixtures
 * - test.each for parametric testing
 * - Modern async/await patterns
 * - Enhanced error testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fc, test as fcTest } from '@fast-check/vitest'
import { GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import type { GitHubClientConfig } from '@/lib/github/client'
import { setupMSW, mockGitHubAPI } from './msw-setup'

// Setup MSW for HTTP mocking
setupMSW()

// Test fixtures using test.extend pattern
const testFixtures = {
  githubClient: ({ task }) => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' }
    })
    
    // Cleanup after test
    task.meta.cleanup = () => {
      client.clearCache()
    }
    
    return client
  },
  
  authConfigs: () => [
    { type: 'token' as const, token: 'ghp_test_token' },
    { type: 'token' as const, token: 'github_pat_11ABC123456789' }
  ]
}

describe('GitHubClient - Modern Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initialization', () => {
    it('should create client with token authentication', () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' }
      })
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getCacheStats).toBeDefined()
    })

    // Parametric testing with test.each
    it.each(testFixtures.authConfigs())('should create client with %s authentication', (authConfig) => {
      const config: GitHubClientConfig = { auth: authConfig }
      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    // Property-based testing for configuration validation
    fcTest.prop([
      fc.record({
        auth: fc.constant({ type: 'token', token: 'ghp_test_token' }),
        baseUrl: fc.webUrl(),
        userAgent: fc.string({ minLength: 1, maxLength: 100 })
      })
    ])('should handle valid configuration properties', (config) => {
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should use default configuration when none provided', () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' }
      })
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getCacheStats().maxSize).toBe(1000)
    })
  })

  describe('REST API Operations', () => {
    it('should get authenticated user', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const user = await client.getAuthenticatedUser()
      
      expect(user).toMatchObject({
        login: 'testuser',
        id: 123
      })
    })

    it('should get repository information', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const repo = await client.getRepository({ owner: 'testowner', repo: 'testrepo' })
      
      expect(repo).toMatchObject({
        name: 'testrepo',
        owner: { login: 'testowner' },
        full_name: 'testowner/testrepo'
      })
    })

    it('should get user by username', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const user = await client.getUser('testuser')
      
      expect(user).toMatchObject({
        login: 'testuser',
        id: expect.any(Number)
      })
    })

    // Property-based testing for repository operations
    fcTest.prop([
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$/),
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/)
    ])('should handle repository requests with valid names', async (owner, repo) => {
      mockGitHubAPI.mockRepository(owner, repo)
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const response = await client.getRepository({ owner, repo })
      
      expect(response).toMatchObject({
        name: repo,
        owner: { login: owner },
        full_name: `${owner}/${repo}`
      })
    })
  })

  describe('GraphQL Operations', () => {
    it('should execute GraphQL queries successfully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = 'query { viewer { login name } }'
      const result = await client.graphql(query)

      expect(result).toMatchObject({
        viewer: {
          login: 'testuser',
          name: expect.any(String)
        }
      })
    })

    it('should handle GraphQL errors', async () => {
      const errors = [{
        message: 'Field "invalidField" doesn\'t exist on type "User"',
        locations: [{ line: 1, column: 15 }]
      }]
      
      mockGitHubAPI.mockGraphQL(null, errors)
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = 'query { viewer { invalidField } }'
      
      await expect(client.graphql(query)).rejects.toThrow(GitHubError)
    })

    it('should pass variables to GraphQL queries', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = `
        query($owner: String!, $name: String!) { 
          repository(owner: $owner, name: $name) { name } 
        }
      `
      const variables = { owner: 'testowner', name: 'test-repo' }
      
      const result = await client.graphql(query, variables)
      expect(result).toMatchObject({
        repository: {
          name: 'test-repo'
        }
      })
    })

    // Property-based testing for GraphQL variable validation
    fcTest.prop([
      fc.record({
        owner: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$/),
        name: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/)
      })
    ], { numRuns: 5 })('should handle various GraphQL variable types', async (variables) => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = 'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }'
      
      // Should not throw for valid variable structures
      await expect(client.graphql(query, variables)).resolves.toBeDefined()
    })
  })

  describe('Rate Limiting', () => {
    it('should retrieve rate limit information', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const rateLimit = await client.getRateLimit()
      
      expect(rateLimit).toMatchObject({
        core: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number)
        },
        search: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number)
        },
        graphql: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number)
        }
      })
    })

    it('should handle rate limit exceeded responses', async () => {
      mockGitHubAPI.mockRateLimitError()
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockGitHubAPI.mockNetworkError()
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    // Property-based testing for error message formatting
    fcTest.prop([
      fc.string({ minLength: 1, maxLength: 100 })
    ])('should preserve error messages in client errors', (errorMessage) => {
      const error = new GitHubError(errorMessage, 'TEST_ERROR')
      
      expect(error.message).toBe(errorMessage)
      expect(error.name).toBe('GitHubError')
      expect(error.code).toBe('TEST_ERROR')
    })
  })

  describe('Configuration Edge Cases', () => {
    // Test boundary conditions with property-based testing
    fcTest.prop([
      fc.webUrl(),
      fc.string({ minLength: 1, maxLength: 200 })
    ])('should handle various base URLs and user agents', (baseUrl, userAgent) => {
      const config: GitHubClientConfig = { 
        auth: { type: 'token', token: 'ghp_test_token' },
        baseUrl, 
        userAgent 
      }
      
      expect(() => new GitHubClient(config)).not.toThrow()
    })
  })

  describe('Pagination', () => {
    it('should handle search operations', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const searchOptions = {
        q: 'test',
        sort: 'stars',
        order: 'desc' as const,
        page: 1,
        per_page: 10
      }

      const result = await client.searchRepositories(searchOptions)
      
      expect(result).toMatchObject({
        total_count: expect.any(Number),
        incomplete_results: expect.any(Boolean),
        items: expect.any(Array)
      })
    })
  })
})

// Additional test suite for integration patterns
describe('GitHubClient Integration', () => {
  it('should work with real-world authentication patterns', async () => {
    const authPatterns = [
      { type: 'token' as const, token: 'ghp_' + 'x'.repeat(36) },
      { type: 'token' as const, token: 'github_pat_' + 'x'.repeat(70) }
    ]

    for (const auth of authPatterns) {
      const client = new GitHubClient({ auth })
      expect(client).toBeInstanceOf(GitHubClient)
    }
  })

  it('should handle concurrent requests properly', async () => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' }
    })

    // Simulate concurrent requests
    const requests = Array.from({ length: 5 }, () => 
      client.getAuthenticatedUser()
    )

    const responses = await Promise.allSettled(requests)
    
    // All should succeed
    expect(responses.every(r => r.status === 'fulfilled')).toBe(true)
  })
})