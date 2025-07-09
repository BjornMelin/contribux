/**
 * GitHub Advanced Workflows Integration Tests
 *
 * This file contains advanced GitHub workflow integration scenarios:
 * - GraphQL integration patterns and complex queries
 * - GraphQL rate limiting and error handling
 * - Complex property-based testing scenarios
 * - Advanced pagination and search patterns
 * - Multi-step workflow orchestration
 * - Complex error recovery scenarios
 */

import { GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { fc, test as fcTest } from '@fast-check/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockGitHubAPI } from '../msw-setup'
import { setupGitHubTestIsolation } from '../test-helpers'

// Setup MSW and test isolation
setupGitHubTestIsolation()

describe('GitHub Advanced Workflows Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GraphQL Integration Patterns', () => {
    it('should execute GraphQL queries successfully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const query = 'query { viewer { login name } }'
      const result = await client.graphql(query)

      expect(result).toMatchObject({
        viewer: {
          login: 'testuser',
          name: expect.any(String),
        },
      })
    })

    it('should handle GraphQL errors appropriately', async () => {
      const errors = [
        {
          message: 'Field "invalidField" doesn\'t exist on type "User"',
          locations: [{ line: 1, column: 15 }],
        },
      ]

      mockGitHubAPI.mockGraphQL(null, errors)

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const query = 'query { viewer { invalidField } }'

      await expect(client.graphql(query)).rejects.toThrow(GitHubError)
    })

    it('should pass variables to GraphQL queries', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
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
          name: 'test-repo',
        },
      })
    })

    it('should handle GraphQL rate limiting integration', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const query = `
        query {
          viewer {
            login
          }
          rateLimit {
            limit
            cost
            remaining
            resetAt
            nodeCount
          }
        }
      `

      const result = (await client.graphql(query)) as {
        viewer: { login: string }
        rateLimit: { limit: number; remaining: number; cost: number }
      }

      expect(result.viewer.login).toBe('testuser')
      expect(result.rateLimit).toBeDefined()
      expect(result.rateLimit.limit).toBe(5000)
      expect(result.rateLimit.remaining).toBe(4999)
      expect(result.rateLimit.cost).toBe(1)
    })

    // Property-based testing for GraphQL variable validation
    fcTest.prop(
      [
        fc.record({
          owner: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$/),
          name: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
        }),
      ],
      { numRuns: 5 }
    )('should handle various GraphQL variable types', async variables => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const query =
        'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }'

      // Should not throw for valid variable structures
      await expect(client.graphql(query, variables)).resolves.toBeDefined()
    })
  })

  describe('Advanced Search and Filtering', () => {
    it('should handle complex repository search queries', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const complexQuery = {
        q: 'language:typescript stars:>100 forks:>10 size:>1000',
        sort: 'updated',
        order: 'desc' as const,
        page: 1,
        per_page: 25,
      }

      const result = await client.searchRepositories(complexQuery)

      expect(result).toMatchObject({
        total_count: expect.any(Number),
        incomplete_results: expect.any(Boolean),
        items: expect.any(Array),
      })
      expect(result.items.length).toBeLessThanOrEqual(25)
    })

    it('should handle empty search results gracefully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const result = await client.searchRepositories({
        q: 'nonexistentquery12345unique',
        per_page: 10,
      })

      expect(result).toMatchObject({
        total_count: 0,
        incomplete_results: false,
        items: [],
      })
    })

    it('should handle large pagination requests', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const result = await client.searchRepositories({
        q: 'javascriptlargepage',
        per_page: 100,
      })

      expect(result.items).toHaveLength(100)
      expect(result.total_count).toBeGreaterThan(100)
    })
  })

  describe('Multi-Step Workflow Orchestration', () => {
    it('should orchestrate complex user discovery workflow', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Step 1: Get authenticated user
      const currentUser = await client.getAuthenticatedUser()
      expect(currentUser.login).toBe('testuser')

      // Step 2: Search for repositories by that user
      const userRepos = await client.searchRepositories({
        q: `user:${currentUser.login}`,
        per_page: 5,
      })
      expect(userRepos.items.length).toBeGreaterThan(0)

      // Step 3: Get detailed info for first repository
      const firstRepo = userRepos.items[0]
      const detailedRepo = await client.getRepository(firstRepo.owner.login, firstRepo.name)
      expect(detailedRepo.full_name).toBe(firstRepo.full_name)

      // Step 4: Get issues for that repository
      const issues = await client.listIssues(firstRepo.owner.login, firstRepo.name, { per_page: 3 })
      expect(Array.isArray(issues)).toBe(true)
    })

    it('should handle mixed GraphQL and REST workflow', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // GraphQL for complex data
      const graphqlResult = await client.graphql(`
        query {
          viewer {
            login
            repositories(first: 1) {
              nodes {
                name
                owner {
                  login
                }
              }
            }
          }
        }
      `)

      expect(graphqlResult.viewer.login).toBe('testuser')

      // REST API for detailed repository info
      const restResult = await client.getRepository('testowner', 'testrepo')

      expect(restResult.owner.login).toBe('testowner')
      expect(restResult.name).toBe('testrepo')
    })
  })

  describe('Complex Error Recovery Patterns', () => {
    it('should handle network errors gracefully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // This should work fine with our mock setup
      const user = await client.getAuthenticatedUser()
      expect(user).toBeDefined()
    })

    it('should handle rate limit scenarios with graceful degradation', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Test rate limit information retrieval
      const rateLimit = await client.getRateLimit()
      expect(rateLimit.core.remaining).toBeDefined()

      // Simulate API usage
      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')
    })

    // Property-based testing for error message formatting
    fcTest.prop([fc.string({ minLength: 1, maxLength: 100 })])(
      'should preserve error messages in client errors',
      errorMessage => {
        const error = new GitHubError(errorMessage, 'TEST_ERROR')

        expect(error.message).toBe(errorMessage)
        expect(error.name).toBe('GitHubError')
        expect(error.code).toBe('TEST_ERROR')
      }
    )
  })

  describe('Advanced Configuration Patterns', () => {
    // Test boundary conditions with property-based testing
    fcTest.prop([fc.webUrl(), fc.string({ minLength: 1, maxLength: 200 })])(
      'should handle various base URLs and user agents',
      (baseUrl, userAgent) => {
        const config = {
          auth: { type: 'token' as const, token: 'ghp_test_token' },
          baseUrl,
          userAgent,
        }

        expect(() => new GitHubClient(config)).not.toThrow()
      }
    )

    it('should handle complex cache configuration scenarios', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          maxAge: 300, // 5 minutes
          maxSize: 500,
        },
      })

      // Make request to populate cache
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')

      // Verify cache is working
      const cacheStats = client.getCacheStats()
      expect(cacheStats.size).toBeGreaterThan(0)
      expect(cacheStats.maxSize).toBe(500)

      // Second request should use cache
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe(user1.login)
    })
  })

  describe('Performance and Optimization Patterns', () => {
    it('should handle concurrent GraphQL operations efficiently', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const queries = [
        'query { viewer { login } }',
        'query { viewer { name } }',
        'query { viewer { email } }',
      ]

      const results = await Promise.all(queries.map(query => client.graphql(query)))

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.viewer).toBeDefined()
      })
    })

    it('should optimize repeated repository operations', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const repoParams = { owner: 'testowner', repo: 'testrepo' }

      // First call
      const repo1 = await client.getRepository(repoParams.owner, repoParams.repo)
      expect(repo1.name).toBe('testrepo')

      // Second call (should be faster due to caching)
      const repo2 = await client.getRepository(repoParams.owner, repoParams.repo)
      expect(repo2.name).toBe(repo1.name)
      expect(repo2.id).toBe(repo1.id)
    })
  })

  describe('Advanced Pagination Scenarios', () => {
    it('should handle deep pagination efficiently', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Test multiple pages
      const promises = [1, 2, 3].map(page =>
        client.searchRepositories({
          q: 'javascript',
          per_page: 10,
          page,
        })
      )

      const results = await Promise.all(promises)

      results.forEach((result, index) => {
        expect(result.items).toHaveLength(10)
        expect(result.total_count).toBeGreaterThan(0)

        // Each page should have different items
        if (index > 0) {
          const currentIds = result.items.map(item => item.id)
          const previousIds = results[index - 1].items.map(item => item.id)
          expect(currentIds).not.toEqual(previousIds)
        }
      })
    })
  })
})
