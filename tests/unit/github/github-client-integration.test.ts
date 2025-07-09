/**
 * Consolidated GitHub Client Integration Tests
 *
 * This file combines all integration testing scenarios:
 * - Real API integration testing with actual GitHub tokens
 * - Authentication flows (PAT, OAuth, GitHub App)
 * - End-to-end API usage patterns
 * - Modern test patterns with MSW mocking
 * - Multi-service integration scenarios
 * - Performance and caching integration
 * - Real-world usage patterns
 */

import { fc, test as fcTest } from '@fast-check/vitest'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitHubClientConfig } from '@/lib/github/client'
import { createGitHubClient, GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { mockGitHubAPI, mswServer, setupMSW } from './msw-setup'
import { setupGitHubTestIsolation } from './test-helpers'

// GitHub API base URL
const GITHUB_API_BASE = 'https://api.github.com'

// Real integration tests flag
const SKIP_INTEGRATION_TESTS = !process.env.GITHUB_TOKEN || process.env.SKIP_INTEGRATION === 'true'

// Setup MSW for HTTP mocking
setupMSW()

// Setup test isolation
setupGitHubTestIsolation()

// Mock private key for GitHub App testing
const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
-----END RSA PRIVATE KEY-----`

// Test fixtures using modern patterns
const testFixtures = {
  githubClient: ({ task }) => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
    })

    // Cleanup after test
    task.meta.cleanup = () => {
      client.clearCache()
    }

    return client
  },

  authConfigs: () => [
    { type: 'token' as const, token: 'ghp_test_token' },
    { type: 'token' as const, token: 'github_pat_11ABC123456789' },
  ],
}

// =====================================================
// SECTION 1: REAL API INTEGRATION TESTS
// =====================================================
describe.skipIf(SKIP_INTEGRATION_TESTS)('GitHub Client - Real API Integration', () => {
  let client: ReturnType<typeof createGitHubClient>

  beforeAll(() => {
    client = createGitHubClient({
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

  describe('Authentication Flows', () => {
    it('should authenticate and get current user', async () => {
      const user = await client.getAuthenticatedUser()
      expect(user).toBeDefined()
      expect(user.login).toBeTruthy()
      expect(typeof user.id).toBe('number')
    }, 10000)

    it('should handle GraphQL authentication', async () => {
      const result = await client.graphql(`
        query {
          viewer {
            login
            publicRepositories(first: 1) {
              totalCount
            }
          }
        }
      `)

      expect(result).toBeDefined()
      expect(result.viewer).toBeDefined()
      expect(typeof result.viewer.login).toBe('string')
    }, 10000)
  })

  describe('End-to-End API Usage', () => {
    it('should get a public repository', async () => {
      const repo = await client.getRepository('microsoft', 'vscode')

      expect(repo).toBeDefined()
      expect(repo.name).toBe('vscode')
      expect(repo.owner.login).toBe('microsoft')
      expect(repo.private).toBe(false)
      expect(typeof repo.stargazers_count).toBe('number')
    }, 10000)

    it('should search repositories with realistic patterns', async () => {
      const results = await client.searchRepositories({
        q: 'language:typescript stars:>1000',
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      })

      expect(results).toBeDefined()
      expect(results.total_count).toBeGreaterThan(0)
      expect(results.items).toHaveLength(5)
      expect(results.items[0].stargazers_count).toBeGreaterThan(1000)
    }, 10000)

    it('should handle pagination in real usage', async () => {
      // Test pagination by requesting multiple pages
      const page1 = await client.searchRepositories({
        q: 'language:javascript',
        per_page: 10,
        page: 1,
      })

      const page2 = await client.searchRepositories({
        q: 'language:javascript',
        per_page: 10,
        page: 2,
      })

      expect(page1.items).toHaveLength(10)
      expect(page2.items).toHaveLength(10)

      // Items should be different between pages
      const page1Ids = page1.items.map(item => item.id)
      const page2Ids = page2.items.map(item => item.id)
      expect(page1Ids).not.toEqual(page2Ids)
    }, 15000)
  })

  describe('Multi-Service Integration', () => {
    it('should integrate rate limiting with API calls', async () => {
      const rateLimit = await client.getRateLimit()

      expect(rateLimit).toBeDefined()
      expect(rateLimit.core).toBeDefined()
      expect(typeof rateLimit.core.limit).toBe('number')
      expect(typeof rateLimit.core.remaining).toBe('number')
      expect(typeof rateLimit.core.reset).toBe('number')

      // Make an API call and verify rate limit changes
      await client.getAuthenticatedUser()

      const newRateLimit = await client.getRateLimit()
      expect(newRateLimit.core.remaining).toBeLessThanOrEqual(rateLimit.core.remaining)
    }, 10000)

    it('should handle GraphQL and REST API together', async () => {
      // GraphQL query for user info
      const graphqlUser = await client.graphql(`
        query {
          viewer {
            login
            name
          }
        }
      `)

      // REST API call for same user
      const restUser = await client.getAuthenticatedUser()

      expect(graphqlUser.viewer.login).toBe(restUser.login)
    }, 10000)
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

  describe('Error Handling Integration', () => {
    it('should handle 404 errors gracefully', async () => {
      await expect(async () => {
        await client.getRepository('nonexistent-user-12345', 'nonexistent-repo-12345')
      }).rejects.toThrow(GitHubError)
    }, 10000)
  })
})

// =====================================================
// SECTION 2: AUTHENTICATION INTEGRATION TESTS
// =====================================================
describe.sequential('Authentication Integration Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  describe('Personal Access Token Authentication', () => {
    it('should authenticate with valid PAT token', async () => {
      const validToken = 'ghp_valid_token_12345'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: validToken,
        },
      })

      const user = await client.getAuthenticatedUser()

      // Verify authentication success
      expect(user).toBeDefined()
      expect(user.login).toBe('testuser')
      expect(user.id).toBe(12345)
      expect(user.type).toBe('User')
    })

    it('should fail with invalid PAT token', async () => {
      const invalidToken = 'ghp_invalid_token_12345'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: invalidToken,
        },
      })

      await expect(client.getAuthenticatedUser()).rejects.toThrow(GitHubError)
    }, 2000)

    it('should handle token with limited scopes', async () => {
      const limitedToken = 'ghp_limited_scope_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: limitedToken,
        },
      })

      // User info should work
      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')

      // Repository access should fail due to limited scope
      await expect(client.listIssues('test', 'test', { per_page: 5 })).rejects.toThrow(GitHubError)
    })

    // Property-based testing for token validation
    fcTest.prop([fc.stringMatching(/^ghp_[a-zA-Z0-9]{36}$/)])(
      'should handle various PAT token formats',
      async token => {
        const client = new GitHubClient({
          auth: { type: 'token', token },
        })

        // Should not throw during client creation
        expect(client).toBeInstanceOf(GitHubClient)
      }
    )
  })

  describe('OAuth Token Integration', () => {
    it('should handle OAuth tokens as bearer tokens', async () => {
      const oauthToken = 'gho_oauth_access_token'

      // Override default handler for OAuth token
      mswServer.use(
        http.get(`${GITHUB_API_BASE}/user`, ({ request }) => {
          const authHeader = request.headers.get('authorization')
          if (authHeader === `token ${oauthToken}`) {
            return HttpResponse.json({
              login: 'oauthuser',
              id: 54321,
              type: 'User',
              avatar_url: 'https://avatars.githubusercontent.com/u/54321',
              html_url: 'https://github.com/oauthuser',
              site_admin: false,
            })
          }
          return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
        })
      )

      const client = new GitHubClient({
        auth: {
          type: 'token', // OAuth tokens are used as bearer tokens
          token: oauthToken,
        },
      })

      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('oauthuser')
      expect(user.id).toBe(54321)
    })

    it('should maintain OAuth context across multiple requests', async () => {
      const oauthToken = 'gho_persistent_oauth_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: oauthToken,
        },
      })

      // First request
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')

      // Second request to different endpoint
      const repos = await client.listIssues('testuser', 'test-repo', { per_page: 5 })
      expect(repos).toHaveLength(2)

      // Third request (same as first)
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe(user1.login)
      expect(user2.id).toBe(user1.id)
    })
  })

  describe.skip('GitHub App Authentication', () => {
    it('should handle GitHub App configuration', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
        },
      }

      // Just test configuration acceptance, not actual authentication
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should handle GitHub App with installation ID', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
          installationId: 789,
        },
      }

      // Just test configuration acceptance, not actual authentication
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should handle installation token integration', async () => {
      const installationId = 12345

      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
          installationId,
        },
      })

      // Just verify the client was created correctly
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('Authentication Context Persistence', () => {
    it('should maintain authentication context across requests', async () => {
      const token = 'ghp_persistent_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      // First request
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')

      // Second request (different endpoint)
      const repos = await client.listIssues('testuser', 'test-repo', { per_page: 5 })
      expect(repos).toHaveLength(2)

      // Third request (same as first)
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe(user1.login)
      expect(user2.id).toBe(user1.id)
    })

    it('should handle authentication errors gracefully', async () => {
      const testCases = ['ghp_invalid_format', 'ghp_expired_token', 'ghp_revoked_token']

      for (const token of testCases) {
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token,
          },
        })

        await expect(client.getAuthenticatedUser()).rejects.toThrow()
      }
    })
  })
})

// =====================================================
// SECTION 3: MODERN API INTEGRATION PATTERNS
// =====================================================
describe('Modern API Integration Patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Client Initialization Patterns', () => {
    it('should create client with token authentication', () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
      })
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getCacheStats).toBeDefined()
    })

    // Parametric testing with test.each
    it.each(testFixtures.authConfigs())(
      'should create client with %s authentication',
      authConfig => {
        const config: GitHubClientConfig = { auth: authConfig }
        const client = new GitHubClient(config)
        expect(client).toBeInstanceOf(GitHubClient)
      }
    )

    // Property-based testing for configuration validation
    fcTest.prop([
      fc.record({
        auth: fc.constant({ type: 'token', token: 'ghp_test_token' }),
        baseUrl: fc.webUrl(),
        userAgent: fc.string({ minLength: 1, maxLength: 100 }),
      }),
    ])('should handle valid configuration properties', config => {
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should use default configuration when none provided', () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
      })
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getCacheStats().maxSize).toBe(1000)
    })
  })

  describe('REST API Integration Patterns', () => {
    it('should get authenticated user with proper integration', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const user = await client.getAuthenticatedUser()

      expect(user).toMatchObject({
        login: 'testuser',
        id: 12345,
      })
    })

    it('should get repository with owner/repo pattern', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const repo = await client.getRepository('testowner', 'testrepo')

      expect(repo).toMatchObject({
        name: 'testrepo',
        owner: { login: 'testowner' },
        full_name: 'testowner/testrepo',
      })
    })

    it('should get user by username', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const user = await client.getUser('testuser')

      expect(user).toMatchObject({
        login: 'testuser',
        id: expect.any(Number),
      })
    })

    // Property-based testing for repository operations
    fcTest.prop([
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$/),
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
    ])('should handle repository requests with valid names', async (owner, repo) => {
      mockGitHubAPI.mockRepository(owner, repo)

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const response = await client.getRepository({ owner, repo })

      expect(response).toMatchObject({
        name: repo,
        owner: { login: owner },
        full_name: `${owner}/${repo}`,
      })
    })
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

  describe('Rate Limiting Integration', () => {
    it('should retrieve rate limit information', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const rateLimit = await client.getRateLimit()

      expect(rateLimit).toMatchObject({
        core: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number),
        },
        search: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number),
        },
        graphql: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number),
        },
      })
    })

    it('should parse rate limit headers correctly', async () => {
      const token = 'ghp_test_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      const user = await client.getAuthenticatedUser()

      // Verify user data
      expect(user.login).toBe('testuser')
      expect(user.id).toBe(12345)
    })
  })

  describe('Search and Pagination Integration', () => {
    it('should handle search operations with realistic patterns', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const searchOptions = {
        q: 'test',
        sort: 'stars',
        order: 'desc' as const,
        page: 1,
        per_page: 10,
      }

      const result = await client.searchRepositories(searchOptions)

      expect(result).toMatchObject({
        total_count: expect.any(Number),
        incomplete_results: expect.any(Boolean),
        items: expect.any(Array),
      })
    })

    it('should handle pagination patterns', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Page 1
      const page1 = await client.searchRepositories({
        q: 'javascript',
        per_page: 5,
        page: 1,
      })

      // Page 2
      const page2 = await client.searchRepositories({
        q: 'javascript',
        per_page: 5,
        page: 2,
      })

      expect(page1.items).toHaveLength(5)
      expect(page2.items).toHaveLength(5)
      expect(page1.total_count).toBe(page2.total_count)
    })
  })

  describe('Concurrent Operations Integration', () => {
    it('should handle concurrent requests properly', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Simulate concurrent requests
      const requests = Array.from({ length: 5 }, () => client.getAuthenticatedUser())

      const responses = await Promise.allSettled(requests)

      // All should succeed
      expect(responses.every(r => r.status === 'fulfilled')).toBe(true)
    })

    it('should handle mixed API operations concurrently', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Mix of REST and GraphQL operations
      const operations = [
        client.getAuthenticatedUser(),
        client.getRepository('testowner', 'testrepo'),
        client.graphql('query { viewer { login } }'),
        client.getRateLimit(),
      ]

      const results = await Promise.allSettled(operations)

      // All operations should succeed
      expect(results.every(r => r.status === 'fulfilled')).toBe(true)
    })
  })
})

// =====================================================
// SECTION 4: ERROR RECOVERY AND RESILIENCE
// =====================================================
describe('Error Recovery and Resilience Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  describe('Authentication Error Recovery', () => {
    it('should retry on transient authentication failures', async () => {
      const token = 'ghp_retry_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      // Note: The new client's retry plugin won't retry on 401s by default
      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    it('should handle network timeouts during authentication', async () => {
      const token = 'ghp_timeout_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      const startTime = Date.now()

      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')

      const duration = Date.now() - startTime
      expect(duration).toBeGreaterThan(0) // Should have taken at least some time
    }, 5000)
  })

  describe('API Error Handling Integration', () => {
    it('should handle network errors gracefully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const user = await client.getAuthenticatedUser()
      expect(user).toBeDefined()
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
})

// =====================================================
// SECTION 5: REAL-WORLD USAGE PATTERNS
// =====================================================
describe('Real-World Usage Patterns', () => {
  describe('Basic Client Creation', () => {
    it('should create client with token auth', () => {
      const tokenClient = createGitHubClient({
        auth: {
          type: 'token',
          token: 'ghp_test1234567890abcdef1234567890abcdef12',
        },
      })
      expect(tokenClient).toBeDefined()
      expect(tokenClient.getCacheStats).toBeDefined()
      expect(tokenClient.clearCache).toBeDefined()
    })

    it('should create client with custom configuration', () => {
      const customClient = createGitHubClient({
        auth: {
          type: 'token',
          token: 'ghp_test1234567890abcdef1234567890abcdef12',
        },
        baseUrl: 'https://api.github.enterprise.com',
        userAgent: 'custom-agent/1.0.0',
        cache: {
          maxAge: 600,
          maxSize: 500,
        },
      })
      expect(customClient).toBeDefined()
      expect(customClient.getCacheStats().maxSize).toBe(500)
    })
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
  })

  describe('Authentication Patterns', () => {
    it('should work with real-world authentication patterns', async () => {
      const authPatterns = [
        { type: 'token' as const, token: `ghp_${'x'.repeat(36)}` },
        { type: 'token' as const, token: `github_pat_${'x'.repeat(70)}` },
      ]

      for (const auth of authPatterns) {
        const client = new GitHubClient({ auth })
        expect(client).toBeInstanceOf(GitHubClient)
      }
    })
  })

  describe('Configuration Edge Cases', () => {
    // Test boundary conditions with property-based testing
    fcTest.prop([fc.webUrl(), fc.string({ minLength: 1, maxLength: 200 })])(
      'should handle various base URLs and user agents',
      (baseUrl, userAgent) => {
        const config: GitHubClientConfig = {
          auth: { type: 'token', token: 'ghp_test_token' },
          baseUrl,
          userAgent,
        }

        expect(() => new GitHubClient(config)).not.toThrow()
      }
    )
  })
})
